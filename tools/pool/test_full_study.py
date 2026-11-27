#!/usr/bin/env python3
"""Full-study rail tests: the stand-in study (fixtures/full_standin.json, written by hand, no model call) passes, and each study built
to break one rule is caught. usage: test_full_study.py. Also checks that code, not the model, chose the destinations."""
import sys, os, copy, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import full_study as FS, destinations as D

def main():
    M = FS.materials(); base = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'full_standin.json')))['study']
    fails = []; p, st = FS.check(base, M)
    if p: fails.append(f'stand-in should pass: {p}')
    d = D.choose('JHN', 3, 16, 18, 16, 21)
    if (FS.label(d['road']), FS.label(d['hill'])) != ('Romans 5:8', 'John 15:13'): fails.append(f'destinations changed: {d}')
    if d['hill']['book'] == 'JHN' and d['hill']['chapter'] == 3 and 16 <= d['hill']['verse'] <= 21: fails.append('Over the Hill loops back to the study unit')
    cases = []
    def case(rule, why, fn):
        f = copy.deepcopy(base); fn(f); cases.append((rule, why, f))
    B = lambda f, v: next(b for b in f['body'] if b['verse'] == v)
    Pc = lambda f, pid: next(p for b in f['body'] for p in b['pieces'] if p['piece'] == pid)
    case('F1', 'Rabbi Road missing', lambda f: f.pop('rabbi_road'))
    case('F1', 'a bridge after the last verse', lambda f: B(f, 18).__setitem__('bridge', dict(text='And so on.', evidence=['JHN.3.18'])))
    case('F1', 'a missing bridge', lambda f: B(f, 16).__setitem__('bridge', None))
    case('F3', 'opening over its length limit', lambda f: f['opening'].__setitem__('text', f['opening']['text'] * 3))
    case('F3', 'summary over its cap', lambda f: Pc(f, 'MHC3.18.01').__setitem__('summary', Pc(f, 'MHC3.18.01')['summary'] * 3))
    case('W2', 'opening cites a passage not in the study', lambda f: f['opening']['evidence'].append('CAL3.16.01'))
    case('W2', 'Rabbi Road quotes a passage not offered', lambda f: f['rabbi_road'].__setitem__('quote', ['MHC5.8.01']))
    case('W2', 'Rabbi Road quotes three passages', lambda f: f['rabbi_road'].__setitem__('quote', ['MHC5.8.03', 'MHC5.8.04', 'GIL5.8.02']))
    case('W2', 'Over the Hill cites a study passage', lambda f: f['over_the_hill']['evidence'].append('MHC3.16.05'))
    case('W3', 'verses out of order', lambda f: f['body'].reverse())
    case('W9', 'a passage left out', lambda f: B(f, 16)['pieces'].pop())
    case('W5', 'names a teacher not in evidence', lambda f: f['opening'].__setitem__('text', 'Calvin helps us slow down and read John 3:16 with the two verses that follow.'))
    case('W6', 'adds a Bible reference', lambda f: f['over_the_hill'].__setitem__('text', 'One hop further, as in 1 John 4:9, Jesus tells us what the greatest love looks like.'))
    case('W7', 'adds a name mid-sentence', lambda f: Pc(f, 'AUG3.17-18.1.01').__setitem__('summary', 'Augustine pictures Christ as a physician, like Luke. He came to heal the sick.'))
    case('W7', 'adds a name at a sentence start', lambda f: f['rabbi_road'].__setitem__('text', 'Moses would have marveled. ' + f['rabbi_road']['text']))
    case('W7', 'adds a number', lambda f: Pc(f, 'CHR3.16.1.01').__setitem__('summary', 'Chrysostom measures this love by the gift, given for 12 ungrateful slaves.'))
    case('W8', 'quotation marks', lambda f: Pc(f, 'MHC3.16.05').__setitem__('heading', 'Wonder at a "worthless" world'))
    case('W8', 'markdown', lambda f: f['over_the_hill'].__setitem__('text', 'One hop further, the *greatest* love: someone lays down his life for his friends.'))
    case('W11', 'claim about teachers in general', lambda f: f['opening'].__setitem__('text', 'All the teachers read John 3:16 the same way: God so loved the world that he gave his Son.'))
    case('W12', 'a bridge brings in its own idea', lambda f: B(f, 16)['bridge'].__setitem__('text', 'Grace abounds; the next verse explains the mission of the Son.'))
    case('W10', 'too much AI text', lambda f: [Pc(f, p['id']).__setitem__('summary', Pc(f, p['id'])['summary'] + ' ' + Pc(f, p['id'])['summary'][:100]) for b in M['body'] for p in b['pieces']]
         + [f['rabbi_road'].__setitem__('text', f['rabbi_road']['text'] + ' ' + f['rabbi_road']['text'][:300])]
         + [f['over_the_hill'].__setitem__('text', f['over_the_hill']['text'] + ' ' + f['over_the_hill']['text'][:200])]
         + [f['opening'].__setitem__('text', f['opening']['text'] + ' ' + f['opening']['text'][:180])])
    for rule, why, f in cases:
        got = {r for r, _ in FS.check(f, M)[0]}
        if rule not in got: fails.append(f'{rule} not caught ({why}); got {sorted(got) or "nothing"}')
    if FS.parse('not json') is not None or FS.parse('Here: {"a": 1}') != {'a': 1}: fails.append('reply parsing')
    print(f'full-study tests: stand-in checked, destinations checked, {len(cases)} bad studies, ' + ('all pass' if not fails else f'{len(fails)} FAIL'))
    for f in fails: print('FAIL', f)
    return len(fails)

if __name__ == '__main__': sys.exit(1 if main() else 0)
