# Calvin: decision and reasoning, for review (2026-11-10)

Written for a second reviewer (ChatGPT). Please challenge anything that looks wrong. Pointers to the evidence are at the end.

## Decision

1. **Our Calvin is CCEL's text.** `library/commentary/Calvin` stays exactly as it is after PR #78 and #79 (repairs from CCEL by recorded rules, completeness check against CCEL passing). No further text edits.
2. **CCEL is credited plainly** (NOTICE.md, README, provenance register): the Christian Classics Ethereal Library's digitization of the Calvin Translation Society edition (1840s-50s).
3. **The CCEL files are kept as the copy of record**: release asset `ccel-calvin-2026-11-10`, zip sha256 `d19c82e1c5e16ddf0a1b0e3561bfae0cb01e7ada3a8bb2faab8785185cfd1731`, per-file sha256 in `source-originals/ccel-calvin/MANIFEST.json`. The gate refuses to pass if the files do not match the manifest.
4. **Anyone who cares about one word is pointed to the print**: CCEL page-scan viewer and archive.org item identifiers are listed in `PRINT-CHECK-2026-11-10.md`.
5. **We do not chase print-level perfection.** The known differences are listed, not fixed.

## What we measured

- Against CCEL: of 35,081 CCEL commentary paragraphs, 34,495 exact and 437 near in our text, notes layer or held material; 154 accepted exceptions with reasons; 10,604 of our 10,609 paragraphs found in CCEL. 146 damaged words repaired, 291 Hebrew/Greek words restored.
- Against print: about 14 printed pages (archive.org scans, page images read by Claude) in Isaiah 16 and 19, 1 Corinthians 16 including the end of the chapter, and Jeremiah 10. **No wrong English words.**
- Differences found, all already present in CCEL's file: full stops lost after italic verse headings and footnote markers (about 1,580 of about 9,700 headings CCEL-wide); one dropped word (Jer 10:2 "for"); two Latin typos in the 1 Cor 16 verse table; one comma for a full stop; one Greek accent (Isa 16:10); British vs American spelling; ae ligatures; modernized citations.

## Why we stopped

- **Words are right; the gaps are punctuation and style.** For a new believer studying Calvin, none of the differences changes meaning.
- **Fixing costs more than it gains.** An inserted character shifts every later position in a chapter. The notes layer and the verse index store positions, so each edit means rebuilding both, then the scorecard, damage tests (39, about 6 minutes) and the completeness record. About 1,600 places fixed in millions of words.
- **Editing weakens the claim.** "Our Calvin is CCEL's text" is simple and checkable. Each edit makes us a derivative that has to be documented against CCEL.
- **Perfect is not reachable without retyping 45 volumes.** CCEL is not independent of our source (our copy came from a CrossWire module sourced from CCEL), so only a scan can settle edition questions; a full collation was judged out of proportion to the benefit.
- **Usefulness first.** The project's purpose is parsing and studying what we have, giving new believers earlier generations' wisdom. Time goes to the Worker reading Calvin and to the other commentaries.

## Known gaps left open (and said so)

- Editors' footnotes (the Calvin Translation Society editors, not Calvin) are a separate layer for Isaiah and Acts only; 1 Corinthians holds one note, other books none, although CCEL's files carry them. The gate does not test footnotes.
- Chapter-opening translations (English and Latin verse table) are present for many books and absent for others; the open issue text in `library/fixes.json` still says absent and is stale for books like Jeremiah. Not counted exactly yet.
- 6 CCEL sections not placed in the verse index; 4 Isaiah script places left.
- Print check is a spot-check, not a collation.

## Questions for the reviewer

1. Is "CCEL's text, credited, with documented differences" an adequate standard for a public-domain study library, or should the full-stop loss (about 1,580 places) be repaired by a single mechanical rule anyway?
2. Is the 14-page sample enough to say "no wrong words", or should it be extended (which books)?
3. Is crediting as "appreciated, not required" right for CCEL's PD-labelled text?

## Evidence

`tools/calvin-ccel-audit/PRINT-CHECK-2026-11-10.md` (pages, known differences, lookup pointers); `library/provenance.json` (calvin entry, new print witness); `library/calvin-ccel-gate.json`; `tools/calvin-ccel-audit/gate-accepted.json`; `source-originals/ccel-calvin/MANIFEST.json`; `tools/OPEN-THREADS.md`.
