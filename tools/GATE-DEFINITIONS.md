# What Gate 2 and Gate 6 mean

Written 2026-11-05 at Tom's direction ("D is the choice"). This file records the meaning only.
It changes no status. `tools/source-scorecard.mjs` is not changed by this file, so every status
in `scorecard.md` stays as it is until a later, separate change.

These gates are RabbiRabbit's own quality labels. They are not legal tests, and they block nothing:
the Worker does not read the scorecard.

## Gate 2: Provenance ("can we say where this file came from, and which edition it is?")

PASS needs all four:

1. **Work and edition named in the file.** The `source` line (or `name` and `year` for a Bible) names the
   work, its author or translator, and its edition or year. "Not recorded" is not allowed.
2. **Digital origin named in the file.** The same line names where our copy was obtained (a repository, a site, a CCEL file).
3. **A measured match.** `library/provenance.json` holds a measured comparison to that named origin
   (6-word-run containment, spelling and punctuation ignored) or a git-history record that shows the file came from it.
   A match shows the text agrees with that origin. It does not show the origin is a faithful print of the work.
4. **A version marker when one exists.** A commit id, release date or file hash of the origin, recorded in the register.

UNKNOWN when the edition cannot be identified (today: the WEB release, Henry's printed edition) or any of 1-4 is missing.
FAIL only when the file itself says the origin or edition was never recorded.

A witness, a chat record or a licence statement never turns UNKNOWN or FAIL into PASS by itself.

## Gate 6: Licence ("is our right to serve this recorded, and are its conditions met?")

PASS needs the matching case:

- **Public domain by age:** the work and its date are identified (so the age is known), AND any licence the digital edition
  carries is recorded (for example "text public domain; conversion CC0").
- **Licensed (CC BY, CC BY-SA and similar):** the licence, its source and its conditions are recorded, AND each condition is met
  (attribution shown by the Worker, share-alike decision written down).

UNKNOWN when the work or date is unidentified, or a digital-edition licence is claimed but not recorded.
FAIL when a condition is known to be unmet (for example required attribution missing from the Worker).
N/A for retired sources that are never served.

## What this does not ask for

- A "verified licence page" for works that are public domain by age. For them the date of the work is the evidence.
- Proof that a digital edition is the one the author printed. That is Gate 2, and "edition unidentified" is an honest UNKNOWN.

## Next steps (separate changes, one at a time)

1. Record origin in the `source` lines that still say "not recorded" (MHC, JFB, Calvin), through `library/fixes.json`.
2. Change the scorecard code to apply the definitions above, with the baseline updated by hand and reviewed.
