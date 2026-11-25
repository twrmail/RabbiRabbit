# Pool builder tools (build-time only)

Scripts that cut library sources into study "pool pieces", check them, and validate study plans. Nothing here runs in the live worker, and nothing writes to `library/`.

## Fathers source checks
`pool/fathers-source-checks.json` records each Fathers excerpt in the pinned HCF copy (commit a88dc031b9a1) against a full text of the same work. Key = sha256 of the HCF entry quote. Statuses: `exact`, `typo` (one-word correction recorded and applied before cutting), `gap` (the excerpt skips text; pieces that span the skip are excluded, rule V14), `editors-marks`, `other` (needs a person), `unchecked`.

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
