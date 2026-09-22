# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single primary user: the developer themself, using the app personally rather than distributing it to others. No other audiences are confirmed.

## Product Purpose

A lightweight, general-purpose chat interface over Google Gemini. It exists to give quick, low-friction access to the model — asking a question, drafting something, or just talking through a thought — without the overhead of a full product. Success is a fast, pleasant round trip from typing a message to reading a reply.

## Positioning

Not a competitive product; there is no market position to defend. Its differentiator, if any, is minimalism: it does only "type a message, get a reply," deliberately without the accounts, history, and chrome that surround most chat products.

## Operating Context

Runs locally: a FastAPI backend (`backend/main.py`) calling the Gemini API, and a Vite + React frontend (`frontend/`). The UI is bilingual-friendly — Thai placeholder copy alongside English — since the primary user moves between both languages.

## Capabilities and Constraints

- No authentication. There is no login and no concept of separate accounts.
- No persistent conversation history. Each `/chat` request is stateless server-side; the frontend only holds messages in memory for the current browser session, and a refresh clears them.
- Requires a `GOOGLE_API_KEY` (Gemini) to function; no other external services.
- Single conversation at a time, no multi-session or multi-tab sync.

## Brand Commitments

The product is named **Lumina AI** in the UI (adopted from the reference mockup that shaped `DESIGN.md`'s "Ethereal Glass Lumina" visual system). No other naming, logo, or identity commitments exist beyond that.

## Evidence on Hand

No real user content, testimonials, or usage data exists — this is a personal tool with a single user. Do not fabricate any.

## Product Principles

1. Stay minimal — resist adding accounts, persistence, or settings the single-user, no-history brief doesn't call for.
2. One clear action per screen: type, send, read. Nothing should compete with that loop.
3. Bilingual by default (Thai/English) without forcing full localization of either.
4. Fast feels better than featureful — this is a quick-access tool, not a platform to grow.
