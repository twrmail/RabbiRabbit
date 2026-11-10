import fs from 'node:fs'
const R='/home/claude/rabbirabbit/'
const w45=fs.readFileSync('/mnt/user-data/outputs/worker-v45.js','utf8')
const w46=fs.readFileSync('/tmp/w46/worker-v46.js','utf8')
const old=w45.slice(w45.indexOf('function extractVerseAnchoredText'),w45.indexOf('async function fetchPerBookFile'))
const nu=w46.slice(w46.indexOf('// CALVIN-READER-BEGIN'),w46.indexOf('// CALVIN-READER-END'))
const mk=new Function(old+'\n'+nu+'\nreturn {extractVerseAnchoredText,readCalvinVerse}')
const {extractVerseAnchoredText,readCalvinVerse}=mk()
let tot=0,oldAns=0,oldFallback=0,newAns=0,newNullOldAns=0,newAnsOldFallback=0,newAnsOldNull=0,stale=0,newNullOldProper=0,bothNull=0
const examples={nullProper:[],gain:[]}
const perBook={}
for(const f of fs.readdirSync(R+'library/bible/KJV')){
  const b=f.replace('.json',''); const kjv=JSON.parse(fs.readFileSync(R+'library/bible/KJV/'+f))
  const cp=R+'library/commentary/Calvin/'+f; const op=R+'data/commentary/Calvin/'+f; const ip=R+'library/commentary-index/Calvin/'+f
  const lib=fs.existsSync(cp)?JSON.parse(fs.readFileSync(cp)):null
  const dat=fs.existsSync(op)?JSON.parse(fs.readFileSync(op)):null
  const idx=fs.existsSync(ip)?JSON.parse(fs.readFileSync(ip)):null
  for(const c of kjv.chapters){
    const lc=lib?.chapters?.find(x=>x.chapter===c.chapter), dc=dat?.chapters?.find(x=>x.chapter===c.chapter), ic=idx?.chapters?.find(x=>x.chapter===c.chapter)
    for(const v of Object.keys(c.verses).map(Number)){
      tot++
      let o=null, ofb=false
      if(dc?.commentary){ o=extractVerseAnchoredText(dc.commentary,c.chapter,v,2000)||null; ofb=o&&o===dc.commentary.slice(0,2000).trim() }
      let n=null
      if(lc?.commentary) n=readCalvinVerse(lc.commentary,ic,v)
      if(lc?.commentary&&ic&&ic.textLength!==lc.commentary.length) stale++
      if(o) {oldAns++; if(ofb) oldFallback++}
      if(n) newAns++
      if(o&&!n){newNullOldAns++; if(!ofb){newNullOldProper++; if(examples.nullProper.length<8) examples.nullProper.push(b+' '+c.chapter+':'+v+' old='+o.slice(0,80).replace(/\s+/g,' '))}}
      if(n&&o&&ofb) newAnsOldFallback++
      if(n&&!o){newAnsOldNull++}
      if(!n&&!o) bothNull++
      const pb=perBook[b]=perBook[b]||{tot:0,newAns:0,oldAns:0}; pb.tot++; if(n)pb.newAns++; if(o)pb.oldAns++
    }
  }
}
console.log({tot,oldAns,oldFallbackToChapterOpening:oldFallback,newAns,newNullOldAns,newNullOldProper,newAnsOldFallback,newAnsOldNull,bothNull,staleChapters:stale})
console.log(JSON.stringify(examples,null,1))
const low=Object.entries(perBook).filter(([k,v])=>v.newAns<v.oldAns*0.9).map(([k,v])=>k+':'+v.newAns+'/'+v.oldAns); console.log('books where new answers <90% of old:',low.join(' '))
