#!/usr/bin/env python3
"""Private demo page: John 3:16 as Gill wrote it, quotations kept with their footnotes. No model calls."""
import sys, os, html, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adapter_gill as G
lib, out = sys.argv[1], sys.argv[2]
_, cov, notes, ps, f = G.gill(lib, 'JHN', 3, 16, 16, 'John')
H = ['<!doctype html><meta charset=utf-8><title>Gill, John 3:16, with his quotations</title><style>body{font:16px/1.55 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#222}.q{border-left:4px solid #b8a36a;background:#faf6ea;padding:.6rem .9rem;margin:.8rem 0;white-space:pre-wrap}.c{white-space:pre-wrap;margin:.8rem 0}.k{font:12px system-ui;color:#6b5a2e;margin-top:.4rem}.l{font:12px system-ui;color:#999;margin:.8rem 0}h1{font-size:1.3rem}</style>',
     '<h1>John Gill on John 3:16 &mdash; quotations kept with their footnotes</h1><p style="font:13px system-ui;color:#555">Private test. Every block is Gill&rsquo;s own text exactly as stored. Shaded blocks are quotations Gill gives from other works; the source line is Gill&rsquo;s own footnote. No AI wording on this page.</p>']
for p in ps:
    t = html.escape(p['text'])
    if p['piece_kind'] == 'cited_quote':
        c = p['citations'][0]; w = c['raw'] + (f' (same work as before: {c["work"]})' if c['ibid'] else '')
        H.append(f'<div class=q>{t}<div class=k>{p["id"]} &middot; Gill&rsquo;s footnote ({c["letter"]}): {html.escape(w)} &middot; a later Jewish writing that Gill cites</div></div>' if p['jewish_source'] else f'<div class=q>{t}<div class=k>{p["id"]} &middot; Gill&rsquo;s footnote: {html.escape(w)}</div></div>')
    elif p['piece_kind'] == 'citation_list':
        H.append(f'<div class=l>{p["id"]} &middot; Gill&rsquo;s footnote list, held aside; each line travels with its quotation above, never alone</div>')
    else:
        H.append(f'<div class=c>{t}<div class=k>{p["id"]}</div></div>')
open(os.path.join(out, 'gill-quotes-jhn3-16.html'), 'w').write('\n'.join(H)); print('wrote', len(ps), 'pieces')
