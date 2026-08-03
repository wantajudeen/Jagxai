/* ============================================================
   JagX AI — free full-stack AI engine (NO model API keys)
   Multi-provider failover: DuckDuckGo AI + Pollinations + HF FLUX
============================================================ */
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JAGX_SECRET || 'jagx-free-open-secret-v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const timeout = ms => AbortSignal.timeout(ms);

const SYSTEM = `You are JagX AI — a realtime, full-stack AI companion: brilliant, warm, direct.
You help with knowledge, coding, building apps/sites, images, video ideas, business and life.
You PROACTIVELY give users practical advice and tips beyond the literal question.
Format with markdown when helpful (headings, bullets, code fences). Be concise but complete.`;

/* ---------------- stateless API keys ---------------- */
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

/* ================= TEXT PROVIDERS (keyless, with failover) ================= */
/* 1) DuckDuckGo DuckChat — free, no key */
async function ddgStream(messages, emit){
  const status = await fetch('https://duckduckgo.com/duckchat/v1/status', { headers:{ 'User-Agent':UA, 'x-vqd-accept':'true' }, signal: timeout(15000) });
  const vqd = status.headers.get('x-vqd-4');
  if(!vqd) throw new Error('no vqd');
  const sys = messages.find(m => m.role === 'system');
  let rest = messages.filter(m => m.role !== 'system');
  if(sys && rest[0]?.role === 'user') rest[0] = { ...rest[0], content: sys.content + '\n\nUser question: ' + rest[0].content };
  const models = ['gpt-4o-mini', 'claude-3-haiku', 'llama-3.3-70b', 'mistral-small-3'];
  let lastErr;
  for(const model of models){
    try{
      const r = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'User-Agent':UA, 'x-vqd-4':vqd },
        body: JSON.stringify({ model, messages: rest }),
        signal: timeout(60000)
      });
      if(!r.ok || !r.body) throw new Error('ddg ' + r.status);
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = '', got = false;
      for(;;){
        const { done, value } = await reader.read(); if(done) break;
        buf += dec.decode(value, { stream:true });
        let i;
        while((i = buf.indexOf('\n')) >= 0){
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if(!line.startsWith('data:')) continue;
          const d = line.slice(5).trim(); if(d === '[DONE]') continue;
          try{ const j = JSON.parse(d); const t = j.choices?.[0]?.delta?.content ?? j.content ?? ''; if(t){ got = true; emit(t); } }catch{}
        }
      }
      if(got) return;
      throw new Error('ddg empty');
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('ddg failed');
}
/* 2) Pollinations OpenAI-style */
async function polStream(messages, emit){
  const up = await fetch('https://text.pollinations.ai/openai', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ model:'openai', stream:true, messages }),
    signal: timeout(60000)
  });
  if(!up.ok || !up.body) throw new Error('pol ' + up.status);
  const reader = up.body.getReader(), dec = new TextDecoder();
  let buf = '', got = false;
  for(;;){
    const { done, value } = await reader.read(); if(done) break;
    buf += dec.decode(value, { stream:true });
    let i;
    while((i = buf.indexOf('\n')) >= 0){
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if(!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if(d === '[DONE]') continue;
      try{ const j = JSON.parse(d); const t = j.choices?.[0]?.delta?.content ?? j.content ?? ''; if(t){ got = true; emit(t); } }catch{}
    }
  }
  if(!got) throw new Error('pol empty');
}
/* 3) Pollinations plain GET */
async function polGet(messages, emit){
  const last = [...messages].reverse().find(m => m.role === 'user');
  const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(last?.content || 'hello'), { signal: timeout(60000) });
  if(!r.ok) throw new Error('polget ' + r.status);
  const t = await r.text(); if(!t) throw new Error('empty');
  emit(t);
}

async function chatHandler(req, res){
  const messages = (req.body && req.body.messages) || [];
  if(!messages.length) return res.status(400).json({ error: 'messages required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if(res.flushHeaders) res.flushHeaders();
  const emit = t => res.write('data: ' + JSON.stringify({ choices:[{ delta:{ content:t } }] }) + '\n\n');
  const full = [{ role:'system', content:SYSTEM }, ...messages];
  try{ await ddgStream(full, emit); }
  catch(e1){
    try{ await polStream(full, emit); }
    catch(e2){
      try{ await polGet(messages, emit); }
      catch(e3){ emit('⚠️ All free AI relays are crowded right now — please wait ~10 seconds and send again.'); }
    }
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

/* ================= IMAGE PROVIDERS (keyless, with failover) ================= */
async function imgPollinations(prompt, w, h, model){
  const seed = Math.floor(Math.random() * 1e6);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&model=${model}&nologo=true`;
  const r = await fetch(url, { signal: timeout(90000) });
  if(!r.ok) throw new Error('pol ' + r.status);
  const ct = r.headers.get('content-type') || '';
  if(!ct.startsWith('image/')) throw new Error('pol not image');
  const buf = Buffer.from(await r.arrayBuffer());
  if(buf.length < 8000) throw new Error('pol tiny');
  return { buf, type: ct };
}
async function imgHF(prompt){
  const base = 'https://black-forest-labs-flux-1-schnell.hf.space';
  const seed = Math.floor(Math.random() * 1e9);
  let fn = 'infer';
  try{
    const cfg = await fetch(base + '/gradio_api/config', { signal: timeout(20000) });
    if(cfg.ok){ const j = await cfg.json(); fn = (j.dependencies || []).find(d => d.api_name)?.api_name || fn; }
  }catch{}
  let start = null, evPath = null;
  for(const p of ['/gradio_api/call/' + fn, '/call/' + fn]){
    try{
      const s = await fetch(base + p, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ data:[prompt, seed, true] }), signal: timeout(30000) });
      if(s.ok){ start = s; evPath = p; break; }
    }catch{}
  }
  if(!start) throw new Error('hf start failed');
  const { event_id } = await start.json();
  const r = await fetch(base + evPath + '/' + event_id, { signal: timeout(150000) });
  if(!r.ok) throw new Error('hf poll ' + r.status);
  const txt = await r.text();
  const dataLine = [...txt.split('\n')].reverse().find(l => l.startsWith('data:'));
  if(!dataLine) throw new Error('hf no data');
  const arr = JSON.parse(dataLine.slice(5));
  const file = Array.isArray(arr) ? arr.find(x => x && (x.url || x.path)) : null;
  if(!file) throw new Error('hf no file');
  const img = await fetch(file.url || (base + '/gradio_api/file=' + file.path), { signal: timeout(60000) });
  if(!img.ok) throw new Error('hf file ' + img.status);
  const buf = Buffer.from(await img.arrayBuffer());
  if(buf.length < 8000) throw new Error('hf tiny');
  return { buf, type: img.headers.get('content-type') || 'image/jpeg' };
}
async function generateImage(prompt, w, h){
  const tries = [
    () => imgPollinations(prompt, w, h, 'turbo'),
    () => imgHF(prompt),
    () => imgPollinations(prompt, w, h, 'flux')
  ];
  let err;
  for(const t of tries){ try{ return await t(); }catch(e){ err = e; } }
  throw err;
}
async function imageHandler(req, res){
  const q = req.query, prompt = q.prompt || q.q;
  if(!prompt) return res.status(400).json({ error: 'prompt required' });
  const w = Math.min(2048, +q.width || 1024), h = Math.min(2048, +q.height || 1024);
  try{
    const { buf, type } = await generateImage(prompt, w, h);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buf);
  }catch(e){ res.status(502).json({ error: 'all image providers failed — retry' }); }
}

/* ---------------- routes ---------------- */
app.use('/v1', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if(req.method === 'OPTIONS') return res.end();
  next();
});
app.get('/api/health', (req, res) => res.json({ name:'JagX AI', status:'online', free:true, auth:false, realtime:true }));
app.post('/api/keys', rateLimit(10), (req, res) => {
  const name = String(req.body?.name || 'key').slice(0, 40);
  const payload = Buffer.from(JSON.stringify({ id: crypto.randomBytes(6).toString('hex'), name, t: Date.now() })).toString('base64url');
  res.json({ key: `jagx_${payload}_${sign(payload)}`, name });
});
app.post('/api/chat',  rateLimit(60), chatHandler);
app.get ('/api/image', rateLimit(80), imageHandler);
app.post('/v1/chat',   rateLimit(60), requireKey, chatHandler);
app.get ('/v1/image',  rateLimit(80), requireKey, imageHandler);
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log('⚡ JagX AI online on :' + PORT));
