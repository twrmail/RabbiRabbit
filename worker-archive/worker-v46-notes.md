# Worker v46: Calvin read from the library (2026-11-10)

Change: `fetchCalvin` reads `library/commentary/Calvin/<BOOK>.json` and the verse index `library/commentary-index/Calvin/<BOOK>.json`.
Rule: sections that open on the verse; else the section whose span covers it; else null. No verse (chapter-level call): start of the chapter text, as before.
Safety: index text length must equal the chapter text length and each section's 30-character head must match, else null (never a shifted passage). Cap 2,500 characters (was 2,000). Footer names the Calvin Translation Society edition, digital text from CCEL. Nothing else changed.

## Comparison with v45 on all 31,102 KJV verses (test-calvin-v46-compare.mjs)
- v45 answered 21,145 verses, but 12,827 of those were only the first 2,000 characters of the chapter (the finder found no anchor). Only 8,318 were anchored to the verse.
- v46 answers 19,753 verses, every one from a section that opens on or covers the verse. 11,545 verses that used to get the chapter opening now get the real section.
- 1,282 verses that used to get the chapter opening now get nothing (honest null): Calvin has no section there.
- 157 verses were anchored in v45 and are null in v46: verses after a chapter's last indexed section or in Harmony of the Gospels sections (Matthew 24, Mark 27, Luke 29, Deuteronomy 19, Leviticus 13, Ezekiel 9 ...). By the library standard "no section there". v45 matched them to a verse-table header like "Acts 22:23-30".
- 47 verses v45 could not answer are now answered. Stale index chapters: 0.
- Spot checks (test-calvin-v46-spot.mjs, fetch mocked from the repo): John 3:16, Romans 8:28, Jeremiah 10:2, 1 Corinthians 16:22, Psalm 23:1, Isaiah 53:5 and the whole chapter, Nahum 1:2, Genesis 1:1 return the right section; 2 John, Ezekiel 21 return null. Subrequests per call: 2.

## Known limits
- Sections that open on a verse table begin with Calvin's own English and Latin verse text (about 400-1,500 characters), which uses part of the cap.
- Book codes follow the Worker's existing map ("JHN", not "JOHN"), the same as every other source.
- Not deployed. Deploy = paste into the Cloudflare editor, Deploy, then start a NEW study. Check the Cloudflare log for a Calvin study.
