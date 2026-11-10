import {repairQuotedBlock,verifyQuotedCommentary} from './v45-fns.js'
import fs from 'fs'
const d=JSON.parse(fs.readFileSync('/home/claude/rabbirabbit/library/commentary/Tyndale/JOB.json','utf8'))
const ch=d.chapters.find(c=>c.chapter===1); const v=ch.verses['6']
const src=[{label:'Tyndale Open Study Notes (TSN)',text:v}]
let pass=0,fail=0
function t(name,block,expect){
  const r=repairQuotedBlock(block,src,[])
  const sent=verifyQuotedCommentary(r.text,src,[])
  const ok=expect(r,sent); ok?pass++:fail++
  console.log(ok?'PASS':'FAIL',name,'|',r.changes.map(c=>c.action+' '+(c.coverage||'')).join(','),'|',sent.map(x=>x.verdict).join(','))
  if(r.changes.length) console.log('   ->',r.text.replace(/\n/g,' ').slice(0,330))
}
const mk=q=>`>>COMMENTARY\n**Tyndale Open Study Notes**\n"${q}"\n>>END`
t('the real failed case',mk("Satan was not patrolling to implement God's judgments but to oppose God's purposes."),(r,s)=>r.changes[0]?.action==='REBUILT'&&s[0].verdict==='MATCH'&&r.text.includes('judgments (cp. 1 Chr')===false&&r.text.includes('…'))
t('exact quote untouched',mk("The question was God’s sovereign demand for a report from a subordinate"),(r,s)=>r.changes.length===0&&s[0].verdict==='MATCH')
t('valid with ellipsis untouched',mk("The question was God’s sovereign demand … from a subordinate"),(r,s)=>r.changes.length===0)
t('invented quote is un-quoted',mk("Satan is the great accuser who roams the earth seeking whom he may devour at every turn"),(r,s)=>r.changes[0]?.action==='DEQUOTED'&&!r.text.includes('"Satan is'))
t('reordered parts un-quoted',mk("but to oppose God's purposes. Satan was not patrolling to implement God's judgments"),(r,s)=>r.changes[0]?.action==='DEQUOTED')
t('one word swapped is rebuilt',mk("The question was God’s sovereign demand for a report from a servant of his"),(r,s)=>['REBUILT','DEQUOTED'].includes(r.changes[0]?.action))
const r2=repairQuotedBlock('>>COMMENTARY\n**Someone Else**\n"words that are not from any supplied source here at all"\n>>END',src,[])
console.log(r2.changes.length===0?'PASS':'FAIL','unknown scholar left alone');
console.log(pass,'passed',fail,'failed')
