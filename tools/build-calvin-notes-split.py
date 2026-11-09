#!/usr/bin/env python3
# Builds the editors'-notes layer for Calvin and the patch that takes the notes out of the commentary text.
# Usage (repo root):  python3 tools/build-calvin-notes-split.py library
# Writes: library/commentary-notes/Calvin/{ISA,ACT,EZK}.json   (the notes, kept word for word, each with its place in the text)
#         library/patches/calvin-notes-split.json              (what is cut from which chapter; applied by the rule calvin-notes-split)
# Our Isaiah and Acts carry the Calvin Translation Society editors' footnotes inside the commentary: a marker like [7] in the text and a
# "Footnotes:" list (one at the end of each Isaiah chapter, one after each section in Acts). That is the editors' voice, not Calvin's.
# Nothing is rewritten: the markers and the lists are cut out whole, and every cut is kept here, so the old chapter can be rebuilt exactly.
# Ezekiel "chapter 21" is not Calvin: it is the translator's closing note (Calvin's Latin ends at chapter 20). It moves here whole.
import re, json, os, sys, hashlib
lib = sys.argv[1]
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
MARK = re.compile(r'\[(\d+)\]')
def load(code): return json.load(open(os.path.join(lib, 'commentary/Calvin', code + '.json'), encoding='utf-8'))
os.makedirs(os.path.join(lib, 'commentary-notes/Calvin'), exist_ok=True)
patch = {'schemaVersion': 1, 'note': 'Editors\' notes cut out of Calvin\'s Isaiah and Acts, and Ezekiel chapter 21 (translator\'s note) moved out. Each chapter records the sha256 before and after. spans: off = place in the old text, at = place in the new text; a marker span removes only the marker (and one space where it would leave two), a block span removes a "Footnotes:" list that library/commentary-notes/Calvin holds word for word.', 'chapters': []}
stats = {}
for code in ('ISA', 'ACT'):
    d = load(code); notes = []; st = dict(chapters=0, markers=0, markers_with_space=0, blocks=0, notes=0, empty=0, unmatched_markers=[], no_marker_notes=0)
    for ch in d['chapters']:
        t = ch['commentary']; n_ch = ch['chapter']
        # paragraphs with offsets
        paras = []; pos = 0
        for p in t.split('\n\n'):
            paras.append((pos, pos + len(p), p)); pos += len(p) + 2
        spans = []; chnotes = []; i = 0; seen_note_paras = 0
        while i < len(paras):
            if paras[i][2] == 'Footnotes:':
                assert i > 0, (code, n_ch)
                j = i + 1; items = []
                while j < len(paras) and re.match(r'\[\d+\] ', paras[j][2]):
                    m = re.match(r'\[(\d+)\] ', paras[j][2]); items.append((int(m.group(1)), paras[j][2][m.end():])); j += 1
                assert items, (code, n_ch, 'empty Footnotes block')
                off = paras[i][0] - 2; end = paras[j - 1][1]
                assert t[off:off + 2] == '\n\n'
                blk = t[off:end]
                assert blk == '\n\nFootnotes:' + ''.join('\n\n[%d] %s' % it for it in items)
                spans.append(dict(off=off, len=end - off, kind='block', n=[a for a, _ in items], sha256=H(blk)))
                chnotes += items; seen_note_paras += len(items); i = j
            else: i += 1
        assert seen_note_paras == sum(bool(re.match(r'\[\d+\] ', p[2])) for p in paras), (code, n_ch, 'a note paragraph outside a block')
        ns = [a for a, _ in chnotes]; assert len(ns) == len(set(ns)), (code, n_ch, 'duplicate note numbers')
        # markers in the text outside the blocks
        blocks = [(s['off'], s['off'] + s['len']) for s in spans]
        for m in MARK.finditer(t):
            if any(a <= m.start() < b for a, b in blocks): continue
            s, e = m.start(), m.end()
            before = t[s - 1] if s > 0 else '\n'; after = t[e] if e < len(t) else '\n'
            if before in ' \n' and after == ' ': e += 1; st['markers_with_space'] += 1          # "word [7] next" -> "word next"
            elif before == ' ' and after in ',.;:)?!': s -= 1; st['markers_with_space'] += 1    # "word [7]," -> "word,"
            spans.append(dict(off=s, len=e - s, kind='marker', s=t[s:e], n=int(m.group(1))))
        spans.sort(key=lambda x: (x['off'], x['kind'] == 'block'))
        for a, b in zip(spans, spans[1:]): assert a['off'] + a['len'] <= b['off'], (code, n_ch, 'overlap')
        # new text and the place of each span in it
        out = []; last = 0; removed = 0
        for s in spans:
            out.append(t[last:s['off']]); s['at'] = s['off'] - removed; removed += s['len']; last = s['off'] + s['len']
        out.append(t[last:]); new = ''.join(out)
        # rebuild test: the old chapter must come back exactly from the new text, the spans and the notes
        nt = dict(chnotes); rb = []; last = 0
        for s in spans:
            rb.append(new[last:s['at']]); last = s['at']
            rb.append(s['s'] if s['kind'] == 'marker' else '\n\nFootnotes:' + ''.join('\n\n[%d] %s' % (k, nt[k]) for k in s['n']))
        rb.append(new[last:]); assert ''.join(rb) == t, (code, n_ch, 'rebuild differs')
        # where each note was called from: its first marker
        first = {}
        for s in spans:
            if s['kind'] == 'marker': first.setdefault(s['n'], s)
        for k, txt in chnotes:
            e = dict(chapter=n_ch, n=k)
            if k in first: e['at'] = first[k]['at']
            else: st['no_marker_notes'] += 1
            if txt == '{Bogus footnote}': e['empty'] = True; st['empty'] += 1
            else: e['text'] = txt
            notes.append(e)
        mk = [s for s in spans if s['kind'] == 'marker']; st['markers'] += len(mk); st['blocks'] += sum(s['kind'] == 'block' for s in spans); st['notes'] += len(chnotes); st['chapters'] += 1
        for s in mk:
            if s['n'] not in nt: st['unmatched_markers'].append((n_ch, s['n']))
        patch['chapters'].append(dict(book=code, chapter=n_ch, beforeSha256=H(t), afterSha256=H(new), spans=[{k: v for k, v in s.items() if k != 'sha256' or s['kind'] == 'block'} for s in spans]))
    json.dump(dict(layer='editors-notes', source='calvin', book=code,
        about='The Calvin Translation Society editors\' footnotes to Calvin\'s %s, kept word for word and apart from the commentary text. "at" is the place in the chapter text (library/commentary/Calvin) where the note was called; a note with "empty": true had no text in our source (a placeholder) and is listed only so the numbering is complete. Not Calvin\'s own words.' % code,
        count=len(notes), emptyPlaceholders=st['empty'], notes=notes), open(os.path.join(lib, 'commentary-notes/Calvin', code + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    stats[code] = st
# Ezekiel chapter 21 (the translator's closing note) moves out whole
d = load('EZK'); c21 = next(c for c in d['chapters'] if c['chapter'] == 21)
assert c21['commentary'].startswith('As Calvin’s Latin Translation ends here'), c21['commentary'][:60]
patch['chapters'].append(dict(book='EZK', chapter=21, beforeSha256=H(c21['commentary']), afterSha256=None, removeChapter=True, spans=[]))
json.dump(dict(layer='editors-notes', source='calvin', book='EZK',
    about='Ezekiel "chapter 21" in our Calvin was not Calvin: it is the translator\'s closing note (Calvin\'s Latin translation ends at chapter 20). Kept whole and word for word; it was cut out of the commentary.',
    count=0, emptyPlaceholders=0, notes=[], chapterMatter=[dict(chapter=21, kind='translator-closing-note', sha256=H(c21['commentary']), text=c21['commentary'])]),
    open(os.path.join(lib, 'commentary-notes/Calvin/EZK.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(patch, open(os.path.join(lib, 'patches/calvin-notes-split.json'), 'w', encoding='utf-8'), ensure_ascii=False)
for k, v in stats.items(): print(k, {a: (b if not isinstance(b, list) else b) for a, b in v.items()})
print('patch chapters', len(patch['chapters']))
