# Open threads

One list of everything unfinished, so nothing is lost between chats. Update it in the same pull request as the work. A thread is done only when all three agree: the library file exists, the register records its origin and licence, and the Worker either reads it or this list says "not read yet, on purpose".

Last updated: 2026-11-07 (after PR #56). The full handoff, with recipes and the Worker plan, is `claude/handoff-nov7.md` in the Project. Evidence for each item lives in the Project docs named in the last column (folder `claude/`). Owner: T = Tom, C = Claude.

## P0: next hour
| Thread | State | Needs | Owner |
|---|---|---|---|
| Worker v39 is live; did the Easton bio reach the prompt? | v39 logs `Easton bio supplied: <name>, <n> chars, cap ...`. The study footer lists a source only if the study names it, so a missing Easton in the footer proves nothing | One Apollos study, then read the Cloudflare log for that line | T |
| Branch protection on `main` | GitHub banner: not protected | Settings > Rules > Rulesets: restrict deletions, block force pushes. Required status check only after confirming `library-check.yml` runs on every PR | T |
| Merged branches | About 50 remote branches, nearly all merged | Delete them; KEEP `ccel-sources-nov2` and `wesley-source-oct30`; `identity-cards-1104-1625` waits for a decision (below) | T's go |

## P1: what users see, or what can mislead them
| Thread | State | Needs | Evidence |
|---|---|---|---|
| Worker BSB lookups (`fetchBSBVerse`, `fetchBSBPassage`) | Still read `data/bsb/bsb.json`: the old text (about 5,300 cut-short or word-short verses) and book codes that fail for 37 books | Read `library/bible/BSB`; one small Worker version | contract-test-memo |
| Worker switch from `data/` to `library/` for commentaries, Strong's, Nave's, topic scores, xref, overview map | Only scripture text (v34) and characters (v38) read `library/` | Re-baseline `library-adapter.mjs` and `contract-test.mjs` (built on v28) to v39; switch one source at a time: Calvin, JFB, Henry, Wesley, then the rest | handoff-nov7 section 6 |
| Seven served sources with no source or licence recorded | strongs-hebrew, strongs-greek, concordance, naves, topic-scores, xref-seed, overview-map | Enter the CrossWire page reads (Scofield, Nave's, both Strong's declare public domain), record the unknown module versions; state "our own work" for the seed pool and the overview map if Tom confirms | crosswire-module-licences-nov4 |
| Easton name map | 171 character names have no exact Easton entry; 27 bios sit under a variant spelling | A mapping file (character -> Easton entry) with a checker; credit line for CCEL and the neuu dataset | easton-bios-fix-nov5 |
| WEB notes layer (`library/bible-notes/WEB`, 354 notes on 329 verses) | Built (#45); nothing reads it; not in the register or manifest | Register entry and manifest line; Worker use later (keep Bible files translation-only) | web-and-mhc-checks-nov5 |
| WEB: is our copy the 2020 stable text edition? Does removing the inline notes change "the actual text"? | Page read: "2020 stable text edition"; "World English Bible" is an eBible.org trademark; the page is silent on notes | Compare with the dated eBible.org 2020 file; ask eBible.org, or relabel | web-bsb-pages |
| Church Fathers | Fetched live from `HistoricalChristianFaith/Commentaries-Database` (master), an outside repo that is not in our register | Decide: copy into the library with licence and provenance, or register it as an external dependency | handoff-nov7 section 6.2 |

## P2: provenance and licence lookups (short page reads, then register-only PRs)
| Thread | State | Needs | Evidence |
|---|---|---|---|
| Spurgeon | Repo licence not re-read; edition of the Treasury not named | Page read | provenance-licence-triage |
| Tyndale | Licence statement at source not read; Worker attribution not checked; Exodus 36 gap | Page read; check the Worker text | provenance-licence-triage |
| OpenBible (xref, topic scores) | Licence page unreadable on Nov 3 (redirect loop); attribution wording not checked in the Worker | Page read; Worker text | provenance-licence-triage |
| STEPBible TIPNR | CC BY vs CC BY-NC conflict between the bibliography and the fork | Page read | provenance-licence-triage |
| Scofield | 1917 vs 1967 edition unverified; completeness unverified (481 chapters under 300 characters) | Compare the text | provenance-remaining-questions-nov4 |
| Theographic | 25 of 26 listed sources carry no licence statement | Page reads; decide which fields derive from which source | characters-origin-nov5 |
| Printed editions: Henry, JFB, Calvin, Wesley | Gate 2 criterion 1 fails by design | Identify editions (Henry's repo is `lyteword/mhenry-complete`, CC0; its README never names a printed edition) | henry-source-found-nov4, wesley-two-works-evidence-nov4 |
| Version markers | Only KJV, ASV, WEB, MHC, Easton, BSB have one | Per source: a commit, release or file hash | handoff-nov7 section 5.2 |
| MHC register note says 1.3% of repo text "not itemised" | Wrong: it is the repo's own front matter (content match 99.9%) | One-line register correction | web-and-mhc-checks-nov5 |
| KJV and ASV "not verified this session" | Measured against scrollmapper (99.3%), not against a known printed source | Reword or verify | provenance-licence-register |
| Barnes NT register note "no source recorded" | Origin now known (CCEL `ntnotes.txt`) | Update the entry | provenance-remaining-questions-nov4 |
| BSB release | The publisher's file (`data/bsb/bsb.txt`) has no version or date line, so no named release is claimed. Gate 6 not yet | Author/date for Gate 6; find a dated release to compare | web-bsb-pages |

## P3: decisions only Tom can make
1. Should the prompt ask the model to cite the Easton bio when it uses it (so the footer lists it)? The 3,000-character cap stays.
2. Church Fathers: bring into the library or keep external (P1).
3. Tyndale and Theographic share-alike (CC BY-SA 4.0) vs the repo's MIT root: how to state it (`shareAlikeDecision`).
4. Identity cards: rebuild on current main and merge, drop, or postpone (branch `identity-cards-1104-1625`, built Nov 4 on an older library; if merged, every library change must regenerate the cards).
5. WEB: email eBible.org, or relabel.
6. Does the Worker count Wesley as a separate voice from Henry on Old Testament passages?
7. When to start the commentary switch (P1).

## P4: long tail (library content)
| Thread | State | Needs | Evidence |
|---|---|---|---|
| Calvin | Isaiah 1-66 and Acts 1-28 chapter mapping (136 chapters left alone by the boundary test; Acts about 5% extra); Greek-letter entities (GEN 46/47, HEB 13, PSA 6); readers for Exodus-Deuteronomy, Matthew-Luke, Psalms and several short books; chapter-opening translations (a separate content type, about 240 chapters in 26 books, estimated) | Per handoff-nov4 | calvin-*-report, handoff-nov4 |
| JFB: 97 word differences vs CCEL | Awaiting adjudication | Tom or a reader | jfb-ccel-word-differences |
| Wesley: 125 disagreements vs CCEL; 2 Samuel 24 absent; 2 John under chapter 5 | Awaiting adjudication | Tom or a reader | wesley-ccel-comparison |
| Henry: 75 restored quotation blocks have a CCEL witness; the rest does not | Open | Witness for the rest | henry-blocks-report |
| Replacements for the retired Clarke, Vincent, Meyer, old Barnes OT | Retired, never served | Candidate list, licence and edition checks; downloads need files attached by Tom | repo-roadmap |
| Wesley chapter-level fallback; footer wording for Henry ("Concise" label was corrected in v37) and Wesley | Held | Tom's decision with the Worker switch | status notes |
| Guardian "publication completeness" column | UNKNOWN for most sources | Outside evidence per source | guardian-runner |
| Older `validate-library.mjs` | Reports 142 failures on main by design (library/ repaired vs data/) | Retire or update | library-validation-memo |

## Done recently (for orientation; details in the handoff)
BSB: relabelled, repaired from the publisher's file (5,339 verses), source line, Gate 2 PASS (#53-#56). Easton: full dictionary and all 1,292 character bios inside an Easton entry (#36, #46, #48, #50, #51). WEB notes layer (#45). Gate 2 PASS: KJV, ASV, Easton, BSB. Gate 6 PASS: KJV, ASV, MHC, Spurgeon, Easton.

## Housekeeping
- Stray backslashes in `claude/data-origins-from-chats-nov4.md`.
- The Project's knowledge is about 74% full: ask Tom before deleting old Worker versions (v20-v37) or superseded status docs.
- Hugging Face Easton is CCEL-derived, not an independent copy (noted; no action).
- Worker v39 header comment still says "DRAFT -- NOT DEPLOYED": correct it in the next version.
