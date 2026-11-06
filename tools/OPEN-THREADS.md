# Open threads

One list of everything unfinished, so nothing is lost between chats. Update it in the same pull request as the work. A thread is done only when all three agree: the library file exists, the register records its origin and licence, and the Worker either reads it or this list says "not read yet, on purpose".

Last updated: 2026-11-05 (after PR #47; Easton dictionary PR open). Evidence for each item lives in the Project docs named in the last column (folder `claude/`).

## Worker (parked until the library is ready; Tom releases it)
| Thread | State | Needs | Evidence |
|---|---|---|---|
| Switch the Worker from `data/` to `library/` | Live Worker reads `data/`; none of the library repairs reach users | Adapter and contract test exist (built against v28); re-run against the version actually deployed; confirm which version is live | data-layout-standard, contract-test |
| Cap on character bios | Longest bio is 18,855 characters, 23 over 3,000, 9 over 6,000; v37 puts the whole bio in the prompt | One small Worker change before the switch | worker-v37 |
| Footer wording | Henry "Concise" label, Wesley wording | Tom's decision; part of the same update | status notes |
| Chapter-level Wesley fallback (v38) | Held | Tom's decision | status notes |
| OpenBible attribution wording | Not checked in the Worker text | Page read, then Worker text | provenance-licence-triage |

## Library content
| Thread | State | Needs | Evidence |
|---|---|---|---|
| Easton bios, 38 characters whose bio was not inside Easton's entry of the same name | Decided 2026-11-05: 11 corrected, 4 completed, 27 kept (correct Easton text under a variant spelling); in PR #46 | Merge #46 | easton-review-resolution-nov5 |
| Easton: 171 names with no exact Easton entry; 27 bios filed under a variant spelling | Held, unchanged | A name map from characters to dictionary entries (now possible: the full dictionary is in the library) | easton-bios-fix-nov5 |
| WEB translator notes (354 notes on 329 verses) removed at build time | Layer built (PR #45) in `library/bible-notes/WEB`, apart from verse text; nothing reads it yet | Register entry and manifest line for the layer; Worker use later; read the WEB's terms on dropping notes from the text | web-and-mhc-checks-nov5 |
| WEB `year: 2020` field in the files | Page read 2026-11-05: eBible.org calls the current text "the 2020 stable text edition", so 2020 is a real edition name; field left as is | Show our copy is that edition (compare the dated 2020 file) | web-bsb-pages |
| Full Easton's Bible Dictionary (3,964 entries) | Data in PR #48; register, manifest line and scorecard row in the next PR (Gate 2 and Gate 6 PASS by the agreed definitions) | Name map from characters to entries; Worker use later; credit line for CCEL and the neuu dataset | easton-copies-compared-nov5 |
| 6 character bios not found inside any Easton entry, and Daniel's bio (Belteshazzar note only) | Done 2026-11-05: all 1,292 bios now sit inside an Easton entry; Daniel is the prophet's sense | Eber's bio reads "(8:12)" as Easton prints it, without the "1 Chr." an earlier tool had added | easton-review-resolution-nov5 |
| Calvin leftovers; JFB and Wesley word differences vs CCEL | Open from earlier handoffs | Per handoff-nov4 | handoff-nov4 |
| Identity-cards installer | Not started | Tom's go | identity-cards |

## Provenance and licence (register: `library/provenance.json`)
| Thread | State | Needs | Evidence |
|---|---|---|---|
| Gate 2 PASS: KJV, ASV. Gate 6 PASS: KJV, ASV, MHC, Spurgeon | Done | none | PRs #39-#43 |
| MHC register note says 1.3% of repo text "not itemised" | Wrong: it is the repo's own front matter (content match 99.9%) | One-line register correction | web-and-mhc-checks-nov5 |
| Printed edition not identified: MHC, JFB, Calvin, Wesley, Henry | Gate 2 criterion 1 fails by design | Identify editions (page reads) | provenance-remaining-questions-nov4 |
| WEB release | Page read: 2020 stable text edition is the name; our copy not yet proven to be it | Compare with the dated eBible.org 2020 file | web-bsb-pages |
| WEB terms: does removing notes change "the actual text"? | Page read: public domain, but "World English Bible" is an eBible.org trademark and a changed text should not use the name; the page is silent on notes | Ask eBible.org, or relabel | web-bsb-pages |
| BSB: label, year, 2023 text | Done 2026-11-06: relabelled to Berean Standard Bible and 8,224 spaces inside quotes/apostrophes/parentheses removed (recorded fixes bsb-label, bsb-quote-spacing). Source line still has no year | Add the year to the source line; show our text is the 2023 release | web-bsb-pages |
| BSB text defects from the open-bibles conversion | Done 2026-11-06: 5,339 verses set to the publisher's file by recorded fix bsb-from-publisher; every library verse now equals data/bsb/bsb.txt (tools/check-bsb-against-publisher.mjs) | Add the year and the bereanbible.com address to the source line (header change) | web-bsb-pages |
| Tyndale and Theographic share-alike vs the repo's MIT root | No `shareAlikeDecision` recorded | Tom's decision | provenance-licence-triage |
| Theographic: 25 listed sources with no licence | Open | Page reads | characters-origin-nov5 |
| STEPBible TIPNR licence conflict | Open | Page read | provenance-licence-triage |
| Scofield 1917 vs 1967 | Open | Page read | provenance-remaining-questions-nov4 |
| Spurgeon and Tyndale licence pages | Not read | Page reads | provenance-licence-triage |
| Version markers for JFB, Calvin, Wesley, Spurgeon, Tyndale, BSB and the other sources | Only KJV, ASV, WEB, MHC have one | Per source: find the commit or release | PRs #41-#43 |

## Housekeeping
- `validate-library.mjs` (older, compares library/ with data/) reports 142 failures on main, before and after recent changes; the recorded repairs make them differ by design. Retire it or update it.
- Delete merged branches (`gate-code-1105`, `headers-1105`, `register-versions-1105`, `register-mhc-1105`, `web-source-1105`, `open-threads-1105` and earlier ones).
- Stray backslashes in `claude/data-origins-from-chats-nov4.md`.
- Hugging Face Easton is CCEL-derived, not an independent copy (noted; no action).
