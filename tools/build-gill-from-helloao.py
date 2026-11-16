#!/usr/bin/env python3
"""Build the John Gill commentary files in data/commentary/Gill/ from the
Free Use Bible API (bible.helloao.org), which serves Gill's Exposition of the
Old and New Testament (Public Domain Mark 1.0) verse by verse.

Gill wrote verse by verse, so there is NO separate verse index (unlike Henry or
Calvin): each file is already keyed by verse, in the standard shape of
library/commentary/STANDARD.md.

    python3 -I tools/build-gill-from-helloao.py            # writes data/commentary/Gill/*.json
    python3 -I tools/build-gill-from-helloao.py --check    # build in memory, report coverage, write nothing

Notes on the source (recorded so the result is reproducible and honest):
  * Coverage is ~95.5% of KJV verses. Gill batches genealogy and list runs
    (notably 1-2 Chronicles, Ezra, Nehemiah) under the run's first verse, so
    the other verse numbers in a run carry no separate note.
  * 1 Chronicles 11 is absent in the helloao Gill data (numberOfVerses 0); its
    chapter is omitted here rather than written empty.
  * A few Chronicles chapters carry only a "See Chapter Introduction" pointer in
    the source; they are kept as the source has them.
  * Two mojibake sequences in the source are repaired on the way in (see REPL).
  * Book code NAM (helloao) is written as NAH (this repo's code for Nahum).
"""
import json, os, sys, time, urllib.request

BASE = 'https://bible.helloao.org/api/c/john-gill'
OUT = 'data/commentary/Gill'
NAME = "John Gill's Exposition of the Bible"
SOURCE = ('bible.helloao.org (Free Use Bible API), Public Domain Mark 1.0; '
          'John Gill, An Exposition of the Old and New Testament (1746-1763)')
REMAP = {'NAM': 'NAH'}
# Mojibake (double-encoded UTF-8) seen in the source, repaired on ingest.
REPL = {'â€œ': '“', 'â€\x9d': '”',
        'â€™': '’', 'â€”': '—',
        'â€“': '–', 'Ã©': 'é',
        'Ã¶': 'ö', 'Ã¨': 'è',
        'Ã¼': 'ü', 'Ã¤': 'ä', 'Ã±': 'ñ'}
CHECK = '--check' in sys.argv


def demojibake(t):
    for a, b in REPL.items():
        t = t.replace(a, b)
    return t


def fetch(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'rabbirabbit-build'})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def main():
    books = fetch(f'{BASE}/books.json')['books']
    if not CHECK:
        os.makedirs(OUT, exist_ok=True)
    total_notes = omitted = 0
    for b in books:
        bid = b['id']
        code = REMAP.get(bid, bid)
        chapters = []
        for ch in range(1, b['numberOfChapters'] + 1):
            d = fetch(f'{BASE}/{bid}/{ch}.json')
            verses = {}
            for item in d['chapter'].get('content', []):
                if item.get('type') != 'verse':
                    continue
                txt = demojibake(''.join(x for x in item.get('content', []) if isinstance(x, str))).strip()
                if txt:
                    verses[str(item['number'])] = txt
            if not verses:            # chapter absent in the source (e.g. 1 Chronicles 11)
                omitted += 1
                continue
            chapters.append({'chapter': ch, 'verses': verses})
            total_notes += len(verses)
            time.sleep(0.03)
        obj = {'book': code, 'name': NAME, 'source': SOURCE, 'chapters': chapters}
        if not CHECK:
            with open(f'{OUT}/{code}.json', 'w', encoding='utf-8') as f:
                json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{code}: {len(chapters)} chapters, {sum(len(c["verses"]) for c in chapters)} notes')
    print(f'done: {total_notes} verse-notes; {omitted} empty chapter(s) omitted')


if __name__ == '__main__':
    main()
