# Lumina AI

A lightweight chat interface over Google Gemini — type a message, get a reply, optionally hear it spoken back. Built as Lab 1 of an AI engineering track: LangChain-free basics, prompting, and full-stack API integration.

```
Frontend (React + Vite) → Backend (FastAPI) → Gemini API
```

## Demo

Voice output in action — Lumina reads its own replies out loud, switching voice between Thai and English mid-sentence:

![Lumina AI demo: chatting and voice output](docs/demo.gif)

## What it does

- **Chat UI** — messages appear as left/right bubbles, Gemini's replies rendered from Markdown (headings, bold, lists) instead of raw `###`/`**` symbols.
- **Voice output (TTS)** — every reply can be read aloud via the browser's Web Speech API. Thai and English are auto-detected per segment so mixed-language replies don't get mispronounced in the wrong accent. Each message has a replay/stop button, and a global toggle turns auto-speak on/off.
- **Suggested prompts** — a few starter chips so a new chat isn't a blank box.
- **Graceful errors** — free-tier Gemini quota exhausted (429) and upstream Gemini outages (5xx) surface as readable in-chat error messages instead of a silent failure.
- **Stateless backend** — no database, no server-side memory. Each `/chat` request is independent; the frontend only keeps message history in memory for the current tab (a refresh clears it).

## Stack

- **Backend:** FastAPI + [google-genai](https://pypi.org/project/google-genai/) SDK, model `gemini-3.6-flash`
- **Frontend:** React (Vite), Tailwind CSS, `react-markdown`
- **Design system:** "Ethereal Glass Lumina" — documented in [`DESIGN.md`](DESIGN.md); product rationale in [`PRODUCT.md`](PRODUCT.md)

## Running locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # then fill in GOOGLE_API_KEY
uvicorn main:app --reload
```

Get a free API key at [aistudio.google.com](https://aistudio.google.com) → Get API Key.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_URL points at the backend
npm run dev
```

## Deploy

- Backend → Railway (root directory `backend`, set `GOOGLE_API_KEY` env var)
- Frontend → Vercel (root directory `frontend`, set `VITE_API_URL` env var to the Railway URL)
