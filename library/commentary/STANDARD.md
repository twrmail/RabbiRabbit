# Commentary standard (version 1)

One shape for every commentary in this library, so that anyone can read any of them with the same few lines of code, without knowing how we repaired or built it.

## The shape

One file per book: `library/commentary/<Source>/<BOOK>.json`, where `<BOOK>` is the three-character code used by the Bible files (`GEN`, `PSA`, `1CO`, `JHN`, ...).

```json
{
  "book": "JHN",
  "sourceId": "tyndale",
  "name": "Tyndale Open Study Notes",
  "source": "where the text came from, which edition, which licence",
  "chapters": [
    {
      "chapter": 3,
      "overview": "optional: the author's introduction to the whole chapter",
      "verses": {
        "1": "the author's note on verse 1",
        "13": "a note that covers verses 13 to 15",
        "16": "the author's note on verse 16"
      },
      "spans": { "13": [13, 15] }
    }
  ]
}
```

## Rules

1. **`verses` is keyed by verse number**, as a string, in the numbering of the KJV files in this library. A key means "the author wrote this on that verse". A verse with no key means "the author says nothing here", never "we lost it". Coverage is declared per source (see below), so a missing verse is a known fact, not a hole.
2. **A note that covers several verses** is stored once, under its first verse, and `spans` says how far it reaches (`"13": [13, 15]`). To find the note for verse *v*: use `verses[v]` if present; otherwise the span that contains *v*; otherwise there is none. `spans` is optional, and a key without a span covers that verse only.
3. **Key `"0"`** holds a Psalm title or superscription, nothing else.
4. **`overview`** is the author's own introduction to the chapter (an "argument" or "contents"), when there is one. It is not a summary written by us.
5. **Text is the author's, unchanged.** Repairs are recorded rules in `library/fixes.json`, counted and re-checked by the scorecard. No summarising, no modernising. Where a source prints the verse itself before its comment, Spurgeon does as a block quote beginning with ">", it stays as the source has it; new conversions leave the printed Scripture out, because the Bible files already hold it. If the author's own words quote it, that stays.
6. **Plain UTF-8 text.** No HTML tags, no HTML entities. Emphasis may use Markdown asterisks where the source had italics.
7. **No empty values.** A key whose text is empty is removed.
8. **Where it came from** is in the file's `source` line and in `library/provenance.json`. The licence is in `library/NOTICE.md`.

## Declared coverage

The manifest records for every commentary how much of the Bible it speaks to:
- `scope: full` means the author wrote on all 66 books;
- `scope: partial-by-design` means the author did not (Calvin wrote on 48 books, Barnes' Notes on the New Testament in this library, Spurgeon on the Psalms), or wrote selectively (Tyndale, Scofield);
- the scorecard counts, per source, how many verses have a note.

## How to read it (any language)

```js
// JavaScript
const file = await (await fetch(`.../library/commentary/Tyndale/JHN.json`)).json()
const ch = file.chapters.find(c => c.chapter === 3)
const note = ch.verses['16'] ?? Object.entries(ch.spans ?? {})
  .filter(([, [a, b]]) => 16 >= a && 16 <= b).map(([k]) => ch.verses[k])[0] ?? null
```

```python
# Python
ch = next(c for c in file["chapters"] if c["chapter"] == 3)
note = ch["verses"].get("16") or next(
    (ch["verses"][k] for k, (a, b) in ch.get("spans", {}).items() if a <= 16 <= b), None)
```

## Where each source stands

| source | shape today | status |
|---|---|---|
| Tyndale Open Study Notes | verse-keyed | conforms |
| Barnes' Notes (NT) | verse-keyed | conforms |
| Spurgeon, Treasury of David | verse-keyed (with `overview`) | conforms |
| Calvin's Commentaries | chapter text + verse index (`library/commentary-index/Calvin`) | verse lookup works through the index; text not copied (see below) |
| Matthew Henry | chapter text, sectioned by the Worker | to convert |
| Jamieson, Fausset & Brown | chapter text | to convert |
| Wesley's Explanatory Notes | chapter text with verse numbers inside | to convert |
| Scofield Reference Notes | chapter text, notes tied to words | to convert last; may stay word-anchored |

A source in "chapter text" shape is still valid and served. Moving it to this standard is done one source at a time: a builder script in `tools/` produces the `verses` and `spans` from the repaired text, a recorded rule applies it, and the scorecard re-derives it independently. The standard is complete for a source when every verse it has a note on can be found with the reader above.

## Calvin: chapter text with a verse index

Calvin's repairs, holds, moves and checks all work on the repaired chapter text, so that text stays the master and is not copied into a second shape. The standard's promise (find the note on a verse) is kept by an index instead: `library/commentary-index/Calvin/<BOOK>.json` records, for each chapter, where every section of Calvin's commentary starts and ends in the chapter text (character offsets), the verse it opens on (from CCEL's own section markers) and, where there is one, the verses it covers (`span`: from Calvin's own heading such as "Acts 1:3-5", otherwise every verse up to the next commented verse). A chapter's `overview` is whatever comes before the first section. Overview and sections together cover the whole chapter. Each chapter entry carries the sha256 of the exact text it was built for, and the scorecard fails if the text changes without the index being rebuilt (`CCEL_DIR=/tmp/ccel python3 -I tools/build-calvin-index.py library`).

To read a verse: take the sections whose `verse` is the verse; if there are none, the section whose `span` contains it (the nearest one that opens below it); if there is none, Calvin has no section there. `node tools/read-calvin-verse.mjs GEN 1 6` does this. A few chapters in the harmony books list verses out of order, and several sections may open on the same verse; read them all.
