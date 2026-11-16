#!/usr/bin/env python3
"""Build a verse-level index to Matthew Henry's Commentary (MHC), read-only.

For every verse of every book it records where Henry's comment on that verse
begins and ends (character offsets into library/commentary/MHC/<BOOK>.json).
No commentary text is copied. Two independent signs are used and must not
contradict: Henry's own citation of the verse ("Joh 6:5") and the King James
words he prints in italics. A citation covering two or three verses at the head
of a paragraph marks them as treated together. Output mirrors the Calvin index
layout under library/commentary-index/. Run from the repo root:

    python3 tools/build-mhc-index.py            # build all 66 books
    python3 tools/build-mhc-index.py JHN        # one book

The method and its validation are recorded in claude/henry-index-trial-nov15.md.
"""
import json,re,sys,collections,hashlib,os,glob

L=os.path.join(os.path.dirname(__file__),'..','library')
def jload(p): return json.load(open(p,encoding='utf-8'))
def words(s): return re.findall(r"[a-z']+", s.lower().replace('’',"'"))
NEAR=900
ROM={r:i+1 for i,r in enumerate('I II III IV V VI VII VIII IX X XI XII XIII XIV XV XVI XVII XVIII XIX XX'.split())}
ORD={'First':1,'Secondly':2,'Thirdly':3,'Fourthly':4,'Fifthly':5,'Sixthly':6,'Seventhly':7,'Lastly':99}
MK=re.compile(r'(?:(?<=\n\n)|(?<=^)|(?<=[.;:!?—"”)] ))(?:\(\d{1,2}\.\)|\[\d{1,2}\.\]|\(\*[a-h]\.\*\)|\*[a-h]\.\*|\*(?:First|Secondly|Thirdly|Fourthly|Fifthly|Sixthly|Seventhly|Lastly),\*|[IVX]{1,5}\. (?=[A-Z"“*])|\d{1,2}\. (?=[A-Z"“*]))')

def detect_abbr(mhc,kjv):
    maxv={ch:max(int(v) for v in vs) for ch,vs in kjv.items()}
    cnt=collections.Counter(); txt='\n'.join(mhc.values())
    for m in re.finditer(r'\b([1-3]?[A-Z][a-z]{1,4})\.? (\d{1,3}):(\d{1,3})',txt):
        ab,c,v=m.group(1),int(m.group(2)),int(m.group(3))
        if c in maxv and v<=maxv[c]: cnt[ab]+=1
    return cnt.most_common(1)[0][0] if cnt else None

def para(text,pos):
    p=text.rfind('\n\n',0,pos); return 0 if p<0 else p+2

def build_book(BOOK):
    kjv={c['chapter']:c['verses'] for c in jload(f'{L}/bible/KJV/{BOOK}.json')['chapters']}
    mhc={c['chapter']:c['commentary'] for c in jload(f'{L}/commentary/MHC/{BOOK}.json')['chapters']}
    ABBR=detect_abbr(mhc,kjv)
    CITE=re.compile(r'\b'+re.escape(ABBR)+r'\.? (\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?((?:,\s?\d{1,3}(?:[-–]\d{1,3})?(?![:\d]))*)')
    ITAL=re.compile(r'\*([^*\n]{6,240})\*')
    SCORE={'A':6,'T':5,'B':4,'C':2,'D':1}; EV={'A':'citation+quotation','B':'citation','C':'quotation','D':'range-citation','T':'range-citation'}
    def markers(text,lo,hi):
        out=[]
        for m in MK.finditer(text,lo,hi):
            g=m.group(0)
            if g[0] in 'IVX': n=ROM.get(re.match(r'[IVX]+',g).group(0))
            elif re.match(r'\*[a-h]',g) or re.match(r'\(\*[a-h]',g): n=ord(re.search(r'[a-h]',g).group(0))-96
            elif g[0]=='*' and g[1].isupper(): n=ORD[re.search(r'[A-Z][a-z]+',g).group(0)]
            else: n=int(re.search(r'\d+',g).group(0))
            if n is None: continue
            if g[0].isdigit() and text[max(0,m.start()-8):m.start()].rstrip().endswith(':'): continue
            kind=('rom' if g[0] in 'IVX' else 'let' if 'a'<=g.strip('(*')[0]<='h' and g.strip('(*')[0].isalpha() else 'ord' if g[0]=='*' else 'paren' if g[0]=='(' else 'brack' if g[0]=='[' else 'num')
            out.append((m.start(),kind,n))
        return out
    def anchor(text,pos,v,OTHER):
        p=para(text,pos); marks=[m for m,_,_ in markers(text,p,pos)]
        if marks:
            mk=marks[-1]
            if not any(mk<o<pos and ov!=v for o,ov in OTHER) and pos-mk<=1500:
                if len(marks)>1 and mk-marks[-2]<=90 and not any(marks[-2]<o<pos and ov!=v for o,ov in OTHER): return marks[-2]
                return mk
        if pos-p<=600 and not any(p<o<pos and ov!=v for o,ov in OTHER): return p
        seg=text[p:pos]; ends=[m.end() for m in re.finditer(r'(?<!\bMr)(?<!\bDr)(?<!\bSt)(?<!\bviz)(?<!:\d)(?<!:\d\d)\.["”’)]* (?=[A-Z"“*(\[])',seg)]
        return p+(ends[-1] if ends else 0)
    out={}
    for ch in sorted(mhc):
        text=mhc[ch]; verses=kjv.get(ch,{}); n=len(verses)
        if not n: continue
        intro=text.find('\n\n'); intro=0 if intro<0 else intro
        heads=[m.start()+2 for m in re.finditer(r'\n\n[^\n]{3,90}\n\n[⁰¹²³⁴-⁹]',text)]
        single=collections.defaultdict(list); together=collections.defaultdict(list); weak=collections.defaultdict(list); quote=collections.defaultdict(list)
        for m in CITE.finditer(text):
            if m.start()<intro or int(m.group(1))!=ch: continue
            spans=[(int(m.group(2)),int(m.group(3) or m.group(2)))]
            for p in re.finditer(r'(\d{1,3})(?:[-–](\d{1,3}))?',m.group(4) or ''): spans.append((int(p.group(1)),int(p.group(2) or p.group(1))))
            vs=set()
            for a,b in spans:
                if 0<=b-a<=2: vs.update(range(a,b+1))
            vs={x for x in vs if 1<=x<=n}
            if not vs or len(vs)>3: continue
            if len(vs)==1: single[next(iter(vs))].append(m.start())
            else:
                head=m.start()-para(text,m.start())<=160
                for x in vs: (together if head else weak)[x].append((m.start(),min(vs),max(vs)))
        vw={int(v):words(t) for v,t in verses.items()}; vs_str={v:' '+' '.join(w)+' ' for v,w in vw.items()}
        grams=collections.defaultdict(set)
        for v,w in vw.items():
            for i in range(len(w)-3): grams[' '.join(w[i:i+4])].add(v)
        for m in ITAL.finditer(text):
            if m.start()<intro: continue
            w=words(m.group(1))
            if len(w)<3: continue
            key=' '+' '.join(w)+' '; hits=[v for v,t in vs_str.items() if key in t]
            if len(hits)==1: quote[hits[0]].append(m.start()); continue
            if hits: continue
            ov=set()
            for i in range(len(w)-3):
                g=grams.get(' '.join(w[i:i+4]))
                if g and len(g)==1: ov|=g
            if len(ov)==1: quote[next(iter(ov))].append(m.start())
        OTHER=sorted([(c,vv) for vv,l in single.items() for c in l]+[(c[0],vv) for d in(together,weak) for vv,l in d.items() for c in l])
        def stretch_end(c,v):
            nx=[o for o,ov in OTHER if o>c and ov!=v]; return min(nx[0] if nx else len(text), c+4000)
        cands=[]
        for v in range(1,n+1):
            qs=sorted(quote[v]); cites=[]
            for c in sorted(single[v]):
                if cites and not any(cites[-1]<o<c and ov!=v for o,ov in OTHER): continue
                cites.append(c)
            for c in cites:
                near=[q for q in qs if c-NEAR<=q<stretch_end(c,v)]; early=[q for q in near if q<c]
                cands.append((anchor(text,min([c]+early),v,OTHER),v,'A' if near else 'B',None))
            for (pos,lo,hi) in together[v]: cands.append((para(text,pos),v,'T',(lo,hi)))
            for (pos,lo,hi) in weak[v]:
                near=[q for q in qs if abs(q-pos)<=NEAR]; cands.append((anchor(text,min([pos]+near),v,OTHER),v,'A' if near else 'D',None))
            for q in qs:
                if not any(c-NEAR<=q<stretch_end(c,v) for c in cites): cands.append((anchor(text,q,v,OTHER),v,'C',None))
        cands.sort(key=lambda c:(c[0],c[1]))
        best=[SCORE[c[2]] for c in cands]; prev=[-1]*len(cands)
        for i,(p,v,g,_) in enumerate(cands):
            for j in range(i):
                pj,vj,gj,_j=cands[j]
                if vj<v and pj<=p and best[j]+SCORE[g]>best[i]: best[i]=best[j]+SCORE[g]; prev[i]=j
        chain=[]
        if cands:
            i=max(range(len(cands)),key=lambda x:(best[x],-x))
            while i>=0: chain.append(cands[i]); i=prev[i]
            chain.reverse()
        placed={v:(p,g,tg) for p,v,g,tg in chain}; order=sorted(placed)
        starts=sorted({placed[v][0] for v in order})
        def end_of(p):
            nx=[x for x in starts if x>p]; hd=[h for h in heads if h>p]
            return min(nx[0] if nx else len(text), hd[0] if hd else len(text))
        res={}
        for idx,v in enumerate(order):
            p,g,tg=placed[v]; e={'at':p,'end':end_of(p),'evidence':EV[g],'relation':'together' if g=='T' else 'own'}
            if g=='T':
                e['with']=list(tg)
                if any(p<=q<=p+NEAR for q in quote[v]): e['evidence']='range-citation+quotation'
                nxt=[placed[x][0] for x in order[idx+1:] if placed[x][0]>p]; hi=nxt[0] if nxt else len(text)
                spec=sorted([anchor(text,c,v,OTHER) for c in single[v] if p<c<hi]+[anchor(text,q,v,OTHER) for q in quote[v] if p<q<hi])
                spec=[s for s in spec if s>p]
                if spec: e['specific']=spec[0]
            res[v]=e
        for v in range(1,n+1):
            if v not in res:
                before=[x for x in order if x<v]
                res[v]=({'at':res[before[-1]]['at'],'end':res[before[-1]]['end'],'evidence':'none','relation':'under-earlier','with':[before[-1],v]} if before
                        else {'at':None,'end':None,'evidence':'none','relation':'none'})
        out[ch]={'text':text,'res':res}
    chapters=[]
    for ch in sorted(out):
        text=out[ch]['text']
        chapters.append({'chapter':ch,'textLength':len(text),'textSha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
                         'verses':{str(v):out[ch]['res'][v] for v in sorted(out[ch]['res'])}})
    return {'book':BOOK,'sourceId':'mhc','layer':'verse-index','abbr':ABBR,
            'about':("Where Matthew Henry's comment on each verse begins and ends (character offsets into "
                     f"library/commentary/MHC/{BOOK}.json). Read-only; no text copied. relation: own / together "
                     "(with the verses in 'with') / under-earlier (no separate comment; falls under 'with'[0]) / none "
                     "(before his first placed verse; chapter opening). evidence: citation+quotation / citation / "
                     "quotation / range-citation / none. 'specific': a nested point treating this verse in particular, "
                     "when one exists. 'textSha256' guards against the commentary changing under the index. "
                     "Built by tools/build-mhc-index.py; method in claude/henry-index-trial-nov15.md."),
            'chapters':chapters}

def main():
    outdir=os.path.join(L,'commentary-index','MHC'); os.makedirs(outdir,exist_ok=True)
    books=[sys.argv[1]] if len(sys.argv)>1 else [os.path.basename(f)[:-5] for f in sorted(glob.glob(f'{L}/commentary/MHC/*.json'))]
    tot=0
    for b in books:
        d=build_book(b); json.dump(d,open(f'{outdir}/{b}.json','w',encoding='utf-8'),separators=(',',':'),ensure_ascii=False)
        nv=sum(len(c['verses']) for c in d['chapters']); tot+=nv
        print(f'{b}: {len(d["chapters"])} chapters, {nv} verses, abbr {d["abbr"]}')
    print(f'TOTAL {tot} verses across {len(books)} books')

if __name__=='__main__': main()
