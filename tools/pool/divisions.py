"""Divisions report: where do the sources' own units cut a passage, and does a request fit?
Usage: python3 tools/divisions.py REPORTS_DIR OUT_DIR   (no model calls)
Binds: a range note (e.g. Calvin 35-36) forbids a cut inside it.  Heads: Henry roman-numeral openers and
range-note starts are candidate story/section breaks.  A cut between v and v+1 is 'standard' if >=2 sources head at v+1 and no source binds it."""
import sys,os,glob,json,re
sys.path.insert(0,os.path.dirname(__file__))
import run_validator as RV
ROMAN=re.compile(r'^(?:[IVX]+)\.$')
def analyse(rep,pool,req):
    lo,hi=req['lo'],req['hi']; notes={}
    romans={}
    for p in pool:
        if p['source_id']=='mhc' and p.get('outline_label') and ROMAN.match(p['outline_label']): romans.setdefault(p['anchor_verse'],p['outline_label'])
    for p in pool:
        k=p['note_id']
        if k not in notes: notes[k]=dict(src=p['source_id'],span=p['note_span'],label=p.get('outline_label'),anchor=p['anchor_verse'])
    binds={}; heads={}
    VOTERS=('mhc','calvin','jfb','gill')            # Fathers/Catena ranges are collections, not divisions: listed, never vote
    wide=0.6*(hi-lo+1)
    for n in notes.values():
        a,b=n['span']
        if n['src'] not in VOTERS: continue
        if b-a+1>=wide and hi>lo: continue          # a note spanning most of the passage is a whole-passage remark, not a unit
        for v in range(a,b): binds.setdefault(v,set()).add(n['src'])      # no cut between v and v+1
        if b>a: heads.setdefault(a,set()).add(n['src'])
    for v in romans: heads.setdefault(v,set()).add('mhc')
    cuts=[]
    for v in range(lo,hi):                                   # cut between v and v+1
        bd=sorted(binds.get(v,())); hd=sorted(heads.get(v+1,()))
        cuts.append(dict(after=v,bound_by=bd,headed_by=hd,standard=bool(len(hd)>=2 and not bd),status='bound' if bd else ('standard' if len(hd)>=2 else ('weak' if hd else 'open'))))
    return notes,cuts
def fit(req,cuts_all,notes):
    lo,hi=req['lo'],req['hi']; reasons=[]
    # does request start/end cut through a bound unit that lies beyond the request?
    for n in notes.values():
        a,b=n['span']
        if n['src'] not in ('mhc','calvin','jfb','gill'): continue
        if a<lo<=b: reasons.append(f"start v{lo} is inside {n['src']} note {a}-{b}")
        if a<=hi<b: reasons.append(f"end v{hi} is inside {n['src']} note {a}-{b}")
    return ('division' if not reasons else 'verse'),reasons
def main(rd,out):
    os.makedirs(out,exist_ok=True); allj={}
    for path in sorted(glob.glob(f'{rd}/diagnostic-*.json')):
        n=os.path.basename(path)[11:-5]; rep,pool,cov,req=RV.load(path)
        notes,cuts=analyse(rep,pool,req); mode,why=fit(req,cuts,notes)
        # movements: split at standard cuts
        mv=[];s=req['lo']
        for c in cuts:
            if c['status']=='standard': mv.append((s,c['after'])); s=c['after']+1
        mv.append((s,req['hi']))
        allj[n]=dict(passage=rep['passage'],mode=mode,why=why,cuts=cuts,movements=mv)
        L=[f"# Divisions: {rep['passage']}",'',f"mode suggested: **{mode}**"+('' if not why else ' ('+'; '.join(why)+')'),'',f"movements at standard cuts: {', '.join(f'{a}-{b}' if a!=b else str(a) for a,b in mv)}",'','| cut after | status | headed by (next verse) | bound by |','|---|---|---|---|']
        for c in cuts: L.append(f"| {c['after']} | {c['status']} | {', '.join(c['headed_by'])} | {', '.join(c['bound_by'])} |")
        open(f'{out}/divisions-{n}.md','w').write('\n'.join(L)+'\n'); print(n,mode,mv)
    json.dump(allj,open(f'{out}/divisions.json','w'),indent=1)
if __name__=='__main__': main(*sys.argv[1:3])
