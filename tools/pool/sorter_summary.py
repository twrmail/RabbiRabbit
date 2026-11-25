import json,glob,sys,os
sys.path.insert(0,'tools')
import validator as V, run_validator as RV
out={}
for path in sorted(glob.glob('reports4/diagnostic-*.json')):
    n=os.path.basename(path)[11:-5]; rep,pool,cov,req=RV.load(path)
    gaps=V.make_gaps(pool,req,cov,'public')
    plan=json.load(open(f'plans/plan-{n}-claude-sorter.json'))
    v=V.validate(plan,pool,req,gaps,'public',V.DEFAULT_BUDGET)
    out[n]=dict(passage=rep['passage'],ok=v['ok'],stats=v['stats'],warnings=v['warnings'],rejections=v['rejections'],gaps=len(gaps))
    print(n,v['ok'],v['stats']['picked'],v['stats']['chars'],'gaps',len(gaps));
    for w in v['warnings']: print('   W',w['kind'],w.get('verse'),w['msg'][:110])
json.dump(out,open('val5/sorter-summary.json','w'),indent=1)
