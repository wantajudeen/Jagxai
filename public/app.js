/* ============================================================
   JagX AI — realtime client engine (free, keyless, voice, video)
============================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rnd = () => Math.floor(Math.random() * 1e6);

/* ---------- toasts ---------- */
function toast(msg, type = 'info'){
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}
function saveBlob(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- navigation ---------- */
const TITLES = { chat:'Realtime Chat', images:'Image Studio', video:'Video Studio', builder:'Site & App Builder', code:'Code Engine', keys:'API Keys' };
function go(v){
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  $('#viewTitle').textContent = TITLES[v];
  $('#sidebar').classList.remove('open');
}
$$('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

/* ---------- realtime streaming chat relay ---------- */
async function streamChat(messages, onDelta){
  const res = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ messages }) });
  if(!res.ok) throw new Error('chat ' + res.status);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for(;;){
    const { done, value } = await reader.read();
    if(done) break;
    buf += dec.decode(value, { stream:true });
    let i;
    while((i = buf.indexOf('\n')) >= 0){
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if(!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if(d === '[DONE]') continue;
      try{
        const j = JSON.parse(d);
        const t = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
        if(t) onDelta(t);
      }catch{}
    }
  }
}

/* ================= CHAT ================= */
const msgs = $('#msgs'), chatInput = $('#chatInput');
let history = [], voiceOn = false, busy = false;

function buildWelcome(){
  msgs.innerHTML = `<div class="welcome">
    <h3>Hey, I'm JagX ⚡</h3>
    <p>Your realtime AI for knowledge, advice, images, video, code & full websites — free forever, no sign-up. I can also speak: turn on Voice.</p>
    <div class="chips">
      <button class="chip">Give me honest advice about my career</button>
      <button class="chip">Explain how AI works, simply</button>
      <button class="chip">Write a startup idea with a business plan</button>
      <button class="chip">Help me learn to code fast</button>
    </div></div>`;
  $$('.chip', msgs).forEach(c => c.onclick = () => sendChat(c.textContent));
}
buildWelcome();

function addMsg(role, html){
  const w = document.createElement('div');
  w.className = 'msg ' + role;
  w.innerHTML = `<div class="avatar">${role === 'user' ? 'YOU' : 'J'}</div><div class="bubble">${html}</div>`;
  msgs.appendChild(w); msgs.scrollTop = msgs.scrollHeight;
  return w;
}
function renderMD(el, text){
  if(window.marked){
    let html = marked.parse(text, { gfm:true, breaks:true });
    if(window.DOMPurify) html = DOMPurify.sanitize(html);
    el.innerHTML = html;
    $$('pre', el).forEach(pre => {
      const box = document.createElement('div'); box.className = 'codebox';
      pre.parentNode.insertBefore(box, pre); box.appendChild(pre);
      const code = $('code', pre);
      if(window.hljs && code) hljs.highlightElement(code);
      const lang = (code?.className.match(/language-([\w-]+)/) || [])[1] || 'code';
      const bar = document.createElement('div'); bar.className = 'codebar';
      bar.innerHTML = `<span>${esc(lang)}</span><button class="copybtn">Copy</button>`;
      box.insertBefore(bar, pre);
      $('.copybtn', bar).onclick = () => { navigator.clipboard.writeText(code ? code.innerText : pre.innerText); toast('Code copied ✓'); };
    });
  } else el.textContent = text;
}
function speak(t){
  if(!voiceOn || !('speechSynthesis' in window)) return;
  const clean = t.replace(/```[\s\S]*?```/g, ' (code block) ').replace(/[#*`_>\[\]()-]/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
}
async function sendChat(text){
  text = (text || '').trim();
  if(busy || !text) return;
  busy = true; $('#aiState').textContent = 'thinking…';
  $('.welcome')?.remove();
  addMsg('user', `<div class="md">${esc(text)}</div>`);
  history.push({ role:'user', content:text });
  const bubble = $('.bubble', addMsg('ai', '<div class="dots"><i></i><i></i><i></i></div>'));
  let full = '';
  try{
    await streamChat(history.slice(-14), d => {
      if(!full) bubble.innerHTML = '<div class="md streaming"></div>';
      full += d;
      $('.md', bubble).textContent = full;
      msgs.scrollTop = msgs.scrollHeight;
    });
    if(!full) throw 0;
    bubble.innerHTML = '<div class="md"></div>';
    renderMD($('.md', bubble), full);
    history.push({ role:'assistant', content: full });
    $('#aiState').textContent = 'online — ready to advise you';
    speak(full);
  }catch(e){
    bubble.innerHTML = '<div class="md err">⚠️ The free relay is busy — please retry in a moment.</div>';
    $('#aiState').textContent = 'online';
  }
  msgs.scrollTop = msgs.scrollHeight;
  busy = false;
}
$('#sendBtn').onclick = () => { sendChat(chatInput.value); chatInput.value = ''; };
chatInput.addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); $('#sendBtn').click(); } });
chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px'; });
$('#clearBtn').onclick = () => { history = []; buildWelcome(); toast('Chat cleared'); };
$('#voiceBtn').onclick = () => {
  voiceOn = !voiceOn;
  $('#voiceBtn').classList.toggle('on', voiceOn);
  toast(voiceOn ? '🔊 Voice ON — JagX will speak to you' : 'Voice OFF');
  if(!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel();
};
$('#micBtn').onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return toast('Voice input not supported in this browser', 'warn');
  const r = new SR(); r.lang = 'en-US';
  r.onresult = e => { chatInput.value = e.results[0][0].transcript; toast('🎙 Heard you'); };
  r.onerror = () => toast('Mic error', 'warn');
  r.start(); toast(' Listening…');
};

/* ================= IMAGES ================= */
const STYLES = { none:'', photo:'ultra realistic photography, 50mm lens, natural light', anime:'anime style, vibrant, studio quality', cyber:'cyberpunk neon lighting, futuristic', threeD:'3d render, octane, cinematic lighting', art:'oil painting, expressive brushstrokes' };
function makeImgCard(p, style, w, h){
  const card = document.createElement('div'); card.className = 'img-card';
  card.innerHTML = '<div class="img-skel"></div>';
  $('#imgGrid').prepend(card);
  const seed = rnd();
  const url = `/api/image?prompt=${encodeURIComponent(p + (style ? ', ' + style : ''))}&width=${w}&height=${h}&seed=${seed}`;
  const img = new Image(); img.alt = p;
  img.onload = () => {
    card.innerHTML = ''; card.appendChild(img);
    const bar = document.createElement('div'); bar.className = 'img-bar';
    bar.innerHTML = '<button class="mini re">↻ Regen</button><button class="mini dl">⬇ Download</button>';
    card.appendChild(bar);
    $('.dl', bar).onclick = async () => saveBlob(await (await fetch(url)).blob(), `jagx-${seed}.jpg`);
    $('.re', bar).onclick = () => { card.remove(); makeImgCard(p, style, w, h); };
  };
  img.onerror = () => { card.innerHTML = '<div class="img-err">⚠️ Failed — hover-free retry: regen</div>'; };
  img.src = url;
}
$('#imgBtn').onclick = () => {
  const p = $('#imgPrompt').value.trim();
  if(!p) return toast('Describe your image first', 'warn');
  const [w, h] = $('#imgRatio').value.split('x').map(Number);
  const n = +$('#imgCount').value, style = STYLES[$('#imgStyle').value];
  for(let i = 0; i < n; i++) makeImgCard(p, style, w, h);
  toast(`⚡ Painting ${n} image${n > 1 ? 's' : ''}…`);
};

/* ================= VIDEO ================= */
$('#vidBtn').onclick = async () => {
  const p = $('#vidPrompt').value.trim();
  if(!p) return toast('Describe your video first', 'warn');
  const n = +$('#vidScenes').value, btn = $('#vidBtn');
  btn.disabled = true; $('#vidProgWrap').hidden = false; $('#vidResult').innerHTML = '';
  const prog = $('#vidProg'), st = $('#vidStatus');
  try{
    st.textContent = '🎬 Writing scenes…'; prog.style.width = '6%';
    let raw = '';
    await streamChat([
      { role:'system', content:`You are a film director. Return ONLY a JSON array of exactly ${n} short vivid visual scene descriptions (strings) for a cinematic video about: "${p}". No extra text.` },
      { role:'user', content:p }
    ], d => raw += d);
    let scenes;
    try{ scenes = JSON.parse((raw.match(/\[[\s\S]*\]/) || ['[]'])[0]); }catch{ scenes = []; }
    if(!Array.isArray(scenes) || !scenes.length) scenes = raw.split('\n').map(s => s.replace(/^[^a-zA-Z0-9"]+/, '')).filter(Boolean).slice(0, n);
    const blobs = [];
    for(let i = 0; i < scenes.length; i++){
      st.textContent = `🎨 Painting scene ${i + 1}/${scenes.length}…`;
      prog.style.width = (10 + (i / scenes.length) * 60) + '%';
      const r = await fetch(`/api/image?prompt=${encodeURIComponent(scenes[i])}&width=1280&height=720&model=turbo&seed=${rnd()}`);
      if(!r.ok) throw 0;
      blobs.push(await r.blob());
    }
    st.textContent = '🎥 Directing, animating & recording…'; prog.style.width = '82%';
    const { url, ext } = await compileVideo(blobs, scenes, p);
    prog.style.width = '100%'; st.textContent = '✅ Your video is ready!';
    const box = $('#vidResult'); box.innerHTML = '';
    const v = document.createElement('video'); v.controls = true; v.src = url; box.appendChild(v);
    const a = document.createElement('a'); a.href = url; a.download = 'jagx-video.' + ext; a.className = 'btn-grad'; a.textContent = '⬇ Download video'; box.appendChild(a);
    toast('🎬 Video complete!');
  }catch(e){ st.textContent = '⚠️ Something failed — please retry.'; }
  btn.disabled = false;
};
function compileVideo(blobs, captions, title){
  return new Promise((resolve, reject) => {
    const W = 1280, H = 720;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const rec = new MediaRecorder(canvas.captureStream(30), { videoBitsPerSecond: 6000000 });
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => resolve({ url: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'video/webm' })), ext: (rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm' });
    rec.onerror = reject;
    const imgs = blobs.map(b => { const i = new Image(); i.src = URL.createObjectURL(b); return i; });
    Promise.all(imgs.map(i => i.decode ? i.decode().catch(() => {}) : new Promise(r => { i.onload = r; i.onerror = r; }))).then(() => {
      const SCENE = 3000, FADE = 500, INTRO = 2400, OUTRO = 2400;
      const total = INTRO + imgs.length * SCENE + OUTRO;
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#8b5cf6'); grad.addColorStop(1, '#22d3ee');
      const cover = (img, scale, ox, oy) => {
        const ir = img.width / img.height, cr = W / H;
        let dw, dh;
        if(ir > cr){ dh = H * scale; dw = dh * ir; } else { dw = W * scale; dh = dw / ir; }
        ctx.drawImage(img, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
      };
      const wrap = (text, y, max) => {
        const words = text.split(' '); let line = '', yy = y;
        ctx.font = '600 40px Inter, sans-serif';
        for(const w of words){
          if(ctx.measureText(line + w).width > max){ ctx.fillText(line, W / 2, yy); line = w + ' '; yy += 52; if(yy > y + 110) break; }
          else line += w + ' ';
        }
        if(yy <= y + 110) ctx.fillText(line, W / 2, yy);
      };
      const titleCard = (txt, sub, a) => {
        ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = a; ctx.textAlign = 'center';
        ctx.fillStyle = grad; ctx.font = '700 30px "Space Grotesk", sans-serif';
        ctx.fillText(sub, W / 2, H / 2 - 70);
        ctx.fillStyle = '#fff'; ctx.font = '700 52px "Space Grotesk", sans-serif';
        wrap(txt, H / 2, W - 240);
        ctx.globalAlpha = 1;
      };
      rec.start(250);
      const t0 = performance.now();
      (function frame(now){
        const t = now - t0;
        ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);
        if(t < INTRO){
          titleCard(title, 'JagX AI presents', Math.min(1, t / 700));
        } else if(t < INTRO + imgs.length * SCENE){
          const lt = t - INTRO, idx = Math.min(imgs.length - 1, Math.floor(lt / SCENE)), stt = (lt % SCENE) / SCENE;
          cover(imgs[idx], 1.06 + 0.12 * stt, (stt - .5) * 60, 0);
          ctx.fillStyle = 'rgba(5,6,10,.85)';
          if(lt % SCENE < FADE){ ctx.globalAlpha = 1 - (lt % SCENE) / FADE; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
          if(SCENE - (lt % SCENE) < FADE){ ctx.globalAlpha = ((lt % SCENE) - (SCENE - FADE)) / FADE; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
          const g2 = ctx.createLinearGradient(0, H - 130, 0, H);
          g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.8)');
          ctx.fillStyle = g2; ctx.fillRect(0, H - 130, W, 130);
          ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '500 26px Inter, sans-serif';
          let cap = captions[idx] || ''; if(ctx.measureText(cap).width > W - 160) cap = cap.slice(0, 70) + '…';
          ctx.fillText(cap, W / 2, H - 46);
        } else {
          titleCard('Made with JagX AI', '⚡ free • realtime • open', Math.min(1, (t - INTRO - imgs.length * SCENE) / 700));
        }
        if(t < total) requestAnimationFrame(frame);
        else setTimeout(() => rec.stop(), 200);
      })(t0);
    }).catch(reject);
  });
}

/* ================= BUILDER ================= */
const BUILDER_SYS = `You are JagX Builder. You build complete, beautiful, responsive, production-quality websites/apps as ONE self-contained HTML file with inline CSS & JS. Modern dark aesthetic, gradients, smooth animations, real content (no lorem ipsum). Return ONLY the code, starting exactly with <!DOCTYPE html>.`;
let siteCode = '';
$('#buildBtn').onclick = async () => {
  const p = $('#buildPrompt').value.trim();
  if(!p) return toast('Describe the site/app first', 'warn');
  const btn = $('#buildBtn'); btn.disabled = true;
  $('#buildStatus').textContent = '⏳ JagX is designing & coding…';
  $('#buildOut').hidden = false; setTab('preview');
  $('#buildFrame').srcdoc = '<body style="background:#0b0e14;color:#8b93a7;font-family:sans-serif;display:grid;place-items:center;height:100vh">⏳ Building…</body>';
  let raw = '';
  try{
    await streamChat([{ role:'system', content:BUILDER_SYS }, { role:'user', content:p }], d => { raw += d; });
    const m = raw.match(/```(?:html)?\s*([\s\S]*?)```/);
    siteCode = (m ? m[1] : (raw.match(/<!DOCTYPE[\s\S]*/i) || [null])[0]);
    if(!siteCode) throw 0;
    siteCode = siteCode.trim();
    $('#buildFrame').srcdoc = siteCode;
    const c = $('#buildCode code'); c.textContent = siteCode; c.className = 'language-html';
    if(window.hljs) hljs.highlightElement(c);
    $('#buildStatus').textContent = '✅ Built! Preview live below.';
    toast('🏗️ Your site is live in preview!');
  }catch(e){ $('#buildStatus').textContent = '⚠️ Build failed — retry.'; }
  btn.disabled = false;
};
function setTab(t){
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $('#buildFrame').hidden = t !== 'preview';
  $('#buildCode').hidden = t !== 'code';
}
$$('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$('#bRerun').onclick = () => { if(siteCode) $('#buildFrame').srcdoc = siteCode; };
$('#bCopy').onclick = () => { navigator.clipboard.writeText(siteCode); toast('Code copied ✓'); };
$('#bDl').onclick = () => siteCode && saveBlob(new Blob([siteCode], { type:'text/html' }), 'jagx-site.html');
$('#bOpen').onclick = () => { if(siteCode) window.open(URL.createObjectURL(new Blob([siteCode], { type:'text/html' })), '_blank'); };

/* ================= CODE ENGINE ================= */
const EXT = { javascript:'js', typescript:'ts', python:'py', html:'html', css:'css', java:'java', cpp:'cpp', go:'go', rust:'rs', php:'php', ruby:'rb', swift:'swift', kotlin:'kt', sql:'sql', bash:'sh' };
let codeText = '', codeLangNow = 'python';
$('#codeBtn').onclick = async () => {
  const p = $('#codePrompt').value.trim();
  if(!p) return toast('Describe the code first', 'warn');
  codeLangNow = $('#codeLang').value;
  const btn = $('#codeBtn'); btn.disabled = true;
  $('#codeOut').hidden = false; $('#codeStatus').textContent = '⏳ coding…';
  let raw = '';
  try{
    await streamChat([
      { role:'system', content:`You are JagX Code Engine. Return ONLY a single fenced \`\`\`${codeLangNow} code block implementing the request. Clean, commented, production-ready. No explanations.` },
      { role:'user', content:p }
    ], d => raw += d);
    const m = raw.match(/```[\w-]*\n([\s\S]*?)```/);
    codeText = (m ? m[1] : raw).trim();
    const c = $('#codeBlock'); c.textContent = codeText; c.className = 'language-' + codeLangNow;
    if(window.hljs) hljs.highlightElement(c);
    $('#codeStatus').textContent = '✅ ' + codeLangNow;
    toast('⌨️ Code ready!');
  }catch(e){ $('#codeStatus').textContent = '⚠️ failed — retry'; }
  btn.disabled = false;
};
$('#cCopy').onclick = () => { navigator.clipboard.writeText(codeText); toast('Code copied ✓'); };
$('#cDl').onclick = () => codeText && saveBlob(new Blob([codeText], { type:'text/plain' }), 'jagx-code.' + (EXT[codeLangNow] || 'txt'));

/* ================= API KEYS ================= */
$('#genKeyBtn').onclick = async () => {
  const name = $('#keyName').value.trim() || 'default';
  const r = await fetch('/api/keys', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
  const { key } = await r.json();
  const list = JSON.parse(localStorage.getItem('jagx-keys') || '[]');
  list.unshift({ key, name, created: Date.now() });
  localStorage.setItem('jagx-keys', JSON.stringify(list));
  renderKeys(); toast('🔑 API key generated — free forever!');
};
function renderKeys(){
  const list = JSON.parse(localStorage.getItem('jagx-keys') || '[]');
  $('#keyList').innerHTML = list.map((k, i) => `<div class="key-row"><b>${esc(k.name)}</b><span>${k.key}</span>
    <button class="mini cp" data-i="${i}">Copy</button><button class="mini rm" data-i="${i}">Delete</button></div>`).join('') || '<p class="hint">No keys yet — generate one above.</p>';
  $$('.cp', $('#keyList')).forEach(b => b.onclick = () => { navigator.clipboard.writeText(list[b.dataset.i].key); toast('Key copied ✓'); });
  $$('.rm', $('#keyList')).forEach(b => b.onclick = () => { list.splice(b.dataset.i, 1); localStorage.setItem('jagx-keys', JSON.stringify(list)); renderKeys(); });
}
renderKeys();

/* highlight static docs */
$$('pre code.language-bash').forEach(c => window.hljs && hljs.highlightElement(c));
