# What is in the repo, what it costs, and what was removed (2026-11-10)

Measured: about 503 MB checked out (data/ 227, library/ 218, source-originals/ 17, notes-out/ 16 before this change) and 280 MB of git history (244 MB packed). The app is not slowed by any of it: Netlify publishes only the built `dist` folder, and the Worker fetches single files by URL from raw.githubusercontent.com. Size only costs clone time for a person or a Claude session.

## Removed in this change
- `notes-out/` (16 MB): output of the JFB pilot converter `convert-jfb-notes.mjs` (its header says PILOT). Nothing in the repo, the Worker, CI or the tools reads it. Still in history: `git show d42cdfb:notes-out/JFB/1CO.json`; regenerate with the usage line in the converter's header.

## Looks removable, is not (and why)
| Path | Size | Why it stays |
|---|---|---|
| `data/` | 227 MB | The originals the scorecard compares the repaired library against (preservation gate), the inputs of `build-library.mjs`, and still read by the Worker: `data/dict` (Strong's, Nave's, topics), `data/xref`, and the retired commentaries. Not touched. |
| `library/patches/` | 32 MB | Inputs of the recorded rules in `library/fixes.json`; the check re-applies them. |
| `source-originals/ccel-wesley/`, `ntnotes-raw.txt` | 14 MB, 22 MB | Raw sources of Wesley and Barnes NT rebuilds (provenance). Candidates to move to a release asset with a sha256 manifest, as was done for CCEL Calvin. Saves checkout size only. |
| `library/_retired/` | 6 MB | Retired sources kept so they are never lost; the Worker must not serve them. |
| git history | 280 MB | Shrinking it needs a history rewrite, which would break every merged PR link and release. Not worth it. |

## What would make it faster (not done here)
1. **Worker:** the cost at runtime is the size of the per-book files it parses (Calvin Jeremiah 4.5 MB, Psalms 4.3 MB, Spurgeon Psalms 4.9 MB). Edge caching in `fetchJSON` (Cloudflare cache) and per-chapter files for the largest books would cut fetch and parse time. This is a Worker change with its own test, not a repo clean-up.
2. **Clones:** shallow clone (`--depth 1`) for sessions that do not need history.
