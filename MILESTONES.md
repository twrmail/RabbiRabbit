# RabbiRabbit — Milestones

Only add an entry here when a version has been deployed AND confirmed
working through actual testing. This is not a full changelog (GitHub's
commit history already is that) — it's a short list of known-good
recovery points, so a rollback never requires guessing by date/time.

When something breaks: find the most recent STABLE entry below, click
its commit link, restore from there.

---
## Repo Cleanup — July 5, 2026
Removed data/wesley (WesleyWalk project material — 155 files:
John's sermons, Charles's hymns, historical context) that had
been accidentally stored inside RabbiRabbit's repo. WesleyWalk
material now lives in desktop folders until that project resumes.
RabbiRabbit repo now contains only RabbiRabbit data.
Commit: a1a427b

---

## v13 — July 5, 2026 — STABLE
**Worker + StudyForm.jsx**

- Word Study two-step pick-list: English word → ranked Hebrew/Greek
  candidates → user picks → study anchors to a real passage via Nave's
- Fixed KJV-era compound word parsing in Strong's ("lovingkindness",
  "loved", "forefather", "belove" etc.) — tested against real dictionary
  entries, not assumed
- Book Overview: 66-book hinge-chapter map, honest flyover/complete
  framing based on book size
- Topical Study: fixed a dormant bug in `fetchNaves()` that had silently
  never worked; added fuzzy topic resolver + anchor-passage extraction
- All fixes tested against live data pulled from the actual repo

Confirmed: Word Study pick-list renders, Book Overview tested on
Genesis/Jonah/Philippians, Topical tested on Grace/Suffering.

Commit: _(paste commit link here after merge)_

---

## v12 — July 4, 2026 — STABLE
**Worker**

- Character Study fix: 1,894-figure index (Easton's Bible Dictionary +
  Theographic Bible Metadata) resolves a name to its first-appearance
  passage, triggering real commentary fetching instead of AI-memory guesses
- Honest sourcing rule: Sources Consulted footer may only list what was
  actually fetched — no more invented bibliographies (Kidner, Sailhamer,
  etc. citing sources never touched)
- Tiered fetching via `Promise.allSettled` — one slow source can no
  longer delay or break a whole study

Confirmed: Methuselah study re-run showed genuine Easton's/Matthew Henry/
Scofield/Augustine sources in the footer, matching what was actually fetched.

Commit: _(paste commit link here)_

---

## v11 — July 3, 2026 — STABLE
**Worker**

- Grade-level targets per audience (Morning Trail 9th, General 11th, etc.)
- Voice rewritten to C.S. Lewis / N.T. Wright register
- Quote hierarchy: Scripture italicized, commentary in block-quotes with
  attribution, synthesis left invisible
- `trailContext` parameter — studies can open by picking up the previous
  study's "What's Over the Hill" thread
- BSB (Berean Study Bible) added as a translation option
- Over the Hill now names an exact destination passage/theme

Confirmed: Fear study and Job 38 study both showed the quote hierarchy
and trail continuity working correctly.

Commit: _(paste commit link here)_

---

## Morning Session — July 3, 2026 — STABLE
**StudyForm.jsx / App.jsx / StudyOutput.jsx**

- Morning Trail redesigned as the hero entry point, Study Builder
  collapsed by default
- 40 Jesus seeds cycling on Morning Trail
- "Go →" button (replacing "Morning Trail" text that was overflowing)
- Trail continuation: "Continue Full Study →" and "Close with a
  Devotional →" buttons, with correct state cleanup on exit

Commit: `6e004d3` — "Merge pull request #3 from twrmail/dev — Dev merge 7-3-2026 1035am"
This is the exact commit that was successfully recovered to earlier —
proof this recovery method works.

---

## How to add a new entry

After a session where something is deployed AND tested successfully:

1. Copy the format above
2. Note the date, what changed, and how it was confirmed working
3. Paste the commit link (click the commit in GitHub, copy the URL)
4. Add it to the TOP of this file, under the header

Do not add entries for untested or mid-experiment states — only genuine
stable points worth rolling back to.
