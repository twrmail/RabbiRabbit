import fs from 'fs'
const R='/home/claude/rabbirabbit', urls=[]
globalThis.fetch=async url=>{urls.push(String(url)); const m=String(url).match(/rabbirabbit\/main\/(.*\.json)$/i)||String(url).match(/RabbiRabbit\/main\/(.*\.json)$/); if(!m) return {ok:false}; try{const t=fs.readFileSync(`${R}/${m[1]}`,'utf8'); return {ok:true,json:async()=>JSON.parse(t)}}catch{return {ok:false}}}
let src=fs.readFileSync('/home/claude/w/worker-v43.js','utf8').replace(/^export default/m,'const __w =')
const {fetchMHC}=new Function(src+'\nreturn {fetchMHC}')()
let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++}
let t=await fetchMHC('JOB',1,4)
ok(!!t && /Henry's section/.test(t),'Job 1:4 returns a Henry section')
ok(urls.every(u=>/\/library\/commentary\/MHC\//.test(u)) && urls.length>0,'every Henry request goes to library/commentary/MHC ('+urls[0]+')')
ok(!urls.some(u=>/\/data\//.test(u)),'no request to data/')
t=await fetchMHC('GEN',1,null); ok(!!t && t.length<=3000,'chapter overview returns text under the 3000 cap')
t=await fetchMHC('DEUT',6,4); ok(!!t,'long-form code DEUT still resolves (short-code translation)')
t=await fetchMHC('1COR',16,24); ok(!!t && !/&lt;|&gt;/.test(t),'1 Cor 16:24 has no raw &lt; &gt; entities')
// a verse that gained a quote block in the library
const lib=JSON.parse(fs.readFileSync(R+'/library/commentary/MHC/JOB.json','utf8')).chapters.find(c=>c.chapter===1).commentary
ok(/Blackmore/i.test(lib),'library Job 1 contains the restored Blackmore verses')
console.log(fails?'FAILED '+fails:'ALL PASS')
{ const j=await fetchMHC('JOB',1,4); console.log('Job 1:4 includes Blackmore:', /Blackmore/i.test(j||''), (j||'').length) }
{ const j=await fetchMHC('ISA',53,5); console.log('Isa 53:5 length', (j||'').length, 'within 3000:', (j||'').length<=3000) }
