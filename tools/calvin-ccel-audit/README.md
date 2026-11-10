# Calvin vs CCEL audit (read-only)

Compares our Calvin commentary (`library/commentary/Calvin/*.json`) with CCEL's ThML source, the 45 volumes `calcom01` to `calcom45`. It reports; it never changes the library. Any repair goes through `library/fixes.json` as a recorded rule.

## Get the CCEL volumes
The 45 ThML files are the asset `ccel-calvin-calcom01-45.zip` of the GitHub release `ccel-calvin-2026-11-10` (also on branch `ccel-sources-nov2`). Their sha256 are in `source-originals/ccel-calvin/MANIFEST.json`.

    mkdir -p /tmp/ccel && cd /tmp/ccel
    # download the zip from https://github.com/twrmail/RabbiRabbit/releases/tag/ccel-calvin-2026-11-10, then:
    unzip ccel-calvin-calcom01-45.zip

## The completeness check: "Calvin equals CCEL"
    CCEL_DIR=/tmp/ccel python3 -I tools/check-calvin-ccel.py --write

Looks up every CCEL commentary paragraph (35,081) in our text, notes layer and held material, and every paragraph of ours in CCEL. Exact, near (small wording differences left unchanged), partial, missing, extra. Anything not exact or near must be on `gate-accepted.json` with a reason; the result is recorded in `library/calvin-ccel-gate.json`, bound by sha256 to the Calvin files, and the scorecard fails if the record is stale. Takes about four minutes.

The older `validate-calvin-ccel.py` below is the first audit and is kept for its detailed reports.

## Run

    CCEL_DIR=/tmp/ccel OUT_DIR=/tmp/out python3 -I tools/calvin-ccel-audit/validate-calvin-ccel.py

It takes about four minutes. Output: a printed summary in seven parts, plus `validate.json`, `adjudicate.json` and `validate-buckets.json` in `OUT_DIR`.

## What it does
1. Extraction check per volume: scripCom markers, Commentary blocks, unpaired markers, orphan divs, nested and unterminated blocks, unmapped references.
2. Each block is assigned its book and chapter from its own OSIS reference. A paragraph is tested against that book only; a hit in another book is reported separately and never counts as present.
3. Paragraphs of 60+ normalised characters inside Commentary blocks are tested with three 40-character windows (start, middle, end). Footnotes ("- Ed" notes), Scripture-text blocks and front matter are not tested.
4. Every flagged paragraph is re-scored by the share of its five-word sequences found in the same book (85% or more = present, 50-84% = suspect, under 50% = missing).
5. Chapter boundaries: the first and last qualifying paragraph of each chapter is checked against the same library chapter.

## Known limits
- It checks presence and coverage, not exact equality. A paragraph can be fully covered and still sit in the wrong place.
- Hebrew and Greek: library Isaiah and Acts store them as ASCII transliteration, so about 680 paragraphs fail the windows and pass the five-word score. See the report.
- Editor notes are excluded by design.

Findings of Nov 9, 2026: `tools/calvin-ccel-audit/REPORT-2026-11-09.md`.
