/* ============================================================
   JagX AI — free full-stack AI engine (NO model API keys)
   Text+Images via keyless free relays • Stateless signed API keys
============================================================ */
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const { Readable } = require('stream');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JAGX_SECRET || 'jagx-free-open-secret-v1';

const SYSTEM = `You are JagX AI — a realtime, full-stack AI companion: brilliant, warm, direct.
You help with knowledge, coding, building apps/sites, images, video ideas, business and life.
You PROACTIVELY give users practical advice and tips beyond the literal question.
Format with markdown when helpful (headings, bullets, code fences). Be concise but complete.`;

/* ---------------- stateless API keys (no DB, free forever) ---------------- */
const sign = d => crypto.createHmac('sha256', SECRET).update(d).digest('hex').slice(0, 40);
function verifyKey(key){
  try{
    const m = String(key || '').match(/^jagx_([A-Za-z0-9\-_]+)_([a-f0-9]{40})$/);
    return !!m && sign(m[1]) === m[2];
  }catch{ return false; }
}
function requireKey(req, res, next){
  const key = req.get('x-jagx-key') || req.query.key;
  if(!verifyKey(key)) return res.status(401).json({ error: 'Invalid JagX API key. Generate one free in the JagX app → API Keys.' });
  next();
}

/* ---------------- tiny in-memory rate limiter (abuse protection) ---------------- */
const RL = new Map();
function rateLimit(max, win = 60000){
  return (req, res, next) => {
    const now = Date.now(), e = RL.get(req.ip) || { t: now, c: 0 };
    if(now - e.t > win){ e.t = now; e.c = 0; }
    e.c++; RL.set(req.ip, e);
    if(e.c > max) return res.status(429).json({ error: 'Rate limit exceeded — slow down a bit.' });
    next();
  };
}

/* ---------------- realtime chat relay (streaming SSE, keyless upstream) ---------------- */
async function chatHandler(req, res){
  const messages = (req.body && req.body.messages) || [];
  if(!messages.length) return res.status(400).json({ error: 'messages required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if(res.flushHeaders) res.flushHeaders();
  try{
    const up = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', stream: true, messages: [{ role: 'system', content: SYSTEM }, ...messages] })
    });
    if(!up.ok || !up.body) throw new Error('upstream ' + up.status);
    Readable.fromWeb(up.body).pipe(res);
  }catch(err){
    try{ // fallback 1: keyless plain endpoint
      const last = [...messages].reverse().find(m => m.role === 'user');
      const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(last?.content || 'hello'));
      const text = await r.text();
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
    }catch(e){ // fallback 2: graceful notice
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '⚠️ The free AI relay is busy right now — please try again in a few seconds.' } }] }) + '\n\n');
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

/* ---------------- free image engine proxy (keyless upstream) ---------------- */
async function imageHandler(req, res){
  const q = req.query, prompt = q.prompt || q.q;
  if(!prompt) return res.status(400).json({ error: 'prompt required' });
  const w = Math.min(2048, +q.width  || 1024);
  const h = Math.min(2048, +q.height || 1024);
  const seed  = q.seed || Math.floor(Math.random() * 1e6);
  const model = q.model === 'turbo' ? 'turbo' : 'flux';
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&model=${model}&nologo=true`;
  try{
    const up = await fetch(url);
    if(!up.ok) throw new Error(up.status);
    const buf = Buffer.from(await up.arrayBuffer());
    res.setHeader('Content-Type', up.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buf);
  }catch(e){ res.status(502).json({ error: 'image generation failed — retry' }); }
}

/* ---------------- routes ---------------- */
app.use('/v1', (req, res, next) => {           // public developer API (CORS-open)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if(req.method === 'OPTIONS') return res.end();
  next();
});

app.get('/api/health', (req, res) => res.json({ name: 'JagX AI', status: 'online', free: true, auth: false, realtime: true }));

app.post('/api/keys', rateLimit(10), (req, res) => {
  const name = String(req.body?.name || 'key').slice(0, 40);
  const payload = Buffer.from(JSON.stringify({ id: crypto.randomBytes(6).toString('hex'), name, t: Date.now() })).toString('base64url');
  res.json({ key: `jagx_${payload}_${sign(payload)}`, name });
});

app.post('/api/chat',  rateLimit(60), chatHandler);
app.get ('/api/image', rateLimit(80), imageHandler);
app.post('/v1/chat',   rateLimit(60), requireKey, chatHandler);   // public API with JagX key
app.get ('/v1/image',  rateLimit(80), requireKey, imageHandler);  // public API with JagX key

app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log('⚡ JagX AI online on :' + PORT));
