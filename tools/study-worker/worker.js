// RabbiRabbit Study Worker v1 (Nov 27, 2026): serves finished, checked studies. Build once, serve many.
// It makes no model calls and needs no API key. It reads pool/studies/index.json and the study pages it names from the public repo,
// and serves a study only when (1) the index marks it approved by a named person (or REVIEW is on, for Rabbit's review, with a
// "not yet approved" banner) and (2) the page's bytes hash to the sha256 the index records. Anything else is refused, never patched.
// The live Worker (v46) is separate and untouched.
//
// Settings (Cloudflare dashboard -> this Worker -> Settings -> Variables):
//   REVIEW = on      show pending studies too, under a banner (for Tom's review). Leave unset for the public.
//   BRANCH = main    which branch of twrmail/RabbiRabbit to read (optional).
//
// Routes: /  (the app)   /s/<unit>/<key>  (a study)   /api/index   /manifest.webmanifest   /sw.js   /icon.svg

const REPO = 'twrmail/RabbiRabbit';
const LIVE = 'https://rabbirabbit.com/';
const VERSION = 'study-worker v1';

const BOOKS = {GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',JOS:'Joshua',JDG:'Judges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel',
  '1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles',EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',PSA:'Psalms',PRO:'Proverbs',
  ECC:'Ecclesiastes',SNG:'Song of Songs',ISA:'Isaiah',JER:'Jeremiah',LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',AMO:'Amos',
  OBA:'Obadiah',JON:'Jonah',MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',MAL:'Malachi',MAT:'Matthew',MRK:'Mark',
  LUK:'Luke',JHN:'John',ACT:'Acts',ROM:'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians',GAL:'Galatians',EPH:'Ephesians',PHP:'Philippians',
  COL:'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy',TIT:'Titus',PHM:'Philemon',HEB:'Hebrews',
  JAS:'James','1PE':'1 Peter','2PE':'2 Peter','1JN':'1 John','2JN':'2 John','3JN':'3 John',JUD:'Jude',REV:'Revelation'};

const raw = (env, path) => `https://raw.githubusercontent.com/${REPO}/${env.BRANCH || 'main'}/${path}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html = (body, status = 200) => new Response(body, {status, headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}});

async function sha256(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getIndex(env) {
  const r = await fetch(raw(env, 'pool/studies/index.json'), {cf: {cacheTtl: 60, cacheEverything: true}});
  if (!r.ok) throw new Error(`index fetch ${r.status}`);
  const ix = await r.json();
  if (ix.schema !== 'study_index_v1') throw new Error('unknown index schema');
  return ix;
}

// Which studies a visitor may see: approved always; pending only in review mode.
function visible(ix, env) {
  const review = env.REVIEW === 'on', out = [];
  for (const [uid, u] of Object.entries(ix.units || {})) {
    const studies = (u.studies || []).filter(s => s.status === 'approved' || review);
    if (studies.length) out.push({uid, title: u.title, studies});
  }
  return out;
}

const SHELL_CSS = `body{margin:0;font:17px/1.55 Georgia,serif;color:#222;background:#faf8f3}header{background:#3b2f1c;color:#f5ecd8;padding:.9rem 1rem}
header b{font-size:1.2rem}header small{display:block;font:12px system-ui;opacity:.8}main{max-width:720px;margin:auto;padding:1rem}
form{display:flex;gap:.5rem;margin:.5rem 0 1rem}input{flex:1;font:17px system-ui;padding:.6rem;border:1px solid #bbb;border-radius:6px}
button{font:16px system-ui;padding:.6rem 1rem;border:0;border-radius:6px;background:#8a6d3b;color:#fff}
.card{display:block;background:#fff;border:1px solid #e2dccd;border-radius:8px;padding:.8rem 1rem;margin:.6rem 0;color:inherit;text-decoration:none}
.card .t{font-weight:bold}.card .m{font:13px system-ui;color:#666}.pend{color:#a0522d;font:600 12px system-ui}
.msg{background:#fff7e6;border:1px solid #e8d3a8;border-radius:8px;padding:.8rem 1rem}h2{font-size:1.1rem;margin:1.4rem 0 .3rem}`;

function shell(ix, env, q = '', found = null) {
  const units = visible(ix, env), review = env.REVIEW === 'on';
  const card = (uid, s) => `<a class=card href="/s/${encodeURIComponent(uid)}/${encodeURIComponent(s.key)}"><div class=t>${esc(s.title)}</div>
    <div class=m>${esc(s.scope)}${s.status === 'approved' ? '' : ' · <span class=pend>NOT YET APPROVED</span>'}</div></a>`;
  let res = '';
  if (q) {
    if (found === null) res = `<div class=msg>I could not read <b>${esc(q)}</b>. Try a book, chapter and verse, like <i>John 3:16</i>.</div>`;
    else if (!found.length) res = `<div class=msg>No finished study covers <b>${esc(q)}</b> yet. <a href="${LIVE}">Open RabbiRabbit</a> for a study written on the spot.</div>`;
    else res = '<h2>Studies for ' + esc(q) + '</h2>' + found.map(([uid, s]) => card(uid, s)).join('');
  }
  const list = units.map(u => `<h2>${esc(u.title)} <span class=m style="font:13px system-ui;color:#666">${esc(u.uid)}</span></h2>` +
    u.studies.map(s => card(u.uid, s)).join('')).join('') || '<div class=msg>No studies are approved yet.</div>';
  return `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>RabbiRabbit Studies</title><link rel=manifest href=/manifest.webmanifest><link rel=icon href=/icon.svg><meta name=theme-color content="#3b2f1c">
<style>${SHELL_CSS}</style><header><b>RabbiRabbit Studies</b><small>Scripture and public-domain commentary, with a narrative written by AI${review ? ' · REVIEW MODE: pending studies shown' : ''}</small></header>
<main><form action=/ method=get><input name=q placeholder="John 3:16" value="${esc(q)}" aria-label="Passage"><button>Find</button></form>${res}
<h2 style="margin-top:2rem">All studies</h2>${list}</main>
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')</script></html>`;
}

// "John 3:16" or "1 John 2:15-17" -> {book, chapter, lo, hi}
function parseRef(q) {
  const m = q.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!m) return null;
  const name = m[1].toLowerCase().replace(/\s+/g, ' ').replace(/^(i{1,3})\s/, (x, r) => r.length + ' ');
  const code = Object.keys(BOOKS).find(k => BOOKS[k].toLowerCase() === name || BOOKS[k].toLowerCase().startsWith(name) && name.length >= 3 ||
    (name === 'psalm' && k === 'PSA') || (name === 'song of solomon' && k === 'SNG'));
  if (!code) return null;
  const lo = m[3] ? +m[3] : 1, hi = m[4] ? +m[4] : m[3] ? lo : 999;
  return {book: code, chapter: +m[2], lo, hi};
}

function findStudies(ix, env, ref) {
  const out = [];
  for (const u of visible(ix, env)) {
    const m = u.uid.match(/^([1-3]?[A-Z]{2,3})\.(\d+)\./);
    if (!m || m[1] !== ref.book || +m[2] !== ref.chapter) continue;
    for (const s of u.studies) if (s.verses[0] <= ref.hi && ref.lo <= s.verses[1]) out.push([u.uid, s]);
  }
  return out;
}

async function study(env, uid, key) {
  const ix = await getIndex(env), u = ix.units?.[uid], s = u?.studies?.find(x => x.key === key);
  if (!s) return html(page404('That study does not exist.'), 404);
  if (s.status !== 'approved' && env.REVIEW !== 'on') return html(page404('That study is not approved yet.'), 404);
  const f = s.files?.page_html;
  if (!f?.path || !/^[0-9a-f]{64}$/.test(f.sha256 || '')) return html(page404('That study has no checked page.'), 503);
  const r = await fetch(raw(env, f.path), {cf: {cacheTtl: 300, cacheEverything: true}});
  if (!r.ok) return html(page404('That study could not be loaded. Please try again.'), 502);
  const buf = await r.arrayBuffer();
  if (await sha256(buf) !== f.sha256) return html(page404('That study did not pass its check, so it is not shown.'), 503);   // fail closed
  let page = new TextDecoder().decode(buf);
  const bar = `<div style="font:14px system-ui;background:#3b2f1c;color:#f5ecd8;padding:.6rem 1rem;margin:-1rem -1rem 1rem"><a href="/" style="color:#f5ecd8">← RabbiRabbit Studies</a></div>` +
    (s.status === 'approved' ? '' : `<div style="font:600 14px system-ui;background:#fde8e0;border:1px solid #e0a890;color:#8a3a1c;padding:.6rem .8rem;border-radius:6px;margin-bottom:1rem">
      NOT YET APPROVED · Study ${esc(s.key)} is pending Rabbit's review. Shown because review mode is on.</div>`);
  page = page.replace('<meta charset=utf-8>', '<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><link rel=manifest href=/manifest.webmanifest>')
             .replace('<section', bar + '<section');
  return html(page);
}

const page404 = msg => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>RabbiRabbit Studies</title>
<style>${SHELL_CSS}</style><header><b>RabbiRabbit Studies</b></header><main><div class=msg>${esc(msg)}</div><p><a href="/">← All studies</a></p></main>`;

const MANIFEST = JSON.stringify({name: 'RabbiRabbit Studies', short_name: 'Rabbit Studies', start_url: '/', display: 'standalone',
  background_color: '#faf8f3', theme_color: '#3b2f1c', icons: [{src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'}]});
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#3b2f1c"/>
<path d="M22 40c0-8 5-12 10-12s10 4 10 12-4 12-10 12-10-4-10-12z" fill="#f5ecd8"/><ellipse cx="26" cy="18" rx="4" ry="12" fill="#f5ecd8"/><ellipse cx="38" cy="18" rx="4" ry="12" fill="#f5ecd8"/></svg>`;
// Network first; the last good copy is used only when offline. Studies are cached after they pass the check above.
const SW = `const C='rabbit-studies-v1';self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request)))});`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url), p = url.pathname;
    try {
      if (p === '/manifest.webmanifest') return new Response(MANIFEST, {headers: {'content-type': 'application/manifest+json'}});
      if (p === '/icon.svg') return new Response(ICON, {headers: {'content-type': 'image/svg+xml', 'cache-control': 'max-age=86400'}});
      if (p === '/sw.js') return new Response(SW, {headers: {'content-type': 'text/javascript', 'cache-control': 'no-cache'}});
      if (p === '/api/index') {
        const ix = await getIndex(env);
        return new Response(JSON.stringify({version: VERSION, review: env.REVIEW === 'on', units: visible(ix, env)}), {headers: {'content-type': 'application/json'}});
      }
      const m = p.match(/^\/s\/([^/]+)\/([^/]+)$/);
      if (m) return await study(env, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
      if (p === '/') {
        const ix = await getIndex(env), q = (url.searchParams.get('q') || '').slice(0, 60);
        if (!q) return html(shell(ix, env));
        const ref = parseRef(q);
        return html(shell(ix, env, q, ref ? findStudies(ix, env, ref) : null));
      }
      return html(page404('Page not found.'), 404);
    } catch (e) {
      console.log(VERSION, 'error', String(e));
      return html(page404('RabbiRabbit Studies is having trouble reaching its library. Please try again in a minute.'), 502);
    }
  }
};
