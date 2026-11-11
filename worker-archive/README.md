# Worker archive v40 to v46

Exact copies of Worker source as built, with tests. Kept for history and rollback. Not published by Netlify (it only publishes `dist`) and not read by the library checks.

**Status rule:** the status text inside each file header (for example "DRAFT -- NOT DEPLOYED") was written when the file was built and was not updated after deployment. Tom deploys every version by pasting it into Cloudflare. Deploy dates below are left blank for Tom to fill from the Cloudflare Deployments tab; nothing here is guessed.

v46 depends on the library Calvin text and index (`library/commentary/Calvin`, `library/commentary-index/Calvin`); it returns nothing if the index and text hash disagree. v46 was merged and deployed Nov 10 2026; live validation (Romans 8:28 and 2 John) is pending.

| Version | Predecessor | Bytes | Lines | SHA-256 | Deployed on | Replaced by |
|---|---|---|---|---|---|---|
| v40 | v39 | 210,499 | 4,170 | `5ffa2e3f9c574fa3aa0754689f0253366a6938dcaf69337131fd361f214b9431` | _blank_ | v41 |
| v41 | v40 | 213,250 | 4,203 | `ad2409e37e69edc77de6d1b805d58e6e3e641a9fca7f8a894326eba40e105878` | _blank_ | v42 |
| v42 | v41 | 214,151 | 4,206 | `e74f00b42b6dbdb20fdbab6562cd326df5f5c28c647df3b5499c10fe2b204155` | _blank_ | v43 |
| v43 | v42 | 214,565 | 4,208 | `b79e60b0dd1cd9e5ea3f75a47b9b389db17005f1710f0cb69332ad6e4d948725` | _blank_ | v44 |
| v44 | v43 | 216,237 | 4,218 | `f8aab84f01c35695e07d2baa3297526aa4e41f081d25c1a5cb85767a1939022f` | _blank_ | v45 |
| v45 | v44 | 222,964 | 4,332 | `5121eb2cd19b5e5a885926fce6fb21e8ef88bd6f778a33611d8fcaf49132092b` | _blank_ | v46 |
| v46 | v45 | 225,107 | 4,353 | `0bf8bc2e18724dfe5abebf0740e64186e17f4049aaa169107dcccd01133ce5f1` | _blank_ | (current) |

## Header summary of each version (copied from the file, may be stale on status)

**v40** Current version: v40 (DRAFT -- NOT DEPLOYED). v40 = v39 + one change: fetchBSBVerse / fetchBSBPassage read library/bible/BSB instead of data/bsb/bsb.json. Nothing else changes.

**v41** Current version: v41 (DRAFT -- NOT DEPLOYED). v41 = v40 + two changes: (1) the World English Bible is now eBible.org's World English Bible Updated (library rebuilt Nov 8), so the edition is labelled "World English Bible Updated (WEB)"; (2) EDITION_PLACEMENTS: when a study touches a passage the edition prints at a different place (WEB Updated prints the Romans 16:25-27 doxology at Romans 14:24-26), the supplied-script

**v42** Current version: v42 (DRAFT -- NOT DEPLOYED). v42 = v41 + one change: Matthew Henry is now read from the repaired library copy (library/commentary/MHC) instead of the original in data/. Checked on all 1,189 chapters and 31,102 verses: same sections, same verses answered, and 382 verses in 60 chapters now also carry 75 restored poetry/Latin quotation blocks (nothing removed); the sources footer names the digital text 

**v43** Current version: v43 (DRAFT -- NOT DEPLOYED). v43 = v42 + Matthew Henry cap raised from 2,000 to 3,000 characters (constant MHC_CAP); nothing else changes. Previous: v42 (Henry read from library/commentary/MHC). v42 = v41 + one change: Matthew Henry is now read from the repaired library copy (library/commentary/MHC) instead of the original in data/. Checked on all 1,189 chapters and 31,102 verses: same sections, same

**v44** Current version: v44 (DRAFT -- NOT DEPLOYED). v44 = v43 + the commentary migration table (LIBRARY_COMMENTARY_FOLDERS): Matthew Henry, JFB, Scofield, Tyndale, Wesley, Barnes (NT) and Spurgeon are now read from the repaired library copy. CALVIN STAYS ON data/: on the library copy the Worker's verse finder lands on the chapter opening for about 7,100 verses (its text was re-sectioned), so Calvin needs its own reader fir

**v45** Current version: v45 (DRAFT -- NOT DEPLOYED). v45 = v44 + verbatim quote enforcement: each >>COMMENTARY block is checked against the supplied excerpt just before it is sent; a quote that is not word for word is rebuilt from the excerpt's own words (gaps marked with …) or, if it cannot be, un-quoted. Plus a prompt rule (QUOTE ACCURACY) and two log lines (Quote repair, Quote check AS SENT).

**v46** Current version: v46 (DRAFT -- NOT DEPLOYED). v46 = v45 + one change: Calvin's Commentaries are read from the repaired, gated library copy (library/commentary/Calvin) through the verse index (library/commentary-index/Calvin), by its own reader (readCalvinVerse): sections that open on the verse; otherwise the section whose span covers it; otherwise nothing (an honest null, not the chapter opening). A chapter-level cal

## Tests
`tests/` holds the scripts used: BSB (v40), edition placement (v41), Matthew Henry (v42, v43), v45, an end-to-end character check (e2e40), and the v45-vs-v46 Calvin comparison and spot-check. The comparison result itself is summarised in `worker-v46-notes.md`.

## Not archived here
v29, v31, v33, v35, v37 intermediate files and v39 are not in this folder (v39 and several others are in the project docs). Each later version contains their changes.
