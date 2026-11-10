# Finding and keeping public-domain material: the playbook

Written after Calvin's Commentaries, the hardest series so far (48 books, 800+ chapters, three digitizations, one of them damaged in ways that only show up word by word). Every step below was done for Calvin; the tool that does it is named so the next series can reuse it.

The standard that this method must meet (levels, what we may claim, when to stop, the reproducibility test and a close-out checklist) is `PUBLIC-DOMAIN-STANDARD.md`.

The rule behind all of it: **nothing is trusted because it is on a website.** A text is complete when we can show where it came from, that a second copy agrees, what we changed, and that we can undo every change.

## 1. Find the work, then the edition
- Write down the author, the translator, the print edition and the year *before* looking for digital copies. Calvin: the Calvin Translation Society, 1840s-50s. Public domain is decided by that print edition, not by the website.
- Record what the website claims (its header, its rights line) and what it does not say (CCEL's ThML header gives no print year). Do not fill a gap from memory.
- Register it in `library/provenance.json` with an honest evidence level. "Witnessed" is not "established".

## 2. Get at least two digital copies from different places
- One is the copy we serve (Calvin: the HelloAO/CrossWire module). One is the witness (CCEL ThML, 45 files).
- Check first whether the copies are independent. Calvin's two are **not**: the module came from CCEL. Agreement then proves our copy is faithful to CCEL, not that CCEL is faithful to the print. Write that limit down (`independence` in the register).
- The best witness is a scan or page-image of the print edition. Until we have one, say so in `openQuestions`.

## 3. Compare by machine, whole text, every chapter
- Normalise (case, punctuation, soft hyphens), split into tokens, compare with 5-gram coverage against the witness. Gaps in coverage are missing, moved, duplicated or truncated text. (`tools/calvin-ccel-audit/`, `build-calvin-*.py`)
- Then compare word by word. Chapter-level checks passed while 146 word-level faults were still there (typos, words run together or split, Hebrew and Greek turned to plain letters, one chapter cut off mid-sentence).
- To decide which of two readings is damaged use frequency: how common is each word in the whole corpus, and how well do the surrounding word pairs support it. Never "the witness wins" by default.

## 4. Repair only by recorded rules
- Every change is a rule in `library/fixes.json`, applied by `tools/apply-library-fixes.mjs`, with a patch file holding the place, the old text, the new text, and the sha256 before and after. The tool refuses to write unless the counts equal `expectedCount`.
- `data/` (originals) is never touched; `library/` is the repaired layer.
- Be conservative. Where a difference could be the author's own wording, a citation, a number or a transliteration, leave it and list it in a review TSV. A missed fix is cheap; a wrong fix is not.
- Order matters. Fix words before moving text, then split notes, then index. Rebuild everything in that order whenever an earlier step changes.

## 5. Separate voices, keep everything
- Editors' notes are not the author. Cut them out of the text and keep them word for word in `library/commentary-notes/` with their place, so the original chapter can be rebuilt exactly (`split-notes`).
- Material we cannot place (back matter, indexes, translated chapter openings) is **held**, not deleted.

## 6. Keep the witness
- The witness is part of the proof. Keep it where we can get it again: a branch, a release, or a manifest of URLs and sha256 on main. Calvin: `source-originals/ccel-calvin/MANIFEST.json` (45 files, 74 MB) with the copy of record as a GitHub release asset (`ccel-calvin-2026-11-10`, 21 MB zipped) and a second copy on branch `ccel-sources-nov2`.
- If a file is too big for main, the manifest is mandatory. A repair that cannot be re-run is a claim, not a proof.

## 7. Gate it
- Scorecard (`tools/source-scorecard.mjs`) re-implements every repair independently from the originals, checks the notes rebuild exactly, and checks the verse index covers every chapter.
- Baseline check (`tools/check-scorecard-baseline.mjs`): no gate may get worse. Damage suite (`tools/tests/damage-suite.mjs`): deliberately break the library in known ways and make sure the checks catch it. Guardian (`tools/guardian.mjs`) and CI run the same.

- **The equality check** (`tools/check-calvin-ccel.py`): every paragraph of the witness is looked up in ours and every paragraph of ours in the witness; what is not exact or near is listed and each must carry a reason. Run it *before* declaring a series done. For Calvin it found 291 more stand-in words that the chapter-level and word-level audits had missed, so build it earlier next time.

## 8. Close out in writing
- A report that says what was found, what was fixed (counts and samples), what was left alone and why, and what is still open. Put the open items in `tools/OPEN-THREADS.md`.

## Where this still falls short
- A print-edition witness (scans) for Calvin. Two digital copies from one lineage are one witness, not two.
- Rights of modern typesetting (Baker 1996) on the CCEL text are unreviewed.
- A series is only "complete" for the gates we can measure; word-level damage that both copies share would pass every check here.
