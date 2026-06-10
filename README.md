# RabbiRabbit 🐇

> *A Bible study tool that follows rabbit trails and finds its way back. Scholarly, ecumenical, and free.*

RabbiRabbit is an open source Bible study generator built on public domain Scripture and cross-reference data. It produces structured, scholarly studies with **rabbit trails** — tangents that follow genuine biblical connections — and **rabbi roads** that bring you back to where you started.

Ecumenical in voice. Middle-depth in scholarship. Free to use and distribute forever.

---

## What It Does

Given a passage, character, theme, word, or topic, RabbiRabbit generates a complete Bible study that:

- Opens with historical and cultural context
- Surfaces original language insights (Hebrew and Greek) without requiring expertise
- Follows **🐇 Rabbit Trails** — genuine cross-reference connections that lead somewhere unexpected
- Returns via **🕍 Rabbi Roads** — the path back that makes the original text richer for the detour
- Points **over the hill** — where the study naturally leads next, for organic series building
- Closes with discussion questions shaped for real groups

All content follows broad ecumenical consensus. Where traditions genuinely disagree, it says so honestly and presents all sides.

---

## The Berean Standard

> *"Now the Bereans were more noble-minded than the Thessalonians, for they received the message with great eagerness and examined the Scriptures every day to see if these teachings were true."* — Acts 17:11

This tool is a starting point, not a final word. Every reference is an invitation to open your Bible and look for yourself. Verify. Question. Dig deeper.

---

## Data

All Bible texts and reference data are **public domain**, self-hosted in this repository.

| File | Translation | Year | License |
|------|------------|------|---------|
| `data/web.json` | World English Bible | 2020 | Public Domain |
| `data/kjv.json` | King James Version | 1769 | Public Domain |
| `data/asv.json` | American Standard Version | 1901 | Public Domain |
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
