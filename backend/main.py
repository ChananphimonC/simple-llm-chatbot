import base64
import io
import hashlib
import json
import logging
import time
import wave
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

# Must run before importing any local module that reads os.getenv(...) at
# import time (auth.py's JWT_SECRET, database.py's DATABASE_URL) - otherwise
# those reads see an unset env var and silently fall back to their hardcoded
# defaults regardless of what .env actually says.
load_dotenv()

import os

import redis
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from google import genai
from google.genai import types
from google.genai.errors import APIError, ClientError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import MAX_PASSWORD_BYTES, create_access_token, get_current_user, hash_password, verify_password
from database import Base, engine, get_db
from models import Conversation, Message, User

logger = logging.getLogger("uvicorn.error")

Base.metadata.create_all(bind=engine)  # lab-simple schema sync; a real app would use Alembic migrations

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"), decode_responses=True)

# Free-tier quota errors (429) aren't worth retrying: the SDK's default of 5
# attempts with exponential backoff just makes a doomed request take ~30s+
# before failing anyway. Fail fast instead.
NO_RETRY = types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1))

HISTORY_CACHE_TTL = 60 * 10  # 10 minutes


# ---------- Auth ----------

class RegisterRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    username = req.username.strip()
    password_bytes = len(req.password.encode("utf-8"))
    if not username or password_bytes < 8:
        raise HTTPException(status_code=400, detail="ชื่อผู้ใช้ต้องไม่ว่าง และรหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
    if password_bytes > MAX_PASSWORD_BYTES:
        raise HTTPException(status_code=400, detail=f"รหัสผ่านต้องยาวไม่เกิน {MAX_PASSWORD_BYTES} ตัวอักษร")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="ชื่อผู้ใช้นี้มีคนใช้แล้ว")

    user = User(username=username, hashed_password=hash_password(req.password))
    db.add(user)
    db.commit()
    return {"access_token": create_access_token(user.username), "token_type": "bearer"}


@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    return {"access_token": create_access_token(user.username), "token_type": "bearer"}


# ---------- Conversations ----------

@app.post("/conversations")
def create_conversation(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    convo = Conversation(user_id=user.id)
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return {"conversation_id": convo.id}


PREVIEW_LENGTH = 60
TITLE_MAX_LENGTH = 60


def _conversation_summary(convo: Conversation) -> dict:
    first_user_message = next((m.content for m in convo.messages if m.role == "user"), None)
    preview = (first_user_message or "แชทใหม่")[:PREVIEW_LENGTH]
    return {
        "conversation_id": convo.id,
        "created_at": convo.created_at.isoformat(),
        "preview": preview,
        "title": convo.title,
        "pinned": convo.pinned,
    }


@app.get("/conversations")
def list_conversations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    convos = (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.pinned.desc(), Conversation.id.desc())
        .all()
    )
    return [_conversation_summary(convo) for convo in convos]


def _get_owned_conversation(db: Session, conversation_id: int, user: User) -> Conversation:
    convo = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user.id)
        .first()
    )
    if not convo:
        raise HTTPException(status_code=404, detail="ไม่พบบทสนทนานี้")
    return convo


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    pinned: bool | None = None


@app.patch("/conversations/{conversation_id}")
def update_conversation(
    conversation_id: int,
    req: UpdateConversationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    convo = _get_owned_conversation(db, conversation_id, user)
    if req.title is not None:
        title = req.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="ชื่อแชทต้องไม่ว่าง")
        convo.title = title[:TITLE_MAX_LENGTH]
    if req.pinned is not None:
        convo.pinned = req.pinned
    db.commit()
    db.refresh(convo)
    return _conversation_summary(convo)


@app.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    convo = _get_owned_conversation(db, conversation_id, user)
    db.delete(convo)
    db.commit()
    _invalidate_history_cache(conversation_id)
    return {"status": "ok"}


@app.get("/conversations/{conversation_id}/messages")
def get_messages(conversation_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    convo = _get_owned_conversation(db, conversation_id, user)
    return [{"role": m.role, "content": m.content} for m in convo.messages]


# ---------- Chat (with memory) ----------

class ChatRequest(BaseModel):
    conversation_id: int
    message: str
    image: str | None = None  # base64 (no data: prefix) camera frame
    image_mime: str = "image/jpeg"
    accessibility: bool = False  # visually-impaired mode: spoken, spatial, markdown-free replies


MAX_IMAGE_BASE64_CHARS = 8 * 1024 * 1024  # ~6 MB decoded; frontend downsizes well below this
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}

ACCESSIBILITY_INSTRUCTION = (
    "ผู้ใช้เป็นผู้พิการทางสายตาและฟังคำตอบด้วยเสียงอ่านออกเสียง (text-to-speech) "
    "ตอบเป็นภาษาเดียวกับผู้ใช้ กระชับ ชัดเจน เป็นประโยคสั้นๆ ห้ามใช้ markdown สัญลักษณ์ ตาราง หรืออีโมจิ "
    "เมื่อได้รับรูปภาพจากกล้อง: เริ่มจากสิ่งสำคัญที่สุดหรือสิ่งที่อาจเป็นอันตราย (บันได ขั้น ยานพาหนะ สิ่งกีดขวาง) "
    "บอกตำแหน่งแบบเทียบกับผู้ใช้ (ซ้าย ขวา ตรงหน้า ใกล้ ไกล โดยประมาณ) อ่านข้อความในภาพออกมาตรงๆ "
    "ระบุสี จำนวน และป้ายต่างๆ ถ้าภาพมืด เบลอ หรือไม่ชัด ให้บอกตรงๆ และแนะนำให้ขยับกล้องหรือถ่ายใหม่ "
    "อย่าเดาในสิ่งที่มองไม่เห็นชัดเจน โดยเฉพาะข้อมูลที่เกี่ยวกับความปลอดภัย ยา หรือเงิน ให้แนะนำให้ตรวจสอบกับคนที่ไว้ใจได้"
)


def _history_cache_key(conversation_id: int) -> str:
    return f"conv:{conversation_id}:history"


def _get_history(db: Session, conversation_id: int) -> list[dict]:
    cache_key = _history_cache_key(conversation_id)
    try:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except redis.RedisError:
        logger.warning("Redis unavailable, falling back to Postgres for history", exc_info=True)

    messages = (
        db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.id).all()
    )
    history = [{"role": m.role, "content": m.content} for m in messages]
    try:
        redis_client.setex(cache_key, HISTORY_CACHE_TTL, json.dumps(history))
    except redis.RedisError:
        logger.warning("Redis unavailable, skipping history cache write", exc_info=True)
    return history


def _invalidate_history_cache(conversation_id: int) -> None:
    try:
        redis_client.delete(_history_cache_key(conversation_id))
    except redis.RedisError:
        logger.warning("Redis unavailable, could not invalidate history cache", exc_info=True)


@app.post("/chat")
def chat(req: ChatRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    convo = _get_owned_conversation(db, req.conversation_id, user)
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="ข้อความว่างเปล่า")

    history = _get_history(db, convo.id)
    contents = [
        types.Content(role=("user" if h["role"] == "user" else "model"), parts=[types.Part(text=h["content"])])
        for h in history
    ]
    user_parts = [types.Part(text=message)]
    if req.image:
        if req.image_mime not in ALLOWED_IMAGE_MIMES:
            raise HTTPException(status_code=400, detail="รองรับเฉพาะรูป JPEG, PNG หรือ WebP")
        if len(req.image) > MAX_IMAGE_BASE64_CHARS:
            raise HTTPException(status_code=413, detail="รูปภาพใหญ่เกินไป ลองถ่ายใหม่")
        try:
            image_bytes = base64.b64decode(req.image, validate=True)
        except ValueError:
            raise HTTPException(status_code=400, detail="ข้อมูลรูปภาพไม่ถูกต้อง")
        user_parts.append(types.Part.from_bytes(data=image_bytes, mime_type=req.image_mime))
    contents.append(types.Content(role="user", parts=user_parts))

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                http_options=NO_RETRY,
                system_instruction=ACCESSIBILITY_INSTRUCTION if req.accessibility else None,
            ),
        )
        reply = response.text
    except ClientError as e:
        if e.code == 429:
            raise HTTPException(
                status_code=429,
                detail="ใช้โควต้า Gemini ฟรีของวันนี้หมดแล้ว ลองใหม่พรุ่งนี้ หรืออัปเกรดแพลนใน Google AI Studio",
            )
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e.message}")
    except APIError:
        raise HTTPException(status_code=502, detail="Gemini เซิร์ฟเวอร์ไม่ว่างชั่วคราว ลองใหม่อีกครั้ง")
    except HTTPException:
        raise
    except Exception:
        # Anything else (network hiccup, SDK edge case, timeout, ...) must still
        # come back as a normal JSON error response: an exception that escapes here
        # bypasses CORSMiddleware and the browser sees a broken response instead of
        # a readable error (fetch throws "Failed to fetch" or a JSON parse error).
        logger.exception("Unhandled error in /chat")
        raise HTTPException(status_code=500, detail="เกิดข้อผิดพลาดที่ไม่คาดคิด ลองใหม่อีกครั้ง")

    stored_message = f"📷 {message}" if req.image else message
    db.add(Message(conversation_id=convo.id, role="user", content=stored_message))
    db.add(Message(conversation_id=convo.id, role="model", content=reply))
    db.commit()
    _invalidate_history_cache(convo.id)

    return {"reply": reply}


# Per-user fixed-window limiter so one client can't burn the shared Gemini quota.
def _rate_limit(bucket: str, user_id: int, limit: int, window: int = 60) -> None:
    key = f"rl:{bucket}:{user_id}:{int(time.time() // window)}"
    try:
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, window * 2)
    except redis.RedisError:
        return  # fail open: a Redis hiccup shouldn't take voice down
    if count > limit:
        raise HTTPException(status_code=429, detail="ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่")


# ---------- Text-to-speech (Gemini TTS) ----------

# Models are env-configurable so a preview model can be swapped for a stable one without a deploy.
TTS_MODELS = [m.strip() for m in os.getenv("TTS_MODELS", "gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts").split(",") if m.strip()]
TTS_VOICE = os.getenv("TTS_VOICE", "Kore")
TTS_CACHE_TTL = 60 * 60 * 24 * 7  # replies repeat constantly (greetings, "repeat that"), so cache the audio
redis_bytes = redis.from_url(os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"))  # raw bytes, no decoding
TTS_MAX_CHARS = 1500
# Gemini TTS follows natural-language style directions placed before the text.
TTS_STYLE = "Read the following aloud in a clear, crisp, articulate and friendly voice, at a lively natural pace: "


class TTSRequest(BaseModel):
    text: str


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


@app.post("/tts")
def tts(req: TTSRequest, user: User = Depends(get_current_user)):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="ข้อความว่างเปล่า")
    if len(text) > TTS_MAX_CHARS:
        raise HTTPException(status_code=413, detail="ข้อความยาวเกินไปสำหรับอ่านออกเสียง")
    _rate_limit("tts", user.id, limit=60)
    cache_key = "tts:" + hashlib.sha256(f"{TTS_VOICE}|{TTS_STYLE}|{text}".encode()).hexdigest()
    try:
        cached = redis_bytes.get(cache_key)
        if cached:
            return Response(content=cached, media_type="audio/wav", headers={"X-Cache": "HIT"})
    except redis.RedisError:
        logger.warning("TTS cache read failed", exc_info=True)
    try:
        response = None
        for i, model in enumerate(TTS_MODELS):  # each model has its own quota; fall through on quota/overload
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=TTS_STYLE + text,
                    config=types.GenerateContentConfig(
                        response_modalities=["AUDIO"],
                        speech_config=types.SpeechConfig(
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=TTS_VOICE)
                            )
                        ),
                        http_options=NO_RETRY,
                    ),
                )
                break
            except APIError as e:
                logger.warning("tts model %s failed (%s)", model, e.code)
                if e.code not in (404, 429, 500, 502, 503, 504) or i + 1 == len(TTS_MODELS):
                    raise
        inline = response.candidates[0].content.parts[0].inline_data
        rate = 24000
        if inline.mime_type and "rate=" in inline.mime_type:
            rate = int(inline.mime_type.split("rate=")[1].split(";")[0])
        wav = _pcm_to_wav(inline.data, rate)
        try:
            redis_bytes.set(cache_key, wav, ex=TTS_CACHE_TTL)
        except redis.RedisError:
            logger.warning("TTS cache write failed", exc_info=True)
        return Response(content=wav, media_type="audio/wav", headers={"X-Cache": "MISS"})
    except ClientError as e:
        if e.code == 429:
            raise HTTPException(status_code=429, detail="โควต้าเสียงพูดของ Gemini หมดชั่วคราว")
        raise HTTPException(status_code=502, detail=f"Gemini TTS error: {e.message}")
    except Exception:
        logger.exception("Unhandled error in /tts")
        raise HTTPException(status_code=502, detail="สร้างเสียงพูดไม่สำเร็จ")


# ---------- Speech-to-text (Gemini) ----------

STT_MODELS = [m.strip() for m in os.getenv("STT_MODELS", "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash").split(",") if m.strip()]
STT_MAX_BYTES = 4_000_000  # ~ a few minutes of Opus/AAC; the client stops at 30s anyway
STT_PROMPT = (
    "Transcribe this audio verbatim. The speaker mainly speaks {lang} and may mix in English words "
    "or product names - keep those in Latin letters. Use natural punctuation, write numbers as digits, "
    "and do not add spaces between Thai words within a phrase. Do not translate, summarize, or answer. "
    "Ignore background noise. If there is no intelligible speech, output nothing. "
    "Output only the transcript."
)


class STTRequest(BaseModel):
    audio: str  # base64
    mime_type: str = "audio/webm"
    lang: str = "th-TH"


@app.post("/stt")
def stt(req: STTRequest, user: User = Depends(get_current_user)):
    try:
        data = base64.b64decode(req.audio, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="ข้อมูลเสียงไม่ถูกต้อง")
    if not data:
        return {"text": ""}
    if len(data) > STT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="เสียงยาวเกินไป")
    mime = req.mime_type.split(";")[0].strip() or "audio/webm"
    lang = "Thai" if req.lang.lower().startswith("th") else "English"
    _rate_limit("stt", user.id, limit=40)
    started = time.monotonic()
    try:
        # Overloaded (503) or 429 on one model: fail over to the next instead of failing the utterance.
        response = None
        for i, model in enumerate(STT_MODELS):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[types.Part.from_bytes(data=data, mime_type=mime), STT_PROMPT.format(lang=lang)],
                    config=types.GenerateContentConfig(temperature=0, http_options=NO_RETRY),
                )
                break
            except APIError as e:
                retryable = e.code in (404, 429, 500, 502, 503, 504)
                logger.warning("stt model %s failed (%s)%s", model, e.code, ", trying next" if retryable and i + 1 < len(STT_MODELS) else "")
                if not retryable or i + 1 == len(STT_MODELS):
                    raise
        text = " ".join((response.text or "").split())
        logger.info("stt ok: %d bytes audio, %.0f ms, %d chars", len(data), (time.monotonic() - started) * 1000, len(text))
        return {"text": text}
    except ClientError as e:
        if e.code == 429:
            raise HTTPException(status_code=429, detail="โควต้าถอดเสียงของ Gemini หมดชั่วคราว")
        raise HTTPException(status_code=502, detail=f"Gemini STT error: {e.message}")
    except Exception:
        logger.exception("Unhandled error in /stt")
        raise HTTPException(status_code=502, detail="ถอดเสียงไม่สำเร็จ")


# ---------- Gemini Live (real-time voice) ----------
#
# The browser talks to Gemini Live directly over a WebSocket (no hop through this server, which is
# the biggest single latency win). To keep GOOGLE_API_KEY off the client we mint a short-lived,
# single-use ephemeral token here, and lock the whole session config into it: the client cannot
# change the system prompt, tools, voice or VAD settings, whatever it sends.

LIVE_MODEL = os.getenv("LIVE_MODEL", "gemini-3.1-flash-live-preview")
LIVE_VOICE = os.getenv("LIVE_VOICE", TTS_VOICE)
# How long Gemini waits after you stop talking before it answers. Lower = snappier but cuts off
# people who pause mid-sentence; Thai speakers pause a lot, so 500ms is the floor worth trying.
LIVE_SILENCE_MS = int(os.getenv("LIVE_SILENCE_MS", "500"))
# Reasoning before speaking is pure latency in a voice chat. Set empty to omit if the model rejects it.
LIVE_THINKING_LEVEL = os.getenv("LIVE_THINKING_LEVEL", "MINIMAL").strip().upper()
LIVE_SESSION_MINUTES = 30

LIVE_INSTRUCTION = ACCESSIBILITY_INSTRUCTION + (
    " นี่คือการสนทนาด้วยเสียงแบบเรียลไทม์ ตอบสั้น กระชับ เป็นธรรมชาติ ไม่เกิน 2-3 ประโยค "
    "เว้นแต่ผู้ใช้ขอให้อธิบายละเอียด และผู้ใช้พูดแทรกได้ทุกเมื่อ "
    "เมื่อผู้ใช้ขอเปิดหรือปิดกล้อง หรือสลับกล้องหน้า/หลัง ให้เรียกฟังก์ชัน set_camera ทันทีโดยไม่ต้องถามยืนยัน "
    "เมื่อกล้องเปิดอยู่ คุณจะได้รับภาพล่าสุดจากกล้องประมาณวินาทีละหนึ่งภาพ ให้ใช้ภาพล่าสุดตอบคำถามเกี่ยวกับสิ่งที่อยู่ตรงหน้า "
    "ถ้าผู้ใช้ถามว่าเห็นอะไรหรือให้อ่านข้อความแต่กล้องยังปิดอยู่ ให้เรียก set_camera เพื่อเปิดกล้องหลังก่อน แล้วจึงตอบ"
)

SET_CAMERA_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="set_camera",
            description="Open or close the device camera, or switch between the front and back camera. "
            "While the camera is open the user's latest camera frame is streamed to you.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "open": types.Schema(type=types.Type.BOOLEAN, description="true to open/keep open, false to close"),
                    "facing": types.Schema(
                        type=types.Type.STRING,
                        enum=["back", "front"],
                        description="Which camera when opening. Default back.",
                    ),
                },
                required=["open"],
            ),
        )
    ]
)


def _live_connect_config() -> types.LiveConnectConfig:
    cfg = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=LIVE_INSTRUCTION,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=LIVE_VOICE))
        ),
        # Transcripts are what get saved to the conversation and shown in the chat.
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
                prefix_padding_ms=100,
                silence_duration_ms=LIVE_SILENCE_MS,
            )
        ),
        # Audio+video sessions are time-limited without this; sliding-window compression keeps them going.
        context_window_compression=types.ContextWindowCompressionConfig(sliding_window=types.SlidingWindow()),
        tools=[SET_CAMERA_TOOL],
    )
    if LIVE_THINKING_LEVEL in types.ThinkingLevel.__members__:
        cfg.thinking_config = types.ThinkingConfig(thinking_level=types.ThinkingLevel[LIVE_THINKING_LEVEL])
    return cfg


@app.post("/live/token")
def live_token(user: User = Depends(get_current_user)):
    _rate_limit("live", user.id, limit=6)
    now = datetime.now(timezone.utc)
    try:
        token = client.auth_tokens.create(
            config=types.CreateAuthTokenConfig(
                uses=1,
                expire_time=now + timedelta(minutes=LIVE_SESSION_MINUTES),
                new_session_expire_time=now + timedelta(minutes=1),
                live_connect_constraints=types.LiveConnectConstraints(model=LIVE_MODEL, config=_live_connect_config()),
                http_options=types.HttpOptions(
                    api_version="v1alpha", retry_options=types.HttpRetryOptions(attempts=1)
                ),
            )
        )
    except ClientError as e:
        if e.code == 429:
            raise HTTPException(status_code=429, detail="โควต้า Gemini หมดชั่วคราว ลองใหม่ภายหลัง")
        raise HTTPException(status_code=502, detail=f"Gemini token error: {e.message}")
    except Exception:
        logger.exception("Unhandled error in /live/token")
        raise HTTPException(status_code=502, detail="ขอสิทธิ์เชื่อมต่อเสียงสดไม่สำเร็จ")
    return {"token": token.name, "model": LIVE_MODEL}


class TurnRequest(BaseModel):
    user: str = ""
    model: str = ""


@app.post("/conversations/{conversation_id}/turns")
def save_turn(
    conversation_id: int,
    req: TurnRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Persist one voice exchange (Live transcripts) so it shows up in history like a typed chat."""
    convo = _get_owned_conversation(db, conversation_id, user)
    said, replied = req.user.strip()[:4000], req.model.strip()[:8000]
    if not said and not replied:
        raise HTTPException(status_code=400, detail="ไม่มีข้อความให้บันทึก")
    if said:
        db.add(Message(conversation_id=convo.id, role="user", content=said))
    if replied:
        db.add(Message(conversation_id=convo.id, role="model", content=replied))
    db.commit()
    _invalidate_history_cache(convo.id)
    return {"status": "ok"}


@app.get("/")
def health():
    return {"status": "ok"}
