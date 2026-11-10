# Calvin: print spot-check and where to look things up (2026-11-10)

**Stance.** RabbiRabbit's Calvin corpus is a CCEL-witnessed transcription of the Calvin Translation Society commentary: CCEL's digital transcription of that edition (historically published in the 1840s-50s), repaired by recorded rules in `library/fixes.json` and checked against CCEL's 45-volume transcription by `tools/check-calvin-ccel.py`. Remaining differences are documented, and the CCEL files are preserved as the comparison witness. We do not try to be better than CCEL, and we do not silently correct it.

Three claims are kept apart:
1. **Textual fidelity:** we preserve the CCEL digital text, subject to documented exceptions (35,081 CCEL paragraphs: 34,495 exact, 437 near, 144 missing and 5 partial on the CCEL side, all accepted with reasons; 10,604 of our 10,609 paragraphs found in CCEL, 5 extra of ours accepted). Near is not identical; the 154 accepted rows are both CCEL-side and ours.
2. **Historical fidelity:** CCEL represents the Calvin Translation Society edition but is not itself the printed edition. CCEL's file metadata names a print source ("Baker, 1996") on two volumes and leaves it blank on the rest, so we do not claim each volume was traced to one original printed impression.
3. **Public-domain status:** Calvin's work and the 19th-century translations are public domain; CCEL's files carry a Public Domain statement in their header. CCEL's website material, PDF wrappers and special contents may carry separate rights and are not what we use.

The scan pages are a supplementary witness, not the basis of the completeness claim. The result on them is limited: **no incorrect English words were found in the roughly 14 printed pages examined.** That is not a statement about all 45 volumes.

Thank you to CCEL for the gift, and to the Calvin Translation Society translators (1840s-50s) whose work it carries.

## What was compared

Printed pages photographed by Tom from archive.org scans and read against our text, about 14 pages in three books. The scan names are the archive.org file names Tom saved; the same item identifier opens the book at https://archive.org/details/ITEM.

| Item (archive.org identifier) | Book and place | Printed pages | Result |
|---|---|---|---|
| `commentaryonboo01calv` | Isaiah vol. 1, end of Isaiah 16 | 494-496 | words match; one wrong Greek accent shared with CCEL (Isa 16:10, kĕleusma) |
| `calvinscommentar0014calv` | Isaiah vol. 2, Isaiah 19:11-13 | 59-62 | words match; 3 punctuation/layout slips |
| `commentaryonepis02calv` | 1 Corinthians vol. 2, 16:10-19 and the end of the chapter | 74-77, 82-83 | words match; chapter end confirmed; 2 Latin typos; footnote notes mostly not in our library |
| `commentariesonbo02calvuoft` | Jeremiah vol. 2, Jeremiah 10:1-2 | chapter opening, 6-7 | words match except one dropped word; chapter-opening translation (English and Latin) is present and in the printed order |

No incorrect English words were found in these pages. About 14 pages is a spot-check, not a full collation, and the pages were chosen near places already known to have had problems. If more confidence is wanted: one randomly chosen passage from a volume not listed above would test outside the known problem areas.

## Known differences (left as CCEL has them)

1. **Full stops lost after italic verse headings and after footnote markers.** The print reads "Let all your things be done in love. Again he repeats"; CCEL and ours read "...in love Again he repeats". CCEL's file lacks the stop. About 1,580 of roughly 9,700 verse headings in CCEL's 45 files lack it (count of headings followed by a capital letter). Seen in Isaiah 19, 1 Corinthians 16 and Jeremiah 10.
2. **One dropped word.** Jeremiah 10:2: print "take אל, al, for את, at."; CCEL and ours "take אל, al את at." (also in CCEL).
3. **Two Latin typos** in the 1 Corinthians 16 verse table (CCEL has them too): "tallbus" for "talibus" (v. 16) and "Stephanie" for "Stephanae" (v. 17; the print has the ae ligature).
4. **A comma where the print has a full stop:** Jeremiah 10:2, "human life is regulated, He then forbids".
5. **Isaiah 19:12, Greek line:** the print runs the Greek inline after "Isocrates says,"; CCEL and ours start a new paragraph and add a stray opening quote mark.
6. **Style.** The print uses British spellings (honour, labour, skilfully, offence); CCEL's file mixes British and American, so ours does. The print uses ae ligatures; ours has "ae". Bible citations are modernized ("1 Corinthians 3:6" for "1 Cor. iii. 6"). Transliteration marks in a few notes are lost. Verse numbers are not in the running text.
7. **Editors' footnotes.** The Calvin Translation Society editors' notes (signed "Ed.") are kept as a separate layer for Isaiah and Acts only. For 1 Corinthians the layer holds one note; other books have none, though CCEL's files carry them. These are the editors' words, not Calvin's.
8. **Chapter-opening translations.** The English-and-Latin verse table at the head of a chapter is present in our copy for many books (Jeremiah, Romans, 1 Corinthians and others) and absent in others (Isaiah, where the book itself defers the translation to a later volume, and Genesis and several more). Where present, the label "Jeremiah 10:1-2" and the "1 ." numbering are CCEL's.

## Where to look a word up

- **Printed page images, same text as CCEL:** `https://ccel.org/ccel/calvin/calcomNN/Page_Index.html` (NN = 01 to 45) opens CCEL's page-by-page scan view for each volume. `calcom14` is the Isaiah volume holding Isaiah 12-32 (our 19:12 check), `calcom40` the 1 Corinthians volume.
- **archive.org items Tom used** are the four in the table above: https://archive.org/details/ITEM. Use "Search inside" with a distinctive word from the passage (for instance "Isocrates" or "adorn thyself"); the OCR text on archive.org is noisy, so read the page image rather than trusting the OCR.
- **Meeter Center (Calvin University) PDFs of CTS volumes:** index at "John Calvin's Works in English", Meeter Center. Genesis vol. 2 (`Commentary-20002`), Isaiah vol. 2 (`Commentary-20014`) and others are page-scan PDFs. Found by search, not opened by us.
- **Others found by search, not opened by us:** Psalms vol. 1 `commentaryonbook01calvuoft`; Hebrews `commentariesowentran00calv`; Isaiah vol. 3 `commentaryonbook03calv`; Four Last Books of Moses `fourbooksofmoses01calvuoft` and `commentariesonfo01calv`. Check each opens at the right volume before relying on it.

## The copy of record for CCEL

The 45 CCEL ThML files (calcom01-45) are kept as release asset `ccel-calvin-2026-11-10` (zip sha256 `d19c82e1c5e16ddf0a1b0e3561bfae0cb01e7ada3a8bb2faab8785185cfd1731`); each file's sha256 is in `source-originals/ccel-calvin/MANIFEST.json`, and the completeness check refuses to pass if the files do not match the manifest.
