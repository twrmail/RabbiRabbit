# Strong's review (Nov 18 2026)

Our Strong's Greek (G1-G5624) and Hebrew (H1-H8674) dictionaries were compared entry by entry with an independent copy,
the Open Scriptures JSON edition (github.com/openscriptures/strongs). That copy is CC BY-SA, so it is **not stored here**;
it was used only as a witness. sha256 of the files compared: greek `7624ee738ae47e80f1a352223e28a26d011c9cd4898822cee52f47a010c04efd`, hebrew `5ce6aeed551c709f49bcfa341cadf2f34bc7599b85d9de9e6ac2ecbf60fc3739`.

## Result
- **Both dictionaries agree with the witness on the words themselves.** No Greek entry shares less than 70% of its words with the witness; all 8,674 Hebrew numbers line up.
- **The witness is an edited edition**, not the 1890 text: it adds the Greek/Hebrew word in brackets after each cited number and records its own corrections. Most differences are those additions, not defects in our copy.
- **101 Greek entries exist only in ours: G2717 and G3203-G3302.** They read "Not Used". Strong's himself skipped those numbers; ours keeps the placeholder, the witness drops them. Correct as is.
- **Cross-reference numbers (the one real defect found).** Where the two copies cite numbers one digit apart, **21 Hebrew entries in our copy had a digit slip** (for example H2932 cited H2980 where H2930 is the word it comes from). Each was corrected only where the witness's number is also the one that makes the cited word part of the entry's own word. They are recorded in `tools/strongs-fixes.json`, applied by `tools/apply-strongs-fixes.py`, and mirrored in `data/dict` (what the live Worker reads).
- **Our copy is right and the witness is wrong in 9 places** (for example G2552 cites G2556 κακός, the witness cites G2256 ἡμιώριον). Not changed.
- **29 one-digit disagreements were left alone** because the two checks did not agree. Someone with the printed Strong's should settle them. Listed below.

## Left unchanged on purpose
- **Beta-code in 5,226 Greek entries and `{braces}` in 6,473 Hebrew entries look like clutter but are read by the live Worker** (`parseStrongsEntry`, `rankStrongsMatch`, `expandStrongsCompounds`: they skip the Beta-code to find the transliteration and use the braces to expand compounds like `{-lent}`). Stripping them would break pronunciation display and gloss search. `tools/check-strongs.py` pins both counts so a change cannot happen silently. Cleaning them properly means changing the Worker first.
- **108 more Greek numbers have no verse links in the concordance** (besides the 101 "Not Used"): for example G39 ἅγιον and G33 ἄγε. The KJV tagging the concordance was built from puts those uses on a related number. The dictionary entries are fine; those numbers just cannot list their verses. Closing that needs a second tagged source.

## One-digit disagreements left for review
| Entry | Our copy cites | Second copy cites |
|---|---|---|
| G3532 | G2992 (λαός) | G2994 (Λαοδικεύς) |
| G5043 | G5088 (τίκτω) | G5098 (τιμωρία) |
| H585 | H584 (אנח) | H585 (אנחה) |
| H640 | H636 (אע) | H646 (אפד) |
| H728 | H711 (ארגּון) | H771 (ארנן) |
| H883 | H7208 (ראוּמה) | H7203 (ראה) |
| H889 | H887 (בּאשׁ) | H877 (בּאר) |
| H1020 | H8451 (תּרה) | H3451 (ישׁימה) |
| H1177 | H2608 (חנניהוּ) | H2603 (חנן) |
| H1413 | H1461 (גּוּב) | H1464 (גּוּד) |
| H1992 | H1931 (היא) | H1981 (הלך) |
| H2326 | H2235 (זרען) | H2325 (חיב) |
| H2421 | H2424 (חיּוּת) | H2421 (חיה) |
| H2441 | H2496 (חלּמישׁ) | H2596 (חנך) |
| H2510 | H2500 (חלף) | H2509 (חלק) |
| H2687 | H2686 (חצץ) | H2687 (חצץ) |
| H3074 | H8038 (שׁמאבר) | H8033 (שׁם) |
| H3628 | H3607 (כּלא) | H3627 (כּלי) |
| H3774 | H3876 (לוט) | H2876 (טבּח) |
| H3828 | H3826 (לבּה) | H3836 (לבן) |
| H3916 | H3915 (לילה) | H3815 (לאל) |
| H4559 | H4457 (מלקח) | H4437 (מלכוּ) |
| H4604 | H4608 (מעלה) | H4603 (מעל) |
| H4633 | H6168 (ערה) | H6186 (ערך) |
| H4972 | H8518 (תּלה) | H8513 (תּלאה) |
| H5963 | H1690 (דּבלה) | H1960 (היּדה) |
| H7262 | H8284 (שׁרה) | H8248 (שׁקה) |
| H7518 | H7538 (רקב) | H7533 (רצץ) |
| H8302 | H5030 (נביא) | H5630 (סרין) |

## Where our copy is right and the witness is wrong
| Entry | Our copy cites | Second copy cites |
|---|---|---|
| G971 | G970 (βία) | G979 (βίος) |
| G2552 | G2556 (κακός) | G2256 (ἡμιώριον) |
| G3156 | G3161 (Ματταθίας) | G3164 (μάχομαι) |
| G3304 | G3303 (μέν) | G3203 (Not) |
| G3305 | G3303 (μέν) | G3203 (Not) |
| G3642 | G5590 (ψυχή) | G6590 (None) |
| H1256 | H3050 (יהּ) | H8050 (שׁמוּאל) |
| H2673 | H2686 (חצץ) | H2086 (זד) |
| H6634 | H6633 (צבא) | H6623 (פּתרן) |
