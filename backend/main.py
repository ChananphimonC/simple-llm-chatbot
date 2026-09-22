from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.genai.errors import ClientError
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

# Free-tier quota errors (429) aren't worth retrying: the SDK's default of 5
# attempts with exponential backoff just makes a doomed request take ~30s+
# before failing anyway. Fail fast instead.
NO_RETRY = types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1))

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
def chat(req: ChatRequest):
    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=req.message,
            config=types.GenerateContentConfig(http_options=NO_RETRY),
        )
    except ClientError as e:
        if e.code == 429:
            raise HTTPException(
                status_code=429,
                detail="ใช้โควต้า Gemini ฟรีของวันนี้หมดแล้ว ลองใหม่พรุ่งนี้ หรืออัปเกรดแพลนใน Google AI Studio",
            )
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e.message}")
    return {"reply": response.text}

@app.get("/")
def health():
    return {"status": "ok"}