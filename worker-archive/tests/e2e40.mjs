import fs from 'fs'
const R='/home/claude/rabbirabbit/'
globalThis.fetch=async(u)=>{const m=String(u).match(/RabbiRabbit\/main\/(.+)$/);if(!m)return {ok:false};const p=R+decodeURIComponent(m[1]);if(!fs.existsSync(p))return {ok:false,status:404};const t=fs.readFileSync(p,'utf8');return {ok:true,json:async()=>JSON.parse(t),text:async()=>t}}
const w=(await import('/tmp/w40.mjs')).default
let bad=0
for(const d of ['2026-11-08','2026-12-25','2027-03-01','2027-06-15','2027-09-09']){const r=await w.fetch(new Request('https://x/daily-seed?date='+d),{});const j=await r.json();console.log(d,j.reference,'|',(j.scripture||'NULL').slice(0,70));if(!j.scripture)bad++}
for(const inp of ['Deuteronomy 6:4-5','1 Samuel 3:10','Psalm 23']){const r=await w.fetch(new Request('https://x/study-preview',{method:'POST',body:JSON.stringify({input:inp,studyType:'passage'})}),{});const j=await r.json();console.log(inp,'->',(j.scripture||'NULL').slice(0,70));if(!j.scripture)bad++}
console.log('null results:',bad)
