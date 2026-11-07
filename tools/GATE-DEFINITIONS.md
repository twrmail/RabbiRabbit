# What Gate 2 and Gate 6 mean

Written 2026-11-05 at Tom's direction ("D is the choice"); Gate 2 revised 2026-11-07 (see below).

These gates are RabbiRabbit's own quality labels. They are not legal tests, and they block nothing:
the Worker does not read the scorecard.

## Gate 2: Provenance ("can we say which digital edition we hold, and where it came from?")

Changed 2026-11-07 at Tom's direction ("option A", after an independent review). Gate 2 identifies the DIGITAL edition RabbiRabbit actually acquired. It no longer asks us to prove which physical printing a digitiser used.

PASS needs all four:

1. **The work, with a date.** The `source` line (or `name` and `year` for a Bible) or the register's `work` record names the work, its author, translator or publisher, and a date of the work or edition. "Not recorded" and the old "origin and edition" placeholder are not allowed. A year that only names a repository branch (for example "2024 branch") does not count as a date.
2. **Digital origin named in the file.** The same line names where our copy was obtained (a repository, a site, a CCEL file).
3. **A measured match.** `library/provenance.json` holds a measured comparison to that named origin
   (6-word-run containment, spelling and punctuation ignored) or a git-history record that shows the file came from it.
   A match shows the text agrees with that origin. It does not show the origin is a faithful print of the work, and it does not create public-domain status.
4. **A version marker when one exists.** A commit id, release date or file hash of the origin, recorded in the register, together with the named origin (a hash of our own file alone identifies our copy, not where it came from).

**Printed edition:** recorded separately. If the file says the printed edition is not identified, that is stated openly in the scorecard as an evidence line, and it neither fails nor blocks Gate 2. An optional upgrade is to identify the printed edition by comparing sample passages with a public-domain scan; that is evidence, not a requirement.

UNKNOWN when any of 1-4 is missing (for example: no version marker yet, or the WEB release not named).
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
- Proof that a digital edition is the one the author printed. The printed edition is recorded as known, claimed or unknown, and "unknown" does not fail Gate 2.

## Where the code stands

The scorecard (`tools/source-scorecard.mjs`) now applies these definitions when the register is present, and prints each criterion as an evidence line.

- Gate 2: PASS only when all four criteria hold. Criterion 1 needs the work named with a date in the source line (ignoring a year that only names a branch) or in the register's `work` record, and no "not recorded" or "origin and edition". Criterion 4 needs `acquisition.versionMarker` in the register. A printed edition stated as "not identified" is shown as an evidence line and does not affect the result. FAIL stays only for "not recorded".
- Gate 6, public domain by age: PASS needs the work (title, author) and a date, where a date only "claimed in repo" does not count unless the file's own source line gives it, and the digital edition's licence recorded (a conversion licence in the rights claim, or `rights.digitalEditionLicence`).
- Gate 6, licensed: PASS needs licence, source and obligations recorded, the Worker naming the attribution, and, for share-alike, `shareAlikeDecision` written in the register.
- A witness, a licence statement or a measured match alone never turns UNKNOWN into PASS.

## Next steps (separate changes, one at a time)

1. Header lines for the Bible files and Wesley, so criterion 1 and 2 can be met.
2. Version markers (`acquisition.versionMarker`) and `digitalEditionLicence` where they are known, in the register.
