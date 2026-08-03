# ⚡ JagX AI — Realtime Free Full-Stack AI
Chat + advice + voice • Images • Video • Code • Site/App builder • Open public API.
**100% free. No model API keys. No auth. No database.**

## Free stack
- AI text (streaming) + images: keyless free relays (Pollinations) — zero keys
- Voice talk/listen: browser Web Speech API (free)
- Video: AI frames + in-browser Canvas/MediaRecorder rendering (free)
- API keys: stateless HMAC-signed (no DB)
- Hosting: Render / Koyeb / Vercel free tiers

## Run
npm install && npm start

## Host free (Render.com)
1. Push this folder to GitHub
2. render.com → New → Web Service → connect repo
3. Build: `npm install` • Start: `npm start` (Node ≥ 18)
4. Optional env: JAGX_SECRET (unique key-signing secret)
5. Deploy → your JagX AI is live at https://xxxx.onrender.com

## Public API (anyone can generate a free key in-app → API Keys)
POST /v1/chat   (header x-jagx-key)  •  GET /v1/image?prompt=...  (header x-jagx-key)
