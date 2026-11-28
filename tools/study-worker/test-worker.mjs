// Offline test of the study Worker: GitHub is replaced by this checkout's files. usage: node tools/study-worker/test-worker.mjs
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const W = (await import('./worker.js')).default;
let overrides = {};
globalThis.fetch = async (u) => {
  const p = String(u).replace(/^https:\/\/raw\.githubusercontent\.com\/twrmail\/RabbiRabbit\/[^/]+\//, '');
  if (p in overrides) return new Response(overrides[p]);
  const f = path.join(REPO, p); return fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response('nf', {status: 404});
};
const ix = JSON.parse(fs.readFileSync(path.join(REPO, 'pool/studies/index.json')));
const uid = Object.keys(ix.units)[0], st = ix.units[uid].studies, last = st[st.length - 1];
// start from an index with nothing approved (the real one may have approvals)
const ix0 = structuredClone(ix); for (const s of ix0.units[uid].studies) Object.assign(s, {status: 'pending', approver: null, approved_at: null});
overrides['pool/studies/index.json'] = JSON.stringify(ix0);
const get = async (p, env = {}) => { const r = await W.fetch(new Request('https://x.dev' + p), env); return [r.status, await r.text()]; };
let fails = 0, s_, b_; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
let [s, b] = await get('/'); ok(s === 200 && b.includes('No studies are approved yet'), 'public home with nothing approved');
[s, b] = await get(`/s/${uid}/${last.key}`); ok(s === 404, 'pending study hidden from the public');
[s, b] = await get('/', {REVIEW: 'on'}); ok(s === 200 && b.includes('NOT YET APPROVED') && b.includes(last.title.replace(/'/g, '&#39;')), 'review mode lists pending');
[s, b] = await get(`/s/${uid}/${last.key}`, {REVIEW: 'on'}); ok(s === 200 && b.includes('NOT YET APPROVED ·') && b.includes('<section'), 'review mode serves pending with banner');
[s, b] = await get('/?q=John+3:17', {REVIEW: 'on'}); ok(b.includes('Studies for John 3:17'), 'passage search finds the unit');
[s, b] = await get('/?q=Romans+8:28', {REVIEW: 'on'}); ok(b.includes('No finished study covers'), 'unbuilt passage points to live Rabbit');
[s, b] = await get('/?q=Hezekiah+4:2'); ok(b.includes('could not read'), 'unknown book');
// approved: mark the last study approved in a copy of the index
const ix2 = structuredClone(ix0); Object.assign(ix2.units[uid].studies.at(-1), {status: 'approved', approver: 'Tom Robinson', approved_at: '2026-11-27T00:00:00Z'});
overrides['pool/studies/index.json'] = JSON.stringify(ix2);
[s, b] = await get(`/s/${uid}/${last.key}`); ok(s === 200 && !b.includes('NOT YET APPROVED ·'), 'approved study served without banner');
[s, b] = await get('/'); ok(b.includes(`/s/${uid}/${last.key}`) && !b.includes('No studies are approved'), 'approved study listed for public');
// tampered page: one character changed -> refused
const hp = last.files.page_html.path; overrides[hp] = fs.readFileSync(path.join(REPO, hp), 'utf8').replace('the', 'teh');
[s, b] = await get(`/s/${uid}/${last.key}`); ok(s === 503 && b.includes('did not pass its check'), 'tampered page refused');
delete overrides[hp]; overrides['pool/studies/index.json'] = '{"schema":"other"}';
[s, b] = await get('/'); ok(s === 502, 'bad index fails closed');
for (const p of ['/manifest.webmanifest', '/sw.js', '/icon.svg']) { [s] = await get(p); ok(s === 200, p); }
// the real index: every approved study is served without a banner to the public
delete overrides['pool/studies/index.json'];
for (const s of st.filter(x => x.status === 'approved')) { [s_, b_] = await get(`/s/${uid}/${s.key}`); ok(s_ === 200 && !b_.includes('NOT YET APPROVED ·'), `approved ${s.key} served`); }
console.log(`study-worker tests: ${fails ? fails + ' FAIL' : 'all pass'}`); process.exit(fails ? 1 : 0);
