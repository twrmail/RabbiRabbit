import fs from 'fs'
const LIB='/home/claude/rabbirabbit/library/bible', B='/home/claude/rabbirabbit/'
const XREF={'DEUT':'DEU','JOSH':'JOS','JUDG':'JDG','RUTH':'RUT','1SAM':'1SA','2SAM':'2SA','1KGS':'1KI','2KGS':'2KI','1CHR':'1CH','2CHR':'2CH','EZRA':'EZR','ESTH':'EST','PROV':'PRO','ECCL':'ECC','SONG':'SNG','EZEK':'EZK','JOEL':'JOL','AMOS':'AMO','OBAD':'OBA','JONAH':'JON','ZEPH':'ZEP','ZECH':'ZEC','ACTS':'ACT','1COR':'1CO','2COR':'2CO','PHIL':'PHP','1THESS':'1TH','2THESS':'2TH','1TIM':'1TI','2TIM':'2TI','PHLM':'PHM','1PET':'1PE','2PET':'2PE','1JHN':'1JN','2JHN':'2JN','3JHN':'3JN','JUDE':'JUD'}
const toShortCode=b=>XREF[b]||b
const _cache={}
async function fetchJSON(url){const m=url.match(/bible\/BSB\/(\w+)\.json$/);if(!m)return null;try{return JSON.parse(fs.readFileSync(`${LIB}/BSB/${m[1]}.json`,'utf8'))}catch{return null}}
const SCRIPTURE_LIB_BASE='x/bible', SCRIPTURE_EDITIONS={bsb:'BSB'}
function cleanScriptureText(t){return String(t).replace(/^\s*&gt;\s*/,'').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim()}
async function fetchScriptureBook(e,b){return fetchJSON(`${SCRIPTURE_LIB_BASE}/${SCRIPTURE_EDITIONS[e]}/${toShortCode(b)}.json`)}
function readScriptureVerses(book,chapter,from,to){const ch=book&&Array.isArray(book.chapters)?book.chapters.find(c=>c.chapter===chapter):null;if(!ch||!ch.verses)return null;const keys=Object.keys(ch.verses).map(Number).filter(Number.isFinite);const last=keys.length?Math.max(...keys):0;const end=Math.min(to,Math.max(last,from));const items=[];for(let n=from;n<=end;n++){const r0=ch.verses[String(n)],raw=r0===undefined?r0:cleanScriptureText(r0);if(raw===undefined)items.push({n,status:'absent'});else if(raw===''||raw==='[]')items.push({n,status:'empty'});else items.push({n,status:'text',text:raw})}return items}
const src=fs.readFileSync('/home/claude/w/bsb-v40.mjs','utf8')
const {fetchBSBVerse,fetchBSBPassage}=new Function('fetchScriptureBook','readScriptureVerses',src+'\nreturn {fetchBSBVerse,fetchBSBPassage}')(fetchScriptureBook,readScriptureVerses)
// 1) every verse of every book, via BOTH long-form and short-form codes, equals the library text
const LONG=Object.fromEntries(Object.entries(XREF).map(([l,s])=>[s,l]))
let n=0,bad=0,codes=0
for(const f of fs.readdirSync(`${LIB}/BSB`)){const s=f.slice(0,-5),d=JSON.parse(fs.readFileSync(`${LIB}/BSB/${f}`));
  for(const id of new Set([s,LONG[s]||s])){codes++
    for(const c of d.chapters)for(const [v,t] of Object.entries(c.verses)){n++;const got=await fetchBSBVerse(id,c.chapter,+v);if(got!==cleanScriptureText(t)){bad++;if(bad<5)console.log('DIFF',id,c.chapter,v)}}}}
console.log('verse lookups',n,'mismatches',bad,'code forms',codes)
// 2) the publisher's file: lookups through the Worker function == publisher text
const pub=fs.readFileSync(B+'data/bsb/bsb.txt','utf8').split('\n');console.log('publisher lines',pub.length,'sample:',JSON.stringify(pub.slice(0,3)).slice(0,200))
// 3) shapes
console.log(await fetchBSBVerse('JHN',3,16)); console.log((await fetchBSBPassage('PSA',23,1,3)).slice(0,160)); console.log((await fetchBSBPassage('DEUT',6,4,5)).slice(0,120))
console.log('whole ch Ruth 1 verses:',(await fetchBSBPassage('RUTH',1,null,null)).match(/\[\d+\]/g).length,'| missing:',await fetchBSBVerse('GEN',1,99),await fetchBSBPassage('XXX',1,1,2))
