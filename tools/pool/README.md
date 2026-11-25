# Pool builder tools (build-time only)

Scripts that cut library sources into study "pool pieces", check them, and validate study plans. Nothing here runs in the live worker, and nothing writes to `library/`.

## Fathers source checks
`pool/fathers-source-checks.json` records each Fathers excerpt in the pinned HCF copy (commit a88dc031b9a1) against a full text of the same work. Key = sha256 of the HCF entry quote. Statuses (what each means is also in the registry's `statusMeaning`): `exact` (word sequence matches a full text; case, punctuation and digits are ignored, so this is not a character-for-character claim), `typo` (one-word correction recorded and applied before cutting), `gap` (the excerpt skips text; pieces that span the skip are excluded, rule V14), `editors-marks`, `other` (needs a person), `unchecked`.

Current counts: 25 exact, 9 editors-marks, 6 gap, 2 typo, 2 other, 7 unchecked (51 entries).

Sources used: CCEL NPNF1 volumes 3, 7, 8, 10, 11, 13 (public domain); the Documenta Catholica Omnia PDF for Chrysostom on Matthew, Homily 79; the CCEL PDF and XML of the Catena Aurea on Matthew and Mark (rights not stated in the files; the translator is listed there as William Whiston). The source files are not in the repo. The registry stores the sha256 of each.

Rebuild (needs the source files and `HCF_LOCAL` pointing at the pinned HCF copy):
- Chrysostom: `python3 tools/pool/fathers_check_registry.py HCF_DIR pool/fathers-source-checks.json MATTHEW_XML ROMANS_XML EPHESIANS_XML [DCO_TXT]`
- Augustine: `python3 tools/pool/fathers_check_augustine.py HCF_DIR pool/fathers-source-checks.json NPNF103 NPNF107 NPNF108` (then the Mark Catena entry was added by hand from `catena2.xml`)
- Catena on Matthew 25: `python3 tools/pool/fathers_check_catena_matthew.py HCF_DIR pool/fathers-source-checks.json CH25_TEXT CATENA1_PDF`
- One-off checks: `fathers_check_one.py`

The Augustine Letters, Sermon 18, the two Romans entries and Cyril are unchecked and stay withheld (tier U).

## Not included
The John study scripts (`studies_jhn.py`, `build_studies_jhn.py`, `render_study.py`) have local paths and stay out until they are tidied.

## Check
`python3 tools/pool/run_validator.py REPORTS_DIR OUT_DIR` runs the validator on diagnostics and 25 synthetic cases.

## Fail-closed rules (Nov 25, after an outside review)
- **Pinned HCF, no network.** The Fathers read only a local copy of the HCF repo (`HCF_LOCAL`). The copy must be the pinned commit: a git checkout at it, or a file `.pinned-commit` holding it. Otherwise the build stops. There is no fetch from `master`.
- **Rights are never defaulted to B.** A Fathers excerpt is public (tier B) only when the registry holds a record for its exact text hash, the status shows a word match against a full text, and that full text states Public Domain. A missing or stale record, `other`, `unchecked`, or a full text with no stated rights (the Catena Aurea files, the DCO PDF) means tier U and withheld. Each withheld entry in scope is reported as a `fathers-withheld` finding.
- **Registry gate.** `python3 tools/pool/fathers_registry_verify.py HCF_DIR` fails if a record's key is not the sha256 of the HCF quote at its file and entry, if two records share an entry, or if the identity fields (`quote_sha256`, `hcf_commit`) are missing. Builders refuse a key collision.
- **Approval needs a valid plan.** `make_record` runs the validator and makes no record for a rejected plan. `is_servable` re-runs the validator and needs the record's passing validator result, as well as a named approver and matching fingerprints.
- **A failed source gives no fingerprint.** A missing file or malformed index is an extraction failure, not "not applicable". The report then carries `source_problems` and no source fingerprint, and records cannot be made or served from it.
- Tests: `python3 tools/pool/run_failclosed_tests.py REPORTS_DIR` (19 cases).

## Whole-note rule (D1), stated plainly
A note is included only when its whole verse span sits inside the requested verses. Separately, notes are cut into sentence-level pieces (about 150 to 650 characters) so a study can use part of a note. A piece that only makes sense after an earlier piece of the same note carries `requires_predecessor`, and the validator (V12) rejects a plan that picks it without that predecessor. So the reader can receive part of a note, but never a note that reaches outside the requested verses, and never a piece without the earlier piece it depends on.

## Effect on the current units
Ephesians 1:15-23 and Romans 13:11-14 are unchanged. Matthew 25:31-46 drops from 64 to 13 public Fathers pieces, because the Catena Aurea pieces and the Chrysostom Matthew Homily 79 pieces have no stated rights on their full texts.
