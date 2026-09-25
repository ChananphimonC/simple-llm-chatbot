import json
import logging

from dotenv import load_dotenv

# Must run before importing any local module that reads os.getenv(...) at
# import time (auth.py's JWT_SECRET, database.py's DATABASE_URL) - otherwise
# those reads see an unset env var and silently fall back to their hardcoded
# defaults regardless of what .env actually says.
load_dotenv()

import os

import redis
from fastapi import Depends, FastAPI, HTTPException
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
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=contents,
            config=types.GenerateContentConfig(http_options=NO_RETRY),
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

    db.add(Message(conversation_id=convo.id, role="user", content=message))
    db.add(Message(conversation_id=convo.id, role="model", content=reply))
    db.commit()
    _invalidate_history_cache(convo.id)

    return {"reply": reply}


@app.get("/")
def health():
    return {"status": "ok"}
