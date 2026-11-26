# Pool builder tools (build-time only)

Scripts that cut library sources into study "pool pieces", check them, and validate study plans. Nothing here runs in the live worker, and nothing writes to `library/`.

## Fathers source checks
`pool/fathers-source-checks.json` records each Fathers excerpt in the pinned HCF copy (commit a88dc031b9a1) against a full text of the same work. Key = sha256 of the HCF entry quote. Statuses (what each means is also in the registry's `statusMeaning`): `exact` (word sequence matches a full text; case, punctuation and digits are ignored, so this is not a character-for-character claim), `typo` (one-word correction recorded and applied before cutting), `gap` (the excerpt skips text; pieces that span the skip are excluded, rule V14), `editors-marks`, `recut` (the database prints stretches of the homily out of order; the record lists them in homily order, with the skipped text as a gap, and the build serves them that way; Matthew 25:42-43 only so far), `other` (needs a person), `unchecked`.

Current counts: 25 exact, 9 editors-marks, 6 gap, 3 typo, 1 recut, 1 other, 7 unchecked (51 entries).

Sources used: CCEL NPNF1 volumes 3, 7, 8, 10, 11, 13 (public domain); the Documenta Catholica Omnia PDF for Chrysostom on Matthew, Homily 79 (the Prevost translation, Oxford 1843-1851, as reprinted in NPNF1-10, which the CCEL file lacks for this homily); the CCEL PDF and XML of the Catena Aurea on Matthew and Mark (the CCEL files state no rights and list William Whiston as translator; the Matthew text was compared with the Oxford 1841-45 edition scan from the Internet Archive and found to be that translation, so it is recorded as public domain by age; the Mark entry has not been compared and stays withheld). The source files are not in the repo. The registry stores the sha256 of each.

Rebuild (needs the source files and `HCF_LOCAL` pointing at the pinned HCF copy):
- Chrysostom: `python3 tools/pool/fathers_check_registry.py HCF_DIR pool/fathers-source-checks.json MATTHEW_XML ROMANS_XML EPHESIANS_XML [DCO_TXT]`
- Augustine: `python3 tools/pool/fathers_check_augustine.py HCF_DIR pool/fathers-source-checks.json NPNF103 NPNF107 NPNF108` (then the Mark Catena entry was added by hand from `catena2.xml`)
- Catena on Matthew 25: `python3 tools/pool/fathers_check_catena_matthew.py HCF_DIR pool/fathers-source-checks.json CH25_TEXT CATENA1_PDF`
- One-off checks: `fathers_check_one.py`

The Augustine Letters, Sermon 18, the two Romans entries and Cyril are unchecked and stay withheld (tier U).

## Level 2: all 66 books (Nov 26)

`books.py` holds the 66 books once: library code, the English name the Historical Christian Faith database uses in its file names ("Psalms", "Song of Solomon", "1 Corinthians"), Henry's citation abbreviation, and other citation forms. The six books the builder first shipped with (John, Matthew, Mark, Romans, Ephesians, 1 John) keep their earlier entries exactly, and the ten diagnostic passages build byte-for-byte as before (only the informational `contains_cross_refs` list grew, because longer book names such as "1 Corinthians 13:4" are now recognised).

One adapter per commentary, all sharing the same toolkit: `henry_parser.py` (Henry sections), `adapter_calvin.py`, `adapter_jfb.py`, `adapter_gill.py` (verse-keyed with Gill's footnote quotes), `adapter_wesley.py` (one string per chapter with verse markers inside), `adapter_verse.py` (Barnes, New Testament only; Tyndale, withheld by tier). Scofield builds no pieces (no verse anchors in the source); it is out.

Where a source does not reach a chapter (Calvin after Ezekiel 20 and Jeremiah 51, no Calvin file for several books, Wesley 2 Samuel 24, Tyndale Exodus 36, Barnes in the Old Testament, Gill chapters that hold only an introduction) the adapter answers "source absence" with the reason and builds nothing; it does not stop. Henry notes whose first verses sit before his first placed verse stay "undetermined", as before.

Two fixes found by the whole-Bible run: a Henry note that the splitter cut inside a parenthesis or emphasis pair now merges those pieces (as Calvin, JFB and Gill already did), and a Wesley line numbered past the chapter's last verse (Job 39 prints "33." for verse 30) is no longer taken as a verse marker.

Checks (no model calls, no network):
- `run_allbooks.py LIBRARY OUT [--baseline pool/allbooks-baseline.json]`: every adapter over every chapter of all 66 books. Fails on any error, any note that does not tile, any piece that differs from a fresh slice of its source, any span outside its chapter, or any total that differs from the recorded baseline.
- `run_adapter_tests.py LIBRARY`: the book table, the known gaps, the two fixes above.
- `run_fathers_sweep.py LIBRARY OUT`: the same for the Fathers, using a full copy of the HCF database at the pinned commit (`HCF_LOCAL`, about 129 MB for the four authors; not kept in this repo). Result: 21,304 of the 21,527 files in the four authors' folders are reached; the rest are Deuterocanon (Sirach, Wisdom, Tobit, Maccabees and similar) or spans that cross a chapter boundary. 87,944 pieces, 0 tiling problems, 0 mismatches; 143 are public and 87,801 are withheld, because only entries with a recorded Public Domain source check are public.

## Not included
The John study scripts (`studies_jhn.py`, `build_studies_jhn.py`, `render_study.py`) have local paths and stay out until they are tidied.

## Check
`python3 tools/pool/run_validator.py REPORTS_DIR OUT_DIR` runs the validator on diagnostics and 25 synthetic cases.

## Fail-closed rules (Nov 25, after an outside review)
- **Pinned HCF, no network.** The Fathers read only a local copy of the HCF repo (`HCF_LOCAL`). The copy must be the pinned commit: a git checkout at it, or a file `.pinned-commit` holding it. Otherwise the build stops. There is no fetch from `master`.
- **Rights are never defaulted to B.** A Fathers excerpt is public (tier B) only when the registry holds a record for its exact text hash, the status shows a word match against a full text, and that full text states Public Domain. A missing or stale record, `other`, `unchecked`, or a full text with no stated rights (the Catena Aurea on Mark) means tier U and withheld. Each withheld entry in scope is reported as a `fathers-withheld` finding.
- **Registry gate.** `python3 tools/pool/fathers_registry_verify.py HCF_DIR` fails if a record's key is not the sha256 of the HCF quote at its file and entry, if two records share an entry, or if the identity fields (`quote_sha256`, `hcf_commit`) are missing. Builders refuse a key collision.
- **Approval needs a valid plan.** `make_record` runs the validator and makes no record for a rejected plan. `is_servable` re-runs the validator and needs the record's passing validator result, as well as a named approver and matching fingerprints.
- **A failed source gives no fingerprint.** A missing file or malformed index is an extraction failure, not "not applicable". The report then carries `source_problems` and no source fingerprint, and records cannot be made or served from it.
- Tests: `python3 tools/pool/run_failclosed_tests.py REPORTS_DIR` (19 cases).

## Whole-note rule (D1), stated plainly
A note is included only when its whole verse span sits inside the requested verses. Separately, notes are cut into sentence-level pieces (about 150 to 650 characters) so a study can use part of a note. A piece that only makes sense after an earlier piece of the same note carries `requires_predecessor`, and the validator (V12) rejects a plan that picks it without that predecessor. So the reader can receive part of a note, but never a note that reaches outside the requested verses, and never a piece without the earlier piece it depends on.

## Effect on the current units
Ephesians 1:15-23 and Romans 13:11-14 are unchanged. Matthew 25:31-46 drops from 64 to 13 public Fathers pieces, because the Catena Aurea and Chrysostom Homily 79 pieces had no stated rights on their full texts. Both came back once the translations were identified (Prevost for Homily 79; the Oxford 1841-45 Catena), leaving 41 public Fathers pieces. Matthew 25:46 (Catena, status other) and 25:42-43 (Chrysostom, status other) stay withheld until a person reads them.
