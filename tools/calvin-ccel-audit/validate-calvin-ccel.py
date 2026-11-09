"""Compare library/commentary/Calvin against CCEL's ThML (read-only).
Run from the repo root:  CCEL_DIR=/tmp/ccel OUT_DIR=/tmp/out python3 -I tools/calvin-ccel-audit/validate-calvin-ccel.py
CCEL_DIR must hold calcom01.xml .. calcom45.xml (see README.md). Writes JSON results to OUT_DIR. Changes nothing in the repo.
"""
import re,json,glob,os,html,unicodedata
CCEL_DIR=os.environ.get('CCEL_DIR','/tmp/ccel');OUT_DIR=os.environ.get('OUT_DIR','.');os.makedirs(OUT_DIR,exist_ok=True)
from collections import Counter,defaultdict
OSIS={'Gen':'GEN','Exod':'EXO','Lev':'LEV','Num':'NUM','Deut':'DEU','Josh':'JOS','Ps':'PSA','Isa':'ISA','Jer':'JER','Lam':'LAM','Ezek':'EZK','Dan':'DAN','Hos':'HOS','Joel':'JOL','Amos':'AMO','Obad':'OBA','Jonah':'JON','Mic':'MIC','Nah':'NAH','Hab':'HAB','Zeph':'ZEP','Hag':'HAG','Zech':'ZEC','Mal':'MAL','Matt':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','Rom':'ROM','1Cor':'1CO','2Cor':'2CO','Gal':'GAL','Eph':'EPH','Phil':'PHP','Col':'COL','1Thess':'1TH','2Thess':'2TH','1Tim':'1TI','2Tim':'2TI','Titus':'TIT','Phlm':'PHM','Heb':'HEB','Jas':'JAS','1Pet':'1PE','2Pet':'2PE','1John':'1JN','2John':'2JN','3John':'3JN','Jude':'JUD'}
def norm(s):
    s=html.unescape(s).lower().replace('’',"'").replace('‘',"'")
    s=''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]','',s)
def walk(x,p):
    if isinstance(x,str): p.append(x)
    elif isinstance(x,list): [walk(i,p) for i in x]
    elif isinstance(x,dict): [walk(i,p) for i in x.values()]
libbook={};libch=defaultdict(dict)
for f in glob.glob('library/commentary/Calvin/*.json'):
    b=os.path.basename(f)[:-5];d=json.load(open(f,encoding='utf8'));p=[];walk(d,p);libbook[b]=norm(' '.join(p))
    for c in d.get('chapters',[]):
        q=[];walk(c,q);libch[b][c.get('chapter')]=norm(' '.join(q))
alltext=''.join(libbook.values())
lat=re.compile(r'\b(et|est|quae|qui|quod|non|ad|cum|sed|ut|autem|enim|dei|esse|erat|les|des|que|une|aux)\b',re.I)
eng=re.compile(r'\b(the|and|of|that|is|he|his|to|in|a)\b',re.I)
def wins(n):
    n=re.sub(r'^\d+','',n);L=len(n);return [n[:40],n[L//2-20:L//2+20],n[-40:]]
SC=re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>')
DIV=re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>(?:</p>)?\s*(?:<a [^>]*/>)?\s*(?:</p>)?\s*<div class="Commentary"[^>]*>',re.S)
stats={};anom=[]
def blocks_div(t,v,st):
    allm=[m.start() for m in SC.finditer(t)]
    for m in DIV.finditer(t):
        i=m.end();depth=1;end=None
        for k in re.finditer(r'<div\b|</div>',t[i:]):
            depth+=1 if k.group(0)=='<div' else -1
            if depth==0: end=i+k.start();break
        nxt=next((a for a in allm if a>=i),len(t))
        if end is None: st['unterminated']+=1;end=nxt
        elif end>nxt: st['capped_at_next_marker']+=1;end=nxt   # balanced end ran past next marker: malformed nesting
        body=t[i:end]
        if '<div' in body: st['nested']+=1;st['nested_classes'].update(re.findall(r'<div class="([^"]*)"',body))
        st['bodylen'].append(len(body))
        yield m.group(1),body
def blocks_flat(t,v,st):
    ms=list(SC.finditer(t))
    for i,m in enumerate(ms):
        end=ms[i+1].start() if i+1<len(ms) else len(t)
        seg=re.sub(r'<table.*?</table>','',t[m.end():end],flags=re.S)
        seg=re.sub(r'<p class="[^"]*(?:SCRIPTURE|Footnote)[^"]*".*?</p>','',seg,flags=re.S)
        st['bodylen'].append(len(seg));yield m.group(1),seg
def bc(ref):
    r=ref.replace('Bible:','').split('-')[0].split('.')
    return OSIS.get(r[0]),(int(r[1]) if len(r)>1 and r[1].isdigit() else None),r[0]
chparas=defaultdict(list);foreign=[];uncertain=[];res=defaultdict(list);unmapped=Counter();perbook=defaultdict(lambda:defaultdict(lambda:[0,[]]))
for f in sorted(glob.glob(os.path.join(CCEL_DIR,'calcom*.xml'))):
    v=int(os.path.basename(f)[6:8]);t=open(f,encoding='utf8').read()
    st=Counter();st['nested_classes']=Counter();st['bodylen']=[]
    st['scripCom_all']=len(re.findall(r'<scripCom',t));st['scripCom_osis']=len(SC.findall(t))
    st['div_commentary']=len(re.findall(r'<div class="Commentary"',t))
    usediv='class="Commentary"' in t
    st['mode']='div' if usediv else 'flat'
    n=0
    for ref,body in (blocks_div(t,v,st) if usediv else blocks_flat(t,v,st)):
        n+=1;b,ch,ob=bc(ref)
        if b is None or ch is None: unmapped[(v,ref)]+=1
        pb=perbook[v][b];pb[0]+=1
        if len(pb[1])<3: pb[1].append(ref.replace('Bible:',''))
        body2=re.sub(r'<note.*?</note>','',body,flags=re.S)
        for p in re.findall(r'<p[ >].*?</p>',body2,re.S):
            raw=re.sub(r'<[^>]+>','',p);nn=norm(raw)
            if len(nn)<60: continue
            nl=len(lat.findall(raw));ne=len(eng.findall(raw))
            if nl>=5 and ne<2:
                (uncertain if ne==1 else foreign).append((v,ref,html.unescape(raw)[:110]))
                if ne==1: pass
                else: continue
            txt=re.sub(r'\s+',' ',html.unescape(raw))
            chparas[(b,ch)].append((v,ref,nn,txt))
            w=wins(nn);own=libbook.get(b,'');h=sum(x in own for x in w)
            if h==3: continue
            other=any(x in alltext for x in w)
            cat=('NONE'+('+in-other-book' if other else '')) if h==0 else f'PARTIAL-{h}of3'
            res[cat].append((v,ref,txt[:130]))
    st['blocks']=n;st['unpaired_markers']=(st['scripCom_osis']-n) if usediv else 0
    st['orphan_divs']=(st['div_commentary']-n) if usediv else 0
    st['maxbody']=max(st['bodylen']) if st['bodylen'] else 0;del st['bodylen']
    stats[v]=st
bnd=[]
for (b,ch),ps in chparas.items():
    if b not in libch or ch not in libch[b]: bnd.append(('NO-LIB-CHAPTER',b,ch,ps[0][3][:100]));continue
    txt=libch[b][ch]
    for which,p in (('first',ps[0]),('last',ps[-1])):
        w=wins(p[2]);key=w[0] if which=='first' else w[2]
        if key not in txt: bnd.append((f'{which}-qualifying-ABSENT'+('(in-other-chapter)' if key in libbook.get(b,'') else ''),b,ch,p[3][:100]))
print('== PART 1 extraction (vol mode scripCom_all osis blocks unpaired orphan_divs nested capped unterminated maxbody)')
for v,s in sorted(stats.items()): print(v,s['mode'],s['scripCom_all'],s['scripCom_osis'],s['blocks'],s['unpaired_markers'],s['orphan_divs'],s['nested'],s['capped_at_next_marker'],s['unterminated'],s['maxbody'])
print('TOTAL nested blocks',sum(s['nested'] for s in stats.values()),'capped',sum(s['capped_at_next_marker'] for s in stats.values()),'unterminated',sum(s['unterminated'] for s in stats.values()))
nc=Counter()
for s in stats.values(): nc.update(s['nested_classes'])
print('nested div classes',nc.most_common(8))
print('unmapped refs',sum(unmapped.values()),list(unmapped.items())[:15])
print('== PART 3 multi-book volumes (vol: book blocks examples)')
for v in (3,4,5,6,17,21,27,28,29,30,31,32,33,39,40,42,43,45):
    print(v,{b:(c[0],c[1][:2]) for b,c in perbook[v].items()})
nolib=[x for x in bnd if x[0]=='NO-LIB-CHAPTER'];print('qualifying (book,chapter) not in library:',len(nolib),[(x[1],x[2]) for x in nolib][:20])
print('== PART 4 language: certain-foreign',len(foreign),'uncertain(1 English word; KEPT and tested)',len(uncertain))
for x in uncertain[:10]: print('  U',x)
print('== PART 5 counts',{k:len(v) for k,v in res.items()},'boundary',Counter(x[0] for x in bnd))
json.dump({'stats':{k:{a:(dict(b) if isinstance(b,Counter) else b) for a,b in v.items()} for k,v in stats.items()},'res':res,'bnd':bnd,'foreign':foreign,'uncertain':uncertain},open(os.path.join(OUT_DIR,'validate.json'),'w'),ensure_ascii=False)

print('== PART 6 adjudication: 5-word-sequence coverage of the full CCEL paragraph in the library')
def words(x):
    x=html.unescape(x).lower().replace('’',"'").replace('‘',"'")
    x=''.join(c for c in unicodedata.normalize('NFKD',x) if not unicodedata.combining(c))
    return re.findall(r"[a-z0-9]+",x.replace("'",''))
grams={}
for f in glob.glob('library/commentary/Calvin/*.json'):
    b=os.path.basename(f)[:-5];p=[];walk(json.load(open(f,encoding='utf8')),p);w=words(' '.join(p));grams[b]={tuple(w[i:i+5]) for i in range(len(w)-4)}
allg=set().union(*grams.values())
def cov(txt,b):
    w=words(txt);g=[tuple(w[i:i+5]) for i in range(len(w)-4)]
    if not g: return None
    return round(100*sum(x in grams[b] for x in g)/len(g)),round(100*sum(x in allg for x in g)/len(g)),len(w)
targets={('GEN',1):'Gen.1.1',('ISA',19):'Isa.19.1',('ISA',39):'Isa.39.8',('LAM',5):'Lam.5.22',('ACT',6):'Acts.6.2'}
adj=[]
for (b,ch),ref in targets.items():
    ps=[p for p in chparas[(b,ch)] if p[1]=='Bible:'+ref]
    print(ref,'paragraphs in CCEL block:',len(ps))
    for p in ps:
        c=cov(p[3],b);print('   own-book%, any-book%, words =',c,'|',p[3][:70]);adj.append((ref,c,p[3][:90]))
json.dump(adj,open(os.path.join(OUT_DIR,'adjudicate.json'),'w'),ensure_ascii=False)
print('== PART 7 flagged paragraphs re-scored by 5-word-sequence coverage of the whole paragraph (own book)')
hg=re.compile(r'[֐-׿Ͱ-Ͽἀ-῿]')
bucket=defaultdict(list)
for (b,ch),ps in chparas.items():
    for (v,ref,nn,txt) in ps:
        w=wins(nn);own=libbook.get(b,'');h=sum(x in own for x in w)
        if h==3: continue
        c=cov(txt,b)
        cv=c[0] if c else None
        scr='script' if hg.search(txt) else 'plain'
        if cv is None: k='too-short-to-score'
        elif cv>=85: k='PRESENT (window artefact)'
        elif cv>=50: k='SUSPECT-partial(50-84%)'
        else: k='MISSING(<50%)'
        bucket[(k,scr)].append((v,ref,cv,txt[:100]))
for k,v in sorted(bucket.items()): print(k,len(v))
for k in [x for x in bucket if x[0].startswith('MISSING') or x[0].startswith('SUSPECT')]:
    print('---',k)
    for r in bucket[k][:40]: print('  ',r)
bb=Counter(x[1].split('.')[0] for k in bucket if k[0].startswith('PRESENT') for x in bucket[k]);print('PRESENT by book',bb.most_common(8))
json.dump({str(k):v for k,v in bucket.items()},open(os.path.join(OUT_DIR,'validate-buckets.json'),'w'),ensure_ascii=False)
