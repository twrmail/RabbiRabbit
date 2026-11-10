# The standard: how a public-domain work becomes a good copy in RabbiRabbit

The method is in `PUBLIC-DOMAIN-PLAYBOOK.md` (how Calvin was done). This is the standard it must meet: what "good copy" means, the levels, what we may claim at each, when to stop, and the record that lets anyone repeat it. A source may only be described in the app, README or NOTICE at the level its record proves.

## The one rule
Nothing is trusted because it is on a website. A copy is good when we can show **where it came from, that something independent agrees, what we changed, and that every change can be undone or re-run**. Perfect is not the goal; a stated, checkable level is.

## Three claims, never mixed
1. **Textual fidelity:** our text equals a named digital witness, except for listed differences.
2. **Historical fidelity:** the witness represents a named print edition. A digital file is not the printed book, and its own metadata may be incomplete.
3. **Rights:** the underlying work and edition are public domain; separate rights in a transcription, typesetting, introductions or website material are checked, not assumed.

## Levels (each needs the one before; the register records the level)
| Level | Name | What must exist | Where it is recorded | We may say |
|---|---|---|---|---|
| 0 | Identified | author, translator or editor, print edition and year written down *before* digital copies are looked for | `library/provenance.json` `work` | "We hold a copy of X" |
| 1 | Acquired | where our digital copy came from, with a version marker (commit, release, file hash) | `acquisition`, manifest | "Digital text from Y" |
| 2 | Witnessed | a second digital copy kept as a witness with sha256 per file; whether it is independent of ours is written down | `witnesses`, `source-originals/<x>/MANIFEST.json`, a release asset if large | "Checked against Z" (not "verified", if the lineage is shared) |
| 3 | Complete | machine comparison of every paragraph both ways; each difference is exact, near, or on an accepted list with a reason | a check tool such as `tools/check-calvin-ccel.py`, result file bound by sha256 to the text | "Complete against Z, with listed exceptions" |
| 4 | Repaired by rule | every change is a recorded rule with before/after hashes and an expected count; originals untouched; scorecard re-derives it independently | `library/fixes.json`, patches, scorecard, damage suite | "Repaired from Z by recorded rules" |
| 5 | Print-checked | page images of the printed edition read against our text, pages and results listed, including pages away from known problem places; differences listed | a `PRINT-CHECK-<date>.md`, a `page-read` witness | "N pages compared with the print: no wrong words found" |

Level 5 is a supplementary witness. It never replaces level 3 and is not a release gate.

## Doing it (order matters; each step leaves a file)
1. Write the work and edition down. Register it (level 0).
2. Acquire the copy; record origin and version; keep the original untouched in `data/` (level 1).
3. Get a witness from a different place; test independence honestly; keep it with a manifest of sha256 (level 2).
4. Compare chapter-level, then paragraph-level both ways, then word-level; decide a damaged reading by evidence (frequency, context), never "witness wins" (level 3).
5. Repair only conservatively, only by recorded rules, in the fixed order: words, then moved text, then notes split, then index. Anything that could be the author's own wording, a citation, a number or a transliteration is listed, not changed (level 4).
6. Separate voices: editors' notes, translators' prefaces and indexes are kept word for word in their own layer or held, never deleted and never mixed into the author.
7. Gate it: scorecard, baseline (no gate worse), damage suite (the checks must catch deliberate damage), guardian, CI.
8. Spot-check against print scans where they exist; record pages and results; keep lookup pointers (item ids, page-scan viewers) (level 5).
9. Close out in writing: found, fixed, left alone and why, open. Update `tools/OPEN-THREADS.md`.

## When to stop (so effort is spent on being useful)
- Stop editing when the remaining differences are punctuation or style that the witness already has, no word is wrong, and fixing would add more rebuild work and risk than reader value. List them; do not silently normalise. (Calvin: about 1,580 lost full stops after italic headings were listed, not repaired.)
- Edit when a fault changes the author's words or makes text unreadable: a missing word, a truncated chapter, a wrong number, Hebrew or Greek turned to plain letters.
- Every edit moves positions that notes and indexes depend on, so each one is a rebuild. Batch them.

## Credit and notice
Credit the digitiser and the print translators in `NOTICE` (generated from the register by `tools/build-notice.py`) and the README. Credit is good practice even where the public-domain statement does not require it. Never claim more than the level proves.

## Reproducibility test (run before calling a source "done")
From a fresh clone, plus the witness files fetched by their manifest: (a) `node tools/apply-library-fixes.mjs . --check` finds every rule applied; (b) the source's check tool reproduces the recorded result; (c) scorecard and damage suite pass; (d) the register states the level, the witness and its independence, the stance on the print, and the open questions. If any of these cannot be run by someone else, the source is at a lower level than recorded.

## Per-source close-out checklist (copy into the report)
- Work, translator, print edition, year: ____  Rights statement read from: ____
- Our copy came from: ____ (version marker ____)  Witness: ____ (independent? yes/no, why)
- Complete against witness: ____ exact / ____ near / ____ accepted (each with reason)
- Rules applied: ____ (expected counts met)  Notes layer / held material: ____
- Print pages read: ____ (items, pages, result)  Known differences listed in: ____
- Level reached: ____  Credit line added: ____  Open questions: ____
