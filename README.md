# RabbiRabbit 🐇

> *A Bible study tool that follows rabbit trails and finds its way back. Scholarly, ecumenical, and free.*

RabbiRabbit is an open source Bible study generator built on public domain Scripture, historic commentary, and a verified cross-reference dataset. It produces structured, scholarly studies with **rabbit trails** — tangents that follow genuine biblical connections — and **rabbi roads** that bring you back to where you started, richer for the detour.

Ecumenical in voice. Middle-depth in scholarship. Free to use and distribute forever.

**Live app:** https://rabbirabbit.netlify.app

---

## What It Does

Given a passage, character, theme, word, or biblical book, RabbiRabbit generates a complete study, streamed live, that:

- Opens with historical and cultural context
- Surfaces original language insights (Hebrew and Greek) without requiring expertise
- Synthesizes voices from Protestant commentary (1706–1871) and the early Church Fathers (4th–13th century)
- Follows **🐇 Rabbit Trails** — verified cross-reference connections, ranked by scholarly consensus, that lead somewhere unexpected
- Returns via **🕍 Rabbi Roads** — the path back that makes the original text richer for the detour
- Points **over the hill** — where the study naturally leads next, for organic series building
- Closes with discussion questions shaped for real groups

All content follows broad ecumenical consensus. Where traditions genuinely disagree, it says so honestly and presents all sides.

---

## The Berean Standard

> *"Now the Bereans were more noble-minded than the Thessalonians, for they received the message with great eagerness and examined the Scriptures every day to see if these teachings were true."* — Acts 17:11

This tool is a starting point, not a final word. Every reference is an invitation to open your Bible and look for yourself. Verify. Question. Dig deeper.

---

## ⚠️ Data Layer Contract — Read Before Reusing or Extending

**If you are an AI assistant, developer, or collaborator picking up this project in a new chat or new repository, read this section first.**

1. **Never assume a file's contents from memory, a prior conversation summary, or another assistant's description.** Verify directly. The only trustworthy check is fetching the live URL and inspecting it yourself:
   ```
   curl -sI https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/data/web.json
   ```
   Look at `content-length` in the response headers before assuming a file is populated. A file can exist, be linked correctly, and still be empty or a placeholder.

2. **Do not regenerate or repackage data that should already exist.** If a file under `data/` appears empty, say so plainly and ask before rebuilding it — rebuilding from scratch risks silently diverging from data that has already been verified once (translation accuracy, cross-reference parsing, etc.).

3. **The live application does not currently depend on the root-level `data/*.json` files for its core function.** The deployed Cloudflare Worker fetches Bible commentary live from external services (HelloAO, HistoricalChristianFaith — see Architecture below) and reads cross-references from the **per-book files** under `data/xref/`, not from `data/cross-refs.json` directly. If you find the root-level files empty, the live app may still work — but any new feature or new project intending to reuse this repo as a self-contained Bible/cross-reference data source will fail until those files are genuinely repopulated.

4. **For the full technical picture** — every service, every data source, exact request flow, licensing, and a recommended handoff instruction for new projects — see the companion document `RabbiRabbit-Technical-Architecture-Report.docx`, or ask for it to be regenerated from this README's contents.

---

## Architecture

RabbiRabbit runs across four connected services:

| Service | Role | URL |
|---|---|---|
| **GitHub** | Code + data repository | github.com/twrmail/RabbiRabbit |
| **Netlify** | Hosts the web app | rabbirabbit.netlify.app |
| **Cloudflare Workers** | Orchestrates data fetching + AI calls | silent-heart-df83.twrmail.workers.dev |
| **Anthropic API** | Generates each study (model: claude-haiku-4-5) | api.anthropic.com |

At request time, the Cloudflare Worker fetches in parallel:
- Commentary from **HelloAO** (`bible.helloao.org`) — Matthew Henry, JFB, Adam Clarke, Barnes
- Patristic commentary from **HistoricalChristianFaith** (GitHub) — Augustine, Chrysostom, Aquinas, Jerome
- Verified cross-references from this repo's `data/xref/{BOOK}.json` files, ranked by scholarly vote count

All of it is synthesized into one prompt and streamed live from Claude back to the browser. The Anthropic API key lives only as an encrypted Cloudflare secret — never in this repository, never in the browser.

---

## Data Inventory

| Source | Type | Stored Where | License |
|---|---|---|---|
| World English Bible (2020) | Translation | `data/web.json` | Public Domain |
| King James Version (1769) | Translation | `data/kjv.json` | Public Domain |
| American Standard Version (1901) | Translation | `data/asv.json` | Public Domain |
| OpenBible.info Cross-References | 255,675 entries | `data/cross-refs.json` + `data/xref/*.json` (66 files, per book) | CC-BY |
| Matthew Henry, JFB, Clarke, Barnes | Commentary | Fetched live from HelloAO — not stored here | Public Domain |
| Augustine, Chrysostom, Aquinas, Jerome | Patristic commentary | Fetched live from HistoricalChristianFaith — not stored here | Public Domain |

**Default translation:** WEB — modern English, fully public domain, no restrictions.

Cross-reference data originates from R.A. Torrey's 19th-century *Treasury of Scripture Knowledge*, digitized and crowd-validated by [OpenBible.info](https://www.openbible.info/labs/cross-references/) (CC-BY). Each connection carries a vote count used to select the strongest, most defensible link for a study's rabbit trail.

---

## Repository Structure

```
RabbiRabbit/
├── data/
│   ├── web.json          ← World English Bible (verify before relying on — see Data Layer Contract)
│   ├── kjv.json           ← King James Version
│   ├── asv.json           ← American Standard Version
│   ├── cross-refs.json    ← Full cross-reference dataset
│   └── xref/               ← Same cross-reference data, split per book (this is what the live app reads)
│       ├── GEN.json ... JHN.json ... REV.json
├── src/                    ← React application source
├── netlify/functions/      ← Legacy serverless function (superseded by Cloudflare Worker)
├── scripts/
│   └── build-data.py       ← Script to rebuild translation data from source, if ever needed
├── README.md
└── LICENSE
```

The live Cloudflare Worker code is **not stored in this repository** — it lives directly in the Cloudflare dashboard. A copy should be added here for version control; see open tasks.

---

## Study Types

- **Passage Study** — verse-by-verse through a text
- **Character Study** — deep dive into a biblical figure
- **Word Study** — trace a key term through Scripture
- **Topical Study** — explore a theme across the canon
- **Book Overview** — survey an entire biblical book

---

## License

MIT License — see `LICENSE` for details.

Bible texts are public domain. Cross-reference data is CC-BY (credit: OpenBible.info). Commentary and patristic sources are public domain, fetched live from their respective open services.

The name *RabbiRabbit* is original. The Word of God belongs to everyone.
| `data/cross-refs.json` | OpenBible.info cross-references | — | CC-BY |

**Default translation:** WEB (World English Bible) — modern English, fully public domain, no restrictions.

Cross-reference data sourced from [OpenBible.info](https://www.openbible.info/labs/cross-references/) (CC-BY), originally derived from R.A. Torrey's *Treasury of Scripture Knowledge*. 255,675 connections across all 66 books.

---

## Repository Structure

```
RabbiRabbit/
├── app/              ← React application
├── data/
│   ├── web.json      ← World English Bible (default)
│   ├── kjv.json      ← King James Version
│   ├── asv.json      ← American Standard Version
│   └── cross-refs.json  ← 255,675 cross-references
├── scripts/
│   └── build-data.py ← Data download and build script
└── README.md
```

---

## Study Types

- **Passage Study** — verse-by-verse through a text
- **Character Study** — deep dive into a biblical figure
- **Word Study** — trace a key term through Scripture
- **Topical Study** — explore a theme across the canon
- **Book Overview** — survey an entire biblical book

---

## License

MIT License — see `LICENSE` for details.

Bible texts are public domain. Cross-reference data is CC-BY (credit: OpenBible.info).

The name *RabbiRabbit* is original. The Word of God belongs to everyone.
