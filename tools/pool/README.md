# Pool builder tools (build-time only)

Scripts that cut library sources into study "pool pieces", check them, and validate study plans. Nothing here runs in the live worker, and nothing writes to `library/`.

## Fathers source checks
`pool/fathers-source-checks.json` records each Fathers excerpt in the pinned HCF copy (commit a88dc031b9a1) against a full text of the same work. Key = sha256 of the HCF entry quote. Statuses (what each means is also in the registry's `statusMeaning`): `exact` (word sequence matches a full text; case, punctuation and digits are ignored, so this is not a character-for-character claim), `typo` (one-word correction recorded and applied before cutting), `gap` (the excerpt skips text; pieces that span the skip are excluded, rule V14), `editors-marks`, `recut` (the database prints stretches of the homily out of order; the record lists them in homily order, with the skipped text as a gap, and the build serves them that way; Matthew 25:42-43 only so far), `other` (needs a person), `unchecked`.

Current counts: 43 exact, 14 editors-marks, 6 gap, 3 typo, 1 recut, 1 other, 7 unchecked (75 entries). `editors-marks` means the word sequence matches once editorial reference marks are set aside; it is not character-for-character identity with the CCEL text. The piece shown is always the stored HCF text.

Sources used: CCEL NPNF1 volumes 1, 3, 7, 8, 10, 11, 13, 14 (public domain); the Documenta Catholica Omnia PDF for Chrysostom on Matthew, Homily 79 (the Prevost translation, Oxford 1843-1851, as reprinted in NPNF1-10, which the CCEL file lacks for this homily); the CCEL PDF and XML of the Catena Aurea on Matthew and Mark (the CCEL files state no rights and list William Whiston as translator; the Matthew text was compared with the Oxford 1841-45 edition scan from the Internet Archive and found to be that translation, so it is recorded as public domain by age; the Mark entry has not been compared and stays withheld). The source files are not in the repo. The registry stores the sha256 of each.

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

## John 3:16-21 studies
**Study shapes (Tom, Nov 26).** A study is short and sequenced; the "more on this verse" drawer (the full pool) is not a study.
- `short`: 4-6 pieces, at most 3,000 characters of teacher text. No role repeats within a verse (V18).
- `disagreement`: 4-10 pieces.
- Both shapes replace the minimum of two pieces per verse with two rules: every verse is covered by some picked piece's `covers_verses` (V16), and each unit movement has at least two teachers (V17). V15 is the size cap.
- Summaries are at most half their passage's length (floor 150 characters).
- **W11:** AI and Rabbit text may not claim what teachers or a tradition hold in general. Phrases like "agree", "all the teachers" and "the church has always" are rejected; the rest is human review.
- **Current set:**
  - B: short, 3:19-21, 6 pieces.
  - C: disagreement, 3:16-18, 10 pieces.
  - D: short, 3:16-18, 6 pieces.
  - E: short, 3:16-18, 4 pieces.
  - A and the old 15-piece B are retired (kept in `studies_jhn.py`, marked `retired`).
  - EW and EX: narrative trials of E's plan (see below).
- AI share of printed text is 25-29% for B-E, 11% for EW and 16% for EX.

**Narrative studies (trial, Nov 26).** EW and EX tell Study E's plan as one story: Scripture, a short AI bridge, a teacher quote, in order.
- `weave.py`: the weave format (`weave_v1`) and its checks. A weave names pieces and sentence numbers; it never carries teacher or Scripture text. `resolve()` rebuilds the printed text and offsets from the pool every time, and `build_frame_v2` puts that resolved weave into the frame, so an approval covers it.
- Checks: W1-W12 and E1, E4, E5 (listed at the top of `weave.py`). W12 requires every content word of a bridge to come from the pieces it cites or the scope's Scripture, apart from a fixed list of linking words. Like the summary screen, it is mechanical and cannot judge faithful meaning.
- EW quotes each passage whole. EX quotes selected whole sentences (Tom, Nov 26): a visible "…" marks each cut (E2), the whole passage is one tap away (E3), and a sentence that opens with "but", "yet", "so" and the like brings the sentence before it (E5).
- `study_render.py` renders these with renderer `study_narrative_v1`. Studies B-E are unchanged byte for byte.
- `test_weave.py REPORT` (in the GitHub check): EW and EX pass, and 21 weaves built to break one rule each are caught, plus E4 and the E2/E3 renderer checks.

- `studies_jhn.py`: the study plans (piece ids and roles), the modern-language summaries (`SAY`), Study D's headings (`HEAD`) and Rabbit's own text (focus, take, questions, closings). Written by Claude standing in for the sorter and weaver; no model call.
- `build_studies_jhn.py REPORT OUT`: validates each plan (public build), screens every summary and heading (see the next section for what that screen does and does not catch), writes PENDING approval records, runs the 13 tamper tests per study, renders the page, and confirms every teacher passage appears on it unchanged.
- `study_render.py`: renders one study page from its frame_v2 object only (renderer id `study_html_v1`). Each `study-jhn3-<K>.html` is the page an approval covers; `page-jhn3-study-<K>.json` keeps the page content so a record can be checked later; `studies-jhn3-16-21.html` is a review bundle.
- `test_frame_v2.py REPORT`: the frame_v2 tests (see `FRAME_V2_PROPOSAL.md`).
- `render_study.py REPORT PLAN OUT`: the older one-plan renderer from the Nov 22 trial; it expects a plan for all of 3:16-21, so it does not render studies A-D.
- `public_pool.py FULL PUBLIC`: copies a diagnostic report without its tier C/U pieces and fails if any withheld text remains. `pool/studies/jhn3-16-21/` holds that public copy plus the plans, results, records and page. Building from the public copy gives the same fingerprints and the same page as the full report.

Rebuild: `python3 tools/pool/build_studies_jhn.py pool/studies/jhn3-16-21/diagnostic-jhn3-16-21-public.json pool/studies/jhn3-16-21`

## Full Rabbit study (Nov 27)
Tom's ranking of the trials: E, then EW, then EX. The goal is the full study: Scripture as the foundation, the teachers as the bones, and the AI bringing the flesh and life, written whole by a model inside the rails.
- **Structure** (as in the live study, with no separate Rabbit Trail): Opening, then the study body, then Rabbi Road, then What's Over the Hill.
  - The study body is Study E's passages verse by verse: Scripture, an AI heading and summary over each teacher's whole passage, and a bridge to the next verse.
- **`destinations.py`** picks Rabbi Road and Over the Hill by code from the OpenBible cross references (CC BY), never by the model.
  - Rabbi Road is the top-voted cross-reference from the study verses, outside the unit.
  - Over the Hill is the top hop on from Rabbi Road's verse: outside the unit, not Rabbi Road's verse, and not in Rabbi Road's chapter.
  - For John 3:16-18 these are Romans 5:8 (995 votes) and John 15:13 (180 votes). Their public pools are in `pool/studies/jhn3-16-21/destinations/`, built with `run_diagnostic.py` and `public_pool.py`.
- **`full_study.py`** has three modes:
  - `prompt` prints the prompt;
  - `check FILE` runs the rails;
  - `run` makes the model call. It retries with the problems listed, stops at a cost cap, and writes `full/EF.json` only if every check passes, plus `full/run-*.json` either way.
- **Rails:**
  - every AI field names its evidence, from the passages and Scripture allowed for that field;
  - W2, W3, W5-W12 as in `weave.py`; W7 now also catches a name at the start of a sentence;
  - length limits, and summary caps as before;
  - Rabbi Road quotes one or two offered passages whole;
  - **W10 for the full study is 45%**, not 35%. The structure has more AI fields: the stand-in comes to 39%.
- **Page:** the renderer is `study_full_v1`, and the frame carries the full study (`full` key), so an approval covers every word.
  - `test_full_study.py` (in the check): the hand-written stand-in (`fixtures/full_standin.json`) passes, and 21 studies built to break one rule each are caught.
- **The run:** `.github/workflows/full-study-run.yml`, started from the Actions tab.
  - One model call using the repo's `ANTHROPIC_API_KEY`, with up to 3 attempts and a $1 cap.
  - It pushes a branch `full-study-<run>` with the run log and, if the study passed, study EF (PENDING).

**Free profile and critic (Tom, Nov 27).** The first run (EF) passed, but its prose was stiff: the word-counting rails made it wooden, and patching every outlier is never-ending work. `full_study.py` now has two rail profiles (`PROFILES`):
- **`free`** (the new default):
  - The AI writes freely in its own fields: plain images, application, warmth. It may bring in no outside learning.
  - **Kept:**
    - code prints Scripture and teachers;
    - code picks the destinations;
    - every passage is covered, in order;
    - teacher names only where that teacher's passage is cited;
    - references only those given;
    - no invented numbers, quotation marks or markdown;
    - no claims about what teachers hold in general (W11);
    - summary caps.
  - **Dropped:** the capitalized-word check (W7) and the bridge-word check (W12). Lengths are looser and the AI cap is 55%.
  - Destination passages that end on the next section's outline heading are not offered (`DANGLING`). This is a selection rule; teacher text is never changed.
- **`strict`:** the first run's rails. EF keeps them.
- **The critic:** after a study passes, a second call reads it against its sources and returns notes (minor or serious). The notes go into the study file and a review copy, `review-jhn3-<K>.html`, for Tom. They do not reject the study, are not part of the approved page, and are never served.
- **Run options:** the workflow takes `key` (EF2, EF3, …) and `profile`. `studies_jhn.py` loads every `full/EF*.json`.

## Study index (the catalog a serving Worker will read)
`pool/studies/index.json`, written by `study_index.py build`. For each unit it lists every study:
- key, title, shape, scope;
- status (`approved` only with a named approver and timestamp, otherwise `pending`);
- frame version and renderer;
- fingerprints;
- each file's path and sha256.

Each study folder holds `study-set.json` naming its unit and public pool. `study_index.py check` (in the GitHub check) fails if the index is stale, if a listed file changed, or if any study marked approved is not servable now. Only approved studies may ever be served; nothing here approves.

## Known limits (confirmed after an outside review, Nov 26)
- **Fixed by frame_v2 (Nov 26).** `frame_v1` did not hash the summaries, headings or Rabbit's own text. The John studies now use `frame_v2`: the page content goes into the frame, `study_render.py` renders the page from the frame alone, and `test_frame_v2.py` (in the GitHub check) proves that changing any one of the page's fields (410 across the six live studies), or a sentinel word in any kind of field, breaks an approval, and that no word on the page sits outside the frame. `frame_v1` stays for the older diagnostic tools.
- **The summary check is a mechanical screen.** `check_say()` rejects quotation marks, numbers not found in the source passage, and some unexpected capitalized words. It skips the first word of each sentence and allows a fixed list of names (teachers, God, Christ and the like), so it is not a complete check for added names, and it cannot tell whether a summary is faithful in meaning. That stays a human review.
- **`markup_valid` only checks that asterisks pair up.** V9's "invalid markup" means no more than that.
- **Offsets are character offsets into the decoded source text** each adapter reads (a verse-note string for Gill, a quote for the Fathers, a chapter string for Wesley), not byte offsets into the raw files. `verify.py` re-slices each piece from that text.
- **Fathers comparisons cannot be rerun from a clone.** The CCEL files are not kept here; the registry records each file's sha256 and the result. `fathers_registry_verify.py` checks the HCF side only.
- **Wesley verse assignment is a heuristic.** A piece that re-slices exactly can still sit under the wrong verse; the tests cover known cases only.

## Check
`python3 tools/pool/run_validator.py REPORTS_DIR OUT_DIR` runs the validator on diagnostics and 33 synthetic cases (8 of them for the study shapes, V15-V18).

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
