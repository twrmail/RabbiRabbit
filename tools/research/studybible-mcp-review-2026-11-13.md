# StudyBible MCP — external project review

**Recorded:** 2026-11-13  
**Status:** Research reference only. No source adopted, no library changes, no Worker changes.

Reference project: [djayatillake/studybible-mcp](https://github.com/djayatillake/studybible-mcp)  
Announcement: [Study Bible MCP announcement](https://viz.bible/announcing-study-bible-mcp-ai-scripture-integration/)  
Architecture: [ARCHITECTURE.md](https://github.com/djayatillake/studybible-mcp/blob/main/ARCHITECTURE.md)

## 1. What the project is

StudyBible MCP is a Python Model Context Protocol server exposing Bible research resources to AI clients. Its README describes hosted access through Fly.io, local/self-hosted installation, and use with Claude Desktop, Claude Code, ChatGPT Developer Mode, Cursor, Windsurf, and Cline.

The architecture is tool-oriented: the AI classifies a question, calls specialized tools, may chain additional tools, and synthesizes the returned material. The server uses a prebuilt SQLite database rather than a Cloudflare Worker-native library. The README describes a database in the approximate 600–750 MB range, including lexical, textual, graph, study-note, ancient-source, and vector-search data.

Reported resource counts in the README include:
- 19,391 lexicon entries
- 31,280 tagged verse rows
- 31,086 BSB verse rows
- 102,673 Aquifer-related records
- 6,019 ACAI entity annotations
- 87 Ancient Near East entries
- 31,280 verse vectors and 5,190 passage vectors

These are project-reported counts, not independently audited counts.

## 2. Resource categories

The README describes:
- Greek/Hebrew lexicons: LSJ, BDB, Abbott-Smith, and Strong's
- Morphologically tagged biblical text
- BSB English text
- MT/LXX comparison and textual-variant tools
- Cross-references and semantic passage search
- Aquifer Open Study Notes, translation notes, dictionary articles, and key terms
- Tyndale Bible Dictionary
- Theographic people/place/event/genealogy graph and ACAI annotations
- Ancient Near East cultural-context entries
- Torah Weave structure
- Ancient-source corpora: Josephus, Targum Onkelos, Qumran/DSS, Philo, 1 Enoch, 4 Ezra, and Mishnah

## 3. Licensing — mixed bundle; do not adopt wholesale

The project's README explicitly warns that its downloadable database includes multiple licences:
- STEPBible data: CC BY 4.0 (as reported in the project documentation)
- Berean Standard Bible: described there as public domain
- Josephus and Philo material: CC BY-SA 4.0 (as reported)
- ETCBC Dead Sea Scrolls/Qumran transcription: CC BY-NC 4.0 (non-commercial)
- Metsudah Chumash/Targum English material: CC BY-NC 4.0 (non-commercial)
- Other named resources include Aquifer, Theographic, Tyndale dictionary, and further data whose rights must be checked at the individual dataset/edition level; do not infer their licences from the aggregate database notice.

The database-level licence notice is not a blanket licence for every component. The NC-licensed material is unsuitable for a commercial RabbiRabbit distribution unless its rights are separately cleared. Share-alike obligations also need to be assessed before redistribution or adaptation.

**Rule:** No whole-database download, copying, mirroring, or import into RabbiRabbit. Any future consideration must be dataset-by-dataset: identify the exact work, edition, source URL, rights holder, licence/version, attribution, modification conditions, commercial-use limits, and intended use before acquisition. Keep unresolved rights UNKNOWN.

## 4. Architectural fit with RabbiRabbit

StudyBible MCP is not directly portable as a unit:
- Its core is a large prebuilt SQLite database and includes vector tables.
- RabbiRabbit's production runtime is a Cloudflare Worker with a separate curated source library and retrieval contracts.
- Using the hosted MCP service would introduce a runtime dependency on another project's hosting and uptime.
- Extracting selected resources into RabbiRabbit would require separate provenance, licence, completeness, and format validation.

The two projects also have different AI responsibilities:
- StudyBible MCP gives the AI a broad set of tools and allows it to choose and chain research calls, then synthesize.
- RabbiRabbit's emerging lab approach makes retrieval and source quotation code-controlled, asks AI to select source-unit IDs and write bounded connective narrative, and keeps source text visible.

The MCP project is a useful research reference, not a reason to change RabbiRabbit's present architecture.

## 5. Potentially useful areas to investigate later

### A. Lexicon resources
Potentially useful for word-study lookup if the individual source edition and licence permit the intended use. The desired RabbiRabbit approach would display attributable source material directly rather than introduce free-form AI scholarship. No lexicon dataset is approved for import yet.

### B. Theographic graph
Potentially useful for a future "people in this passage" or relationship-discovery feature. RabbiRabbit has separately examined Theographic and has a prior rights/provenance discussion with its owner; any use must follow the specific permission/licence already established for RabbiRabbit, preserve IDs and attribution, and retain the project's cautions about AI-generated definitions, chronology, and graph assertions. The MCP project's presence of Theographic is not independent rights clearance.

### C. Textual variants and MT/LXX comparison
Potentially useful as a design reference for explicit edition labels, versification mapping, and separating manuscript evidence from interpretation. Do not import its compiled tables without checking the exact source editions, mappings, translations, and licences.

### D. Ancient-source metadata and editorial cautions
The strongest design reference may be its structured labelling of canon status, date/tier, edition, translation, editorial cautions, and typed relationships to biblical passages (e.g. aligned text, echo, shared tradition, contrast, translation). This is consistent with RabbiRabbit's source-first philosophy and could inform a future source registry. It is metadata design inspiration, not a source adoption.

## 6. Not recommended now

Do not:
- Import the whole SQLite database.
- Add semantic/vector search or an embedding service merely because the other project has them.
- Adopt its hermeneutics prompt as an authority or replace RabbiRabbit's own editorial rules.
- Add Qumran, Targum, or other NC-licensed content without a separate rights decision.
- Change the current production Worker or lab experiment because of this comparison.
- Treat the README's reported counts, resource labels, or licence summaries as an independent audit.

## 7. Recommended next step — deferred

When repository work and the Worker lab permit, choose one narrow candidate and conduct a source-level review. Suggested first candidate: Aquifer Open Study Notes, because it may provide verse notes and translation resources not represented by RabbiRabbit's existing historical commentary corpus. The review must establish:
1. Exact component/source and edition.
2. Actual licence and commercial-use conditions.
3. Whether source text is complete and retrievable, not merely a search index or excerpt collection.
4. Whether it adds distinct value beyond RabbiRabbit's existing resources.
5. Whether it can be stored and served independently without importing the full database.

This is a future research task, not a current work item. Repository quality work remains primary; the isolated Worker lab continues separately. No library or production changes are authorized by this note.

## 8. Review limitations

This note combines:
- Claude's November 12, 2026 summary of the project README, which reported that its read-through was cut off during the Rabbinic texts section and did not cover later setup/licensing details; and
- ChatGPT's November 13, 2026 inspection of the public GitHub README, architecture document, selected Python source and tests.

The project repository is extensive. This was a focused architectural and resource review, not a full audit of all bundled files, source editions, licences, data completeness, runtime behaviour, or the hosted service. Treat all candidate resource rights as unverified until checked against their exact upstream source and licence.

---

*Prepared as an external-project research note for RabbiRabbit. No external project data has been copied into this repository.*
