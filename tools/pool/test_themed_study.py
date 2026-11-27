#!/usr/bin/env python3
"""Themed-study rail tests: the hand-written stand-in (fixtures/themed_standin.json, no model call) passes, and each study built to
break one rule is caught. usage: test_themed_study.py"""
import sys, os, copy, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import themed_study as TS

def main():
    M = TS.materials(); base = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'themed_standin.json')))['study']
    fails = []; p, st = TS.check(base, M)
    if p: fails.append(f'stand-in should pass: {p}')
    C = {c['id']: c for c in M['passages']}
    if any(c['rights'] not in 'AB' for c in M['passages']): fails.append('a withheld passage is offered')
    if any(len(c['sentences']) != len(c['spans']) or ''.join(c['sentences']) .replace(' ', '') != ''.join(c['text'][a:b] for a, b in c['spans']).replace(' ', '') for c in M['passages']):
        fails.append('sentence list does not match the passage text')
    t, lead, tail = TS.excerpt(C['MHC3.16.05'], 0, 1)
    if not (C['MHC3.16.05']['text'].startswith(t) and not lead and tail): fails.append('excerpt is not exact')
    cases = []
    def case(rule, why, fn):
        f = copy.deepcopy(base); fn(f); cases.append((rule, why, f))
    S = lambda f, n: f['sections'][n]
    Fl = lambda f, n, j: f['sections'][n]['flow'][j]
    case('F1', 'sections missing', lambda f: f.pop('sections'))
    case('T2', 'a verse left out', lambda f: S(f, 2).__setitem__('verses', []))
    case('T2', 'verses out of order', lambda f: (S(f, 0).__setitem__('verses', [17]), S(f, 1).__setitem__('verses', [16])))
    case('T2', 'one section only', lambda f: f.__setitem__('sections', [dict(S(f, 0), verses=[16, 17, 18])]))
    case('T3', 'a section with verses and no quotation', lambda f: S(f, 2).__setitem__('flow', [Fl(f, 2, 2)]))
    case('T3', 'quotes a passage on another verse', lambda f: S(f, 0)['flow'].extend([dict(text='Matthew Henry looks ahead.', evidence=['MHC3.18.01']), dict(quote='MHC3.18.01', **{'from': 0, 'to': 0})]))
    case('T4', 'a passage that was not offered', lambda f: Fl(f, 0, 1).__setitem__('quote', 'MHC3.19.01'))
    case('T4', 'sentences past the end', lambda f: Fl(f, 0, 1).__setitem__('to', 9))
    case('T4', 'from after to', lambda f: Fl(f, 0, 1).update({'from': 1, 'to': 0}))
    case('T4', 'the same passage twice', lambda f: S(f, 0)['flow'].extend([dict(text='Henry again.', evidence=['MHC3.16.05']), dict(quote='MHC3.16.05', **{'from': 2, 'to': 2})]))
    case('T5', 'a quotation too long', lambda f: Fl(f, 0, 3).update({'from': 0, 'to': 6}))
    case('T1', 'a quotation with no introduction', lambda f: S(f, 0)['flow'].pop(0))
    case('T1', 'introduction does not name the teacher', lambda f: Fl(f, 0, 2).__setitem__('text', 'Another old teacher asks what kind of love this is.'))
    case('T1', 'introduction does not cite the passage', lambda f: Fl(f, 0, 2).__setitem__('evidence', ['JHN.3.16']))
    case('T6', 'fewer than four teachers', lambda f: (S(f, 1)['flow'].__delitem__(slice(0, 2)), S(f, 2)['flow'].__delitem__(slice(0, 2)), S(f, 1)['flow'].insert(0, dict(text='Henry hears the question.', evidence=['MHC3.17.02']))))
    case('T6', 'one teacher three times', lambda f: S(f, 2)['flow'][0:2].__class__ and (S(f, 2)['flow'].__setitem__(0, dict(text='Matthew Henry turns to the believer.', evidence=['MHC3.18.01'])), S(f, 2)['flow'].__setitem__(1, dict(quote='MHC3.18.01', **{'from': 0, 'to': 0})), S(f, 2)['flow'].insert(0, dict(text='First, Jamieson, Fausset and Brown.', evidence=['JFB3.18.01'])), S(f, 2)['flow'].insert(1, dict(quote='JFB3.18.01', **{'from': 0, 'to': 0}))))
    case('T7', 'a quotation that starts mid-thought', lambda f: Fl(f, 1, 1).update({'from': 1, 'to': 3}))
    case('W8', 'a teacher quoted inside the narrative', lambda f: Fl(f, 0, 0).__setitem__('text', 'Matthew Henry says, "Behold, and wonder."'))
    case('W5', 'names a teacher not in evidence', lambda f: f['opening'].__setitem__('text', 'Calvin helps us read these verses slowly.'))
    case('W6', 'adds a Bible reference', lambda f: Fl(f, 2, 2).__setitem__('text', 'As 1 John 4:9 says, love was shown.'))
    case('W11', 'claims what teachers hold in general', lambda f: Fl(f, 2, 2).__setitem__('text', 'All the teachers agree on this.'))
    case('W2', 'narrative with no evidence', lambda f: Fl(f, 2, 2).__setitem__('evidence', []))
    case('W2', 'Rabbi Road quotes a passage not offered', lambda f: f['rabbi_road'].__setitem__('quote', ['MHC5.8.01']))
    case('F3', 'opening over its length limit', lambda f: f['opening'].__setitem__('text', f['opening']['text'] * 5))
    for rule, why, f in cases:
        p, _ = TS.check(f, M); got = {r for r, _ in p}
        if rule not in got: fails.append(f'{why}: expected {rule}, got {sorted(got) or "nothing"}')
    print(f'themed-study tests: stand-in checked, {len(cases)} bad studies,', 'all pass' if not fails else f'{len(fails)} FAIL')
    for x in fails: print('FAIL', x)
    return not fails

if __name__ == '__main__': sys.exit(0 if main() else 1)
