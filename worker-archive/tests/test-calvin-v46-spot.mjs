import fs from 'node:fs'
const R='/home/claude/rabbirabbit/'
const calls=[]
globalThis.fetch=async (url)=>{ calls.push(url); const p=R+url.replace('https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/','')
  if(!fs.existsSync(p)) return {ok:false,status:404}
  return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(p,'utf8'))} }
const {fetchCalvin,toShortCode}=await import('/tmp/w46/w46test.mjs')
const cases=[['JHN',3,16],['JOHN',3,16],['ROM',8,28],['JER',10,2],['1COR',16,22],['PS',23,1],['ISA',53,5],['ISA',53,null],['2JOHN',1,1],['EZEK',21,1],['NAH',1,2],['GEN',1,1],['ACTS',22,29]]
for(const [b,c,v] of cases){ const t=await fetchCalvin(b,c,v); console.log(`${b} ${c}:${v} -> short=${toShortCode(b)} len=${t?t.length:null}\n   ${t?t.slice(0,170).replace(/\s+/g,' '):'(null)'}`)}
console.log('subrequests',calls.length, 'distinct', new Set(calls).size)
