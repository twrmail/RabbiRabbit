// RabbiRabbit Cloudflare Worker
// Full version history: CHANGELOG.md (extracted from this file's header,
// which had grown to 280 lines of comments before any real code -- see
// CHANGELOG.md's own header for why that's worth avoiding going forward).
// Current version: v42 (DRAFT -- NOT DEPLOYED). v42 = v41 + one change: Matthew Henry is now read from the repaired library copy (library/commentary/MHC) instead of the original in data/. Checked on all 1,189 chapters and 31,102 verses: same sections, same verses answered, and 382 verses in 60 chapters now also carry 75 restored poetry/Latin quotation blocks (nothing removed); the sources footer names the digital text origin. Nothing else changes (Calvin, JFB, Wesley, Scofield, Spurgeon still read from data/ until their own versions).
// Previous: v41 (deployed Nov 8). v41 = v40 + two changes: (1) the World English Bible is now eBible.org's World English Bible Updated (library rebuilt Nov 8), so the edition is labelled "World English Bible Updated (WEB)"; (2) EDITION_PLACEMENTS: when a study touches a passage the edition prints at a different place (WEB Updated prints the Romans 16:25-27 doxology at Romans 14:24-26), the supplied-scripture block says so and supplies the text under its true reference. Nothing else changes.
// v40 was: v39 + one change: fetchBSBVerse / fetchBSBPassage read library/bible/BSB instead of data/bsb/bsb.json.
// v39 (DEPLOYED per Tom, 2026-11-07) = v38 + one log line: when a character study supplies (or fails to find) the Easton bio,
// the Worker logs the character name, bio length and whether the 3,000-character cap applied, so Cloudflare's log shows what was supplied
// even when the model does not name Easton in the study (the footer lists only sources the study names).
// v38 (DEPLOYED per Tom, 2026-11-06) = v37 + one change: character studies read library/people/characters.json (the corrected
// Easton bios) instead of data/dict/characters.json, and the Easton bio put in the prompt is capped at 3,000 characters (capBio, cut at a
// sentence end, marked as an excerpt). Short bios are untouched. Nothing else changes.
// v37 (DRAFT, NOT DEPLOYED; live is v36). v37 = v36 + one change: two source labels corrected (Henry: the data is the full
// commentary, not the "Concise", and its edition is not identified; Wesley: the data covers the whole Bible, not only the NT). Labels only.
// v36 (live) was: v35 + one change: supplied scripture text is cleaned of the WEB file's literal
// "&gt; " poetry marker (117 Psalm verses, found by the source scorecard) and basic HTML entities (cleanScriptureText).
// v35 (DRAFT) was: v34 + one change: character studies also get the supplied scripture text
// (SCRIPTURE_SUPPLY_TYPES). Reason: live Apollos study (Oct 28) changed WEB "an Alexandrian by race" to KJV "born at Alexandria".
// v34 (DRAFT, live) was: v33 + one change: the study prompt now contains the REAL verse text
// (read from library/bible/<EDITION>/<BOOK>.json on main) for the studied passage and its listed cross-references, with
// rules to copy it exactly and never quote a verse that was not supplied; plus a log-only "Scripture check:" line per
// study (MATCH / PARTIAL / NO MATCH per >>SCRIPTURE block). See buildScriptureSupply / verifyScriptureBlocks.
// Everything else is identical to v33.
// v33 (DRAFT) was: v32 + one fix: JFB numbered lines that are really a book
// introduction's outline (Psalms 1, Proverbs 1) or a misnumbered note (Hebrews 13:7) no longer anchor a verse
// (see jfbNumberedLines). 12 verses change vs v32; everything else is identical to v32.
// v32 (DRAFT) was: Built on v28 (live), separate from the v29/v30 Henry
// anchor drafts and the v31 quote-rule draft, so each can be tested and rolled back alone.
// v32 changes ONE thing: how JFB and Scofield answer a VERSE request (option B, Tom Oct 25-26).
//   JFB: JFB's own note on the verse ("16. For God so loved..."); else its grouped note ("14-16."), labelled;
//        else the passage section that covers it ("Ge 1:6-8. Second Day."), labelled "no separate note on
//        verse 7"; else nothing. Never the chapter's opening as if it were the verse note.
//   Scofield: notes are keyed to words, not verse numbers, so a verse request returns nothing.
//   Chapter-level requests (Book Overview, character studies, historical context) are unchanged.
// Why: v28 starts the excerpt at the last blank line before the match; JFB and Scofield files have none,
// so every verse request got the chapter's first 2,000 chars. Sandbox results only; not deployment validation.
// Previous: v28 adds log-only quotation verification (verifyQuotedCommentary). v27: v27 fixes Matthew Henry verse retrieval (section-based; see fetchMHC). v26: v26 adds Barnes' Notes (NT) as an extra voice on passage studies. v25: v25 switches Barnes' Notes (NT) to the rebuilt per-verse CCEL files at Barnes_NT/. (v24 history follows.) v24: v24 adds a NEW SOURCE: Tyndale Open Study Notes,
// full 66-book coverage, real per-verse content (not a stub), converted
// from a clean public-domain-books GitHub repo -- an 11th commentary
// voice. IMPORTANT: unlike every other source in this file, Tyndale is
// CC BY-SA 4.0, NOT public domain. This required fixing THREE separate
// places that all assumed every commentary was public domain: the real
// prompt text shown to the model (search "MODERN STUDY NOTES"), the
// user-facing honest sources footer (buildHonestSourcesFooter()), and a
// second, duplicate prompt-summary block that turned out to be dead code
// never actually interpolated into anything (commentaryLines et al. near
// the top of buildPrompt() -- fixed anyway for whoever reads it next,
// but confirmed inert). Also pre-emptively fixed extractSourceShortName()
// for Tyndale's compound label, the same silent-UNUSED failure class
// already confirmed live for JFB and Barnes in v20 -- fixing it before
// discovery this time instead of after.
const DEV_MODE = false

const MOCK_RESPONSES = {
  passage: `# Genesis 22:1-14 — The Binding of Isaac

## Historical & Cultural Context
This is mock content for dev testing. In Moriah, ancient Near Eastern
sacrificial customs framed obedience as costly...

## The Text

[Mock passage study body — layout and streaming test only]

💬 Is Abraham telling the truth here? In what sense might "God will provide the lamb" be both false and the most truthful thing he has ever said?

## 🐇 Rabbit Trail
Following the verified cross-reference to Hebrews 11:17-19...

💬 What does it mean that faith here is described as "receiving him back" — as if resurrection were already embedded in the logic of obedience?

## 🕍 Rabbi Road
Returning to Genesis 22, the resurrection logic Abraham reasoned toward illuminates what the straight reading missed.

💬 How does knowing Abraham reasoned through resurrection change your reading of the walk up the mountain?

## 🐇 What's Over the Hill
This points toward the Passover lamb in Exodus 12, where provision and sacrifice converge again — but now at national scale.

[MOCK DATA — DEV MODE — sources footer omitted here; production footer is code-generated, see processStream()]`,

  devotional: `# Morning Trail — Psalm 23:1

**Psalm 23:1** — *"The LORD is my shepherd; I shall not want."*

[MOCK DEVOTIONAL — dev testing layout and streaming only]

David wrote this not from a palace throne but from memory of actual sheep, actual wilderness, actual want. Wesley noted that the present tense here is everything — not "was" or "will be" but is. This morning. Now.

The human condition this passage addresses is the one you woke up with: the low-grade anxiety that there will not be enough — enough time, enough money, enough strength, enough of you.

*What would it feel like to actually lack nothing today, even if nothing has changed?*

Lord, quiet the part of me that is already calculating what is missing. Let me find in this moment what David found — that the shepherd is already here, already moving, already sufficient.

*Sit with that for a moment before the day begins.*`,

  word: `# Word Study: *agápē* [ag-ah'-pay] — Love

[MOCK WORD STUDY — dev testing only]

## 🐇 Rabbit Trail
Following agápē to 1 Corinthians 13...

## 🕍 Rabbi Road
Returning enriched...

## 🐇 What's Over the Hill
This opens toward John 21 and the threefold restoration of Peter...`,

  character: `# Character Study: Elijah

[MOCK CHARACTER STUDY — dev testing only]

## 🐇 Rabbit Trail
Following Elijah to Romans 11:2-4...

## 🕍 Rabbi Road
Returning enriched...

## 🐇 What's Over the Hill
This opens toward John the Baptist, whom Jesus identifies as Elijah come again...`,

  topical: `# Topical Study: Grace

[MOCK TOPICAL STUDY — dev testing only]

## 🐇 Rabbit Trail
Following grace to Romans 5:20...

## 🕍 Rabbi Road
Returning enriched...

## 🐇 What's Over the Hill
This opens toward the parable of the workers in the vineyard...`,

  book: `# Book Overview: Romans

[MOCK BOOK OVERVIEW — dev testing only]

## 🐇 Rabbit Trail
Following to Habakkuk 2:4, the verse Paul quotes at Romans 1:17...

## 🕍 Rabbi Road
Returning enriched...

## 🐇 What's Over the Hill
This opens toward Galatians, Paul's shorter, sharper version of the same argument...`,
}

function getMockResponse(studyType) {
  return MOCK_RESPONSES[studyType] || MOCK_RESPONSES.passage
}

function createMockStream(text) {
  const encoder = new TextEncoder()
  // FIX: confirmed live -- cached devotionals were losing every newline
  // character, jamming ">>SCRIPTURE"/">>END" markers and paragraph
  // breaks into one run-on block of text. Root cause: JavaScript's `.`
  // does not match `\n` by default, so `.{1,8}` silently dropped every
  // newline while chunking. The `s` (dotAll) flag fixes it. This
  // function is shared by DEV_MODE mock responses too -- same latent
  // bug likely affected those as well, just never visibly scrutinized
  // the way a real cached devotional now is.
  const chunks = text.match(/.{1,8}/gs) || [text]
  let i = 0
  return new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      const chunk = chunks[i++]
      const sseLine = `data: ${JSON.stringify({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: chunk }
      })}\n\n`
      controller.enqueue(encoder.encode(sseLine))
      await new Promise(r => setTimeout(r, 15))
    }
  })
}

// ── BOOK MAPS ─────────────────────────────────────────────────────

const BOOK_MAP = {
  'genesis':'GEN','exodus':'EXO','leviticus':'LEV','numbers':'NUM',
  'deuteronomy':'DEUT','joshua':'JOSH','judges':'JUDG','ruth':'RUTH',
  '1 samuel':'1SAM','2 samuel':'2SAM','1 kings':'1KGS','2 kings':'2KGS',
  '1 chronicles':'1CHR','2 chronicles':'2CHR','ezra':'EZRA','nehemiah':'NEH',
  'esther':'ESTH','job':'JOB','psalms':'PSA','psalm':'PSA','proverbs':'PROV',
  'ecclesiastes':'ECCL','song of solomon':'SONG','song of songs':'SONG',
  'isaiah':'ISA','jeremiah':'JER','lamentations':'LAM','ezekiel':'EZEK',
  'daniel':'DAN','hosea':'HOS','joel':'JOEL','amos':'AMOS','obadiah':'OBAD',
  'jonah':'JONAH','micah':'MIC','nahum':'NAH','habakkuk':'HAB',
  'zephaniah':'ZEPH','haggai':'HAG','zechariah':'ZECH','malachi':'MAL',
  'matthew':'MAT','mark':'MRK','luke':'LUK','john':'JHN','acts':'ACTS',
  'romans':'ROM','1 corinthians':'1COR','2 corinthians':'2COR',
  'galatians':'GAL','ephesians':'EPH','philippians':'PHIL','colossians':'COL',
  '1 thessalonians':'1THESS','2 thessalonians':'2THESS',
  '1 timothy':'1TIM','2 timothy':'2TIM','titus':'TIT','philemon':'PHLM',
  'hebrews':'HEB','james':'JAS','1 peter':'1PET','2 peter':'2PET',
  '1 john':'1JHN','2 john':'2JHN','3 john':'3JHN','jude':'JUDE',
  'revelation':'REV',

  'ex':'EXO','exo':'EXO','gen':'GEN','lev':'LEV','num':'NUM','nu':'NUM',
  'deut':'DEUT','dt':'DEUT','josh':'JOSH','jos':'JOSH','judg':'JUDG','jdg':'JUDG',
  'ru':'RUTH',
  '1 sam':'1SAM','1sam':'1SAM','1sa':'1SAM','1 sm':'1SAM',
  '2 sam':'2SAM','2sam':'2SAM','2sa':'2SAM','2 sm':'2SAM',
  '1 kgs':'1KGS','1kgs':'1KGS','1ki':'1KGS','1 kg':'1KGS',
  '2 kgs':'2KGS','2kgs':'2KGS','2ki':'2KGS','2 kg':'2KGS',
  '1 chr':'1CHR','1chr':'1CHR','1ch':'1CHR','1 chron':'1CHR',
  '2 chr':'2CHR','2chr':'2CHR','2ch':'2CHR','2 chron':'2CHR',
  'ezr':'EZRA','neh':'NEH','ne':'NEH','esth':'ESTH','est':'ESTH',
  'jb':'JOB',
  'ps':'PSA','psa':'PSA','pss':'PSA',
  'prov':'PROV','pr':'PROV','pro':'PROV',
  'eccl':'ECCL','ecc':'ECCL','eccles':'ECCL','qoh':'ECCL',
  'song':'SONG','sos':'SONG','ss':'SONG','canticles':'SONG',
  'isa':'ISA','is':'ISA',
  'jer':'JER','jr':'JER',
  'lam':'LAM','la':'LAM',
  'ezek':'EZEK','eze':'EZEK','ez':'EZEK',
  'dan':'DAN','dn':'DAN',
  'hos':'HOS','ho':'HOS',
  'jl':'JOEL',
  'am':'AMOS',
  'obad':'OBAD','ob':'OBAD',
  'jon':'JONAH','jnh':'JONAH',
  'mic':'MIC','mc':'MIC',
  'nah':'NAH','na':'NAH',
  'hab':'HAB','hb':'HAB',
  'zeph':'ZEPH','zep':'ZEPH','zp':'ZEPH',
  'hag':'HAG','hg':'HAG',
  'zech':'ZECH','zec':'ZECH','zc':'ZECH',
  'mal':'MAL','ml':'MAL',
  'matt':'MAT','mt':'MAT',
  'mk':'MRK','mr':'MRK',
  'lk':'LUK',
  'jn':'JHN','joh':'JHN',
  'act':'ACTS','ac':'ACTS',
  'rom':'ROM','ro':'ROM','rm':'ROM',
  '1 cor':'1COR','1cor':'1COR','1co':'1COR',
  '2 cor':'2COR','2cor':'2COR','2co':'2COR',
  'gal':'GAL','ga':'GAL',
  'eph':'EPH','ep':'EPH',
  'php':'PHIL','phi':'PHIL','phil':'PHIL','philip':'PHIL',
  'col':'COL',
  '1 thess':'1THESS','1thess':'1THESS','1th':'1THESS','1 th':'1THESS',
  '2 thess':'2THESS','2thess':'2THESS','2th':'2THESS','2 th':'2THESS',
  '1 tim':'1TIM','1tim':'1TIM','1ti':'1TIM',
  '2 tim':'2TIM','2tim':'2TIM','2ti':'2TIM',
  'tit':'TIT',
  'philem':'PHLM','phm':'PHLM','phlm':'PHLM',
  'heb':'HEB',
  'jas':'JAS','jm':'JAS','jam':'JAS',
  '1 pet':'1PET','1pet':'1PET','1pe':'1PET','1 pt':'1PET',
  '2 pet':'2PET','2pet':'2PET','2pe':'2PET','2 pt':'2PET',
  '1john':'1JHN','1jn':'1JHN','1jo':'1JHN',
  '2john':'2JHN','2jn':'2JHN','2jo':'2JHN',
  '3john':'3JHN','3jn':'3JHN','3jo':'3JHN',
  'jud':'JUDE',
  'rev':'REV','re':'REV','apoc':'REV',
}

const HCF_BOOK_MAP = {
  'GEN':'Genesis','EXO':'Exodus','LEV':'Leviticus','NUM':'Numbers',
  'DEUT':'Deuteronomy','JOS':'Joshua','JOSH':'Joshua','JDG':'Judges',
  'RUT':'Ruth','RUTH':'Ruth','1SA':'1 Samuel','1SAM':'1 Samuel',
  '2SA':'2 Samuel','2SAM':'2 Samuel','1KI':'1 Kings','1KGS':'1 Kings',
  '2KI':'2 Kings','2KGS':'2 Kings','1CH':'1 Chronicles','1CHR':'1 Chronicles',
  '2CH':'2 Chronicles','2CHR':'2 Chronicles','EZR':'Ezra','EZRA':'Ezra',
  'NEH':'Nehemiah','EST':'Esther','ESTH':'Esther','JOB':'Job',
  'PSA':'Psalms','PS':'Psalms','PRO':'Proverbs','PROV':'Proverbs',
  'ECC':'Ecclesiastes','ECCL':'Ecclesiastes','SNG':'Song of Solomon',
  'SONG':'Song of Solomon','ISA':'Isaiah','JER':'Jeremiah','LAM':'Lamentations',
  'EZK':'Ezekiel','EZEK':'Ezekiel','DAN':'Daniel','HOS':'Hosea',
  'JOL':'Joel','JOEL':'Joel','AMO':'Amos','AMOS':'Amos','OBA':'Obadiah',
  'OBAD':'Obadiah','JON':'Jonah','JONAH':'Jonah','MIC':'Micah','NAH':'Nahum',
  'HAB':'Habakkuk','ZEP':'Zephaniah','ZEPH':'Zephaniah','HAG':'Haggai',
  'ZEC':'Zechariah','ZECH':'Zechariah','MAL':'Malachi','MAT':'Matthew',
  'MRK':'Mark','LUK':'Luke','JHN':'John','ACT':'Acts','ACTS':'Acts',
  'ROM':'Romans','1CO':'1 Corinthians','1COR':'1 Corinthians',
  '2CO':'2 Corinthians','2COR':'2 Corinthians','GAL':'Galatians',
  'EPH':'Ephesians','PHP':'Philippians','PHIL':'Philippians','COL':'Colossians',
  '1TH':'1 Thessalonians','1THESS':'1 Thessalonians',
  '2TH':'2 Thessalonians','2THESS':'2 Thessalonians',
  '1TI':'1 Timothy','1TIM':'1 Timothy','2TI':'2 Timothy','2TIM':'2 Timothy',
  'TIT':'Titus','PHM':'Philemon','PHLM':'Philemon','HEB':'Hebrews',
  'JAS':'James','1PE':'1 Peter','1PET':'1 Peter','2PE':'2 Peter',
  '2PET':'2 Peter','1JN':'1 John','1JHN':'1 John','2JN':'2 John',
  '2JHN':'2 John','3JN':'3 John','3JHN':'3 John','JUD':'Jude',
  'JUDE':'Jude','REV':'Revelation'
}

const XREF_BOOK_MAP = {
  'GEN':'GEN','EXO':'EXO','LEV':'LEV','NUM':'NUM','DEU':'DEU',
  'DEUT':'DEU','JOS':'JOS','JOSH':'JOS','JDG':'JDG','JUDG':'JDG',
  'RUT':'RUT','RUTH':'RUT','1SA':'1SA','1SAM':'1SA','2SA':'2SA',
  '2SAM':'2SA','1KI':'1KI','1KGS':'1KI','2KI':'2KI','2KGS':'2KI',
  '1CH':'1CH','1CHR':'1CH','2CH':'2CH','2CHR':'2CH','EZR':'EZR',
  'EZRA':'EZR','NEH':'NEH','EST':'EST','ESTH':'EST','JOB':'JOB',
  'PSA':'PSA','PS':'PSA','PRO':'PRO','PROV':'PRO','ECC':'ECC',
  'ECCL':'ECC','SNG':'SNG','SONG':'SNG','ISA':'ISA','JER':'JER',
  'LAM':'LAM','EZK':'EZK','EZEK':'EZK','DAN':'DAN','HOS':'HOS',
  'JOL':'JOL','JOEL':'JOL','AMO':'AMO','AMOS':'AMO','OBA':'OBA',
  'OBAD':'OBA','JON':'JON','JONAH':'JON','MIC':'MIC','NAH':'NAH',
  'HAB':'HAB','ZEP':'ZEP','ZEPH':'ZEP','HAG':'HAG','ZEC':'ZEC',
  'ZECH':'ZEC','MAL':'MAL','MAT':'MAT','MRK':'MRK','LUK':'LUK',
  'JHN':'JHN','ACT':'ACT','ACTS':'ACT','ROM':'ROM','1CO':'1CO',
  '1COR':'1CO','2CO':'2CO','2COR':'2CO','GAL':'GAL','EPH':'EPH',
  'PHP':'PHP','PHIL':'PHP','COL':'COL','1TH':'1TH','1THESS':'1TH',
  '2TH':'2TH','2THESS':'2TH','1TI':'1TI','1TIM':'1TI','2TI':'2TI',
  '2TIM':'2TI','TIT':'TIT','PHM':'PHM','PHLM':'PHM','HEB':'HEB',
  'JAS':'JAS','1PE':'1PE','1PET':'1PE','2PE':'2PE','2PET':'2PE',
  '1JN':'1JN','1JHN':'1JN','2JN':'2JN','2JHN':'2JN','3JN':'3JN',
  '3JHN':'3JN','JUD':'JUD','JUDE':'JUD','REV':'REV'
}

const BOOK_NAMES = {
  'GEN':'Genesis','EXO':'Exodus','LEV':'Leviticus','NUM':'Numbers',
  'DEU':'Deuteronomy','JOS':'Joshua','JDG':'Judges','RUT':'Ruth',
  '1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings',
  '1CH':'1 Chronicles','2CH':'2 Chronicles','EZR':'Ezra','NEH':'Nehemiah',
  'EST':'Esther','JOB':'Job','PSA':'Psalms','PRO':'Proverbs',
  'ECC':'Ecclesiastes','SNG':'Song of Solomon','ISA':'Isaiah',
  'JER':'Jeremiah','LAM':'Lamentations','EZK':'Ezekiel','DAN':'Daniel',
  'HOS':'Hosea','JOL':'Joel','AMO':'Amos','OBA':'Obadiah','JON':'Jonah',
  'MIC':'Micah','NAH':'Nahum','HAB':'Habakkuk','ZEP':'Zephaniah',
  'HAG':'Haggai','ZEC':'Zechariah','MAL':'Malachi','MAT':'Matthew',
  'MRK':'Mark','LUK':'Luke','JHN':'John','ACT':'Acts','ROM':'Romans',
  '1CO':'1 Corinthians','2CO':'2 Corinthians','GAL':'Galatians',
  'EPH':'Ephesians','PHP':'Philippians','COL':'Colossians',
  '1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy',
  '2TI':'2 Timothy','TIT':'Titus','PHM':'Philemon','HEB':'Hebrews',
  'JAS':'James','1PE':'1 Peter','2PE':'2 Peter','1JN':'1 John',
  '2JN':'2 John','3JN':'3 John','JUD':'Jude','REV':'Revelation'
}

// NEW: reverse lookup + parser, needed to ground Over the Hill in a real
// second hop rather than AI invention. fetchCrossRefs() already returns
// formatted display strings like "Leviticus 9:22-23 (5 votes)" -- this
// parses one of those back into {bookId, chapter, verse} so it can be
// fetched again, one hop further out.
const NAME_TO_BOOK_ID = Object.fromEntries(Object.entries(BOOK_NAMES).map(([id, name]) => [name, id]))

function parseCrossRefString(str) {
  // "Leviticus 9:22-23 (5 votes)" or "Leviticus 9:22 (5 votes)"
  const m = str.match(/^(.+?)\s+(\d+):(\d+)(?:-\d+)?\s+\(/)
  if (!m) return null
  const bookId = NAME_TO_BOOK_ID[m[1].trim()]
  if (!bookId) return null
  return { bookId, chapter: parseInt(m[2]), verse: parseInt(m[3]) }
}


const WESLEY_BOOK_MAP = {
  'GEN':'GEN','EXO':'EXO','LEV':'LEV','NUM':'NUM','DEUT':'DEU',
  'JOSH':'JOS','JUDG':'JDG','RUTH':'RUT','1SAM':'1SA','2SAM':'2SA',
  '1KGS':'1KI','2KGS':'2KI','1CHR':'1CH','2CHR':'2CH','EZRA':'EZR',
  'NEH':'NEH','ESTH':'EST','JOB':'JOB','PS':'PSA','PROV':'PRO',
  'ECCL':'ECC','SONG':'SNG','ISA':'ISA','JER':'JER','LAM':'LAM',
  'EZEK':'EZK','DAN':'DAN','HOS':'HOS','JOEL':'JOL','AMOS':'AMO',
  'OBAD':'OBA','JONAH':'JON','MIC':'MIC','NAH':'NAH','HAB':'HAB',
  'ZEPH':'ZEP','HAG':'HAG','ZECH':'ZEC','MAL':'MAL',
  'MAT':'MAT','MRK':'MRK','LUK':'LUK','JHN':'JHN','ACTS':'ACT',
  'ROM':'ROM','1COR':'1CO','2COR':'2CO','GAL':'GAL','EPH':'EPH',
  'PHIL':'PHP','COL':'COL','1THESS':'1TH','2THESS':'2TH',
  '1TIM':'1TI','2TIM':'2TI','TIT':'TIT','PHLM':'PHM','HEB':'HEB',
  'JAS':'JAS','1PET':'1PE','2PET':'2PE','1JHN':'1JN','2JHN':'2JN',
  '3JHN':'3JN','JUDE':'JUD','REV':'REV'
}

const OT_BOOKS = new Set([
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
  'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO',
  'OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL'
])

const STUDY_SECONDARY = {
  passage: 'JFB', book: 'JFB',
  word: 'Clarke', character: 'Barnes', topical: null, devotional: null
}

const CHURCH_FATHERS = [
  { name: 'Augustine of Hippo', label: 'Augustine of Hippo (354-430 AD)' },
  { name: 'John Chrysostom',    label: 'John Chrysostom (347-407 AD)' },
  { name: 'Thomas Aquinas',     label: 'Thomas Aquinas (1225-1274 AD)' },
  { name: 'Jerome',             label: 'Jerome (347-420 AD)' },
  { name: 'Cyril of Alexandria',label: 'Cyril of Alexandria (376-444 AD)' },
  { name: 'Bonaventure',        label: 'Bonaventure (1221-1274 AD)' },
  { name: 'Tertullian',         label: 'Tertullian (155-220 AD)' },
  { name: 'Ephrem the Syrian',  label: 'Ephrem the Syrian (306-373 AD)' },
]

const GITHUB_BASE = 'https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/data'
// v38: characters (with the corrected Easton bios) come from the library, not data/.
// v42: Matthew Henry is read from the repaired, gated library copy (library/commentary/MHC), not from the original in data/.
const LIBRARY_COMMENTARY_BASE = 'https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/library/commentary'
const CHARACTERS_URL = 'https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/library/people/characters.json'
const BIO_CAP = 3000

// v38: bios over BIO_CAP characters are cut at the last sentence end before the cap and marked as an excerpt,
// so the model never takes the cut text for the whole entry. Bios at or under the cap are returned unchanged.
function capBio(bio) {
  if (!bio || bio.length <= BIO_CAP) return bio
  const head = bio.slice(0, BIO_CAP)
  const ends = [head.lastIndexOf('. '), head.lastIndexOf('.) '), head.lastIndexOf('."')]
  const cut = Math.max(...ends)
  const kept = (cut > BIO_CAP * 0.5 ? head.slice(0, cut + 1) : head).trim()
  return `${kept}\n[Excerpt: the first ${kept.length} of ${bio.length} characters of Easton's entry. The entry continues beyond this point; do not treat this as the whole entry.]`
}

const MHC_BOOKS = new Set([
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
  'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO',
  'OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM',
  '1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH',
  '1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE',
  '1JN','2JN','3JN','JUD','REV'
])
// NOTE: expanded to all 66 books tonight — was previously the original 39.

const SCOFIELD_BOOKS = new Set([
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT',
  '1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH',
  'EST','JOB','PSA','PRO','ECC','SNG','ISA','JER',
  'LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON',
  'MIC','NAH','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM',
  '1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH',
  '1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE',
  '1JN','2JN','JUD','REV'
])
// KNOWN GAP flagged tonight, not yet fixed: missing 3 John.

const TDAVID_BOOKS = new Set(['PSA'])

// v24 NEW SOURCE: Tyndale Open Study Notes. Full 66-book coverage,
// converted from lyteword-adjacent public-domain-books repo (real
// per-verse content, not a stub). NOT public domain -- CC BY-SA 4.0,
// see fetchTyndale()'s own comment and buildHonestSourcesFooter() for
// the separate attribution section this requires.
const TYNDALE_BOOKS = MHC_BOOKS

// ── Pronunciation parser ──────────────────────────────────────────
function parseStrongsEntry(entry) {
  if (!entry) return null
  const tokens = entry.split(/\s+/)
  let pron = null, trans = null, pronIdx = -1
  const pronPattern = /^[a-z][a-z'\-]+[a-z']+$/

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[{}]/g, '')
    if (pronPattern.test(tok) && tok.length >= 4 && (tok.includes('-') || tok.includes("'"))) {
      pron = tok
      pronIdx = i
      break
    }
  }

  if (pronIdx >= 0) {
    for (let j = pronIdx - 1; j >= 0; j--) {
      const tok = tokens[j]
      if (/^[A-Z\/()=*0-9]+$/.test(tok)) continue
      const asciiOnly = tok.replace(/[^\x00-\x7F]/g, '')
      if (asciiOnly.replace(/[^a-zA-Z]/g, '').length >= 3) {
        const display = tok.replace(/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/g, '')
        if (display.length >= 2) { trans = display; break }
      }
      if ([...tok].some(c => c.codePointAt(0) > 0x024F)) continue
    }
  }

  if (!trans || !pron) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const t1 = tokens[i].replace(/[{}]/g, '')
      const t2raw = tokens[i + 1].replace(/[{}]/g, '')
      const t2ascii = t2raw.replace(/[^\x00-\x7F]/g, '')
      if (/^[a-z][a-z']*$/i.test(t2ascii) && t2ascii.length >= 2) {
        const nextTok = tokens[i + 2]
        if (nextTok && (/^[A-Z(]/.test(nextTok) || nextTok === ';' || nextTok === ',')) {
          const t1Letters = t1.replace(/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/g, '')
          if (t1Letters.length >= 2) {
            trans = t1.replace(/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/g, '')
            pron = t2raw
            break
          }
        }
      }
    }
  }

  const semiIdx = entry.indexOf(';')
  let brief = ''
  if (semiIdx >= 0) {
    brief = entry.slice(semiIdx + 1, semiIdx + 100).trim()
    brief = brief.replace(/\{[^}]+\}/g, '').split(';')[0].trim().replace(/,$/, '').trim()
  }

  return trans && pron ? { trans, pron, brief: brief.slice(0, 70) } : null
}

function parsePassage(str) {
  if (!str) return null
  // FIX (found via real testing): capture an optional range end after the
  // verse number. Before this, "Numbers 6:22-27" silently became verse 22
  // only, losing the actual substantive verses (24-26) -- confirmed live
  // tonight: verse 22 alone returned a throwaway narrative clause and zero
  // cross-references, while verse 24 has real content and real cross-refs.
  const match = str.match(/^([1-3]?\s*[a-zA-Z\s]+?)\s*(\d+)(?:[:.](\d+)(?:-(\d+))?)?/i)
  if (match) {
    const bookId = BOOK_MAP[match[1].trim().toLowerCase()]
    const chapter = parseInt(match[2])
    const verse = match[3] ? parseInt(match[3]) : null
    const verseEnd = match[4] ? parseInt(match[4]) : null
    if (bookId && chapter) return { bookId, chapter, verse, verseEnd }
  }
  const bareBook = str.trim().toLowerCase().replace(/^(the\s+)?book\s+of\s+/i, '').trim()
  const bookId = BOOK_MAP[bareBook]
  if (bookId) return { bookId, chapter: 1, verse: null, verseEnd: null }
  return null
}

const _cache = {}

async function fetchJSON(url) {
  if (_cache[url]) return _cache[url]
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    _cache[url] = data
    return data
  } catch { return null }
}

// ── CANONICAL BOOK-CODE TRANSLATION ─────────────────────────────────
// v20: fixes a confirmed, currently-live bug affecting 37 of 66 books
// across MHC, Scofield, and JFB. Root cause: parsePassage()/BOOK_MAP
// produces a LONG-FORM "runtime" code (DEUT, ACTS, EZEK, 1SAM, PHIL,
// 1COR, etc.) for most books, but the REAL per-book files on GitHub are
// named with SHORT-FORM codes (DEU, ACT, EZK, 1SA, PHP, 1CO...) --
// confirmed by directly checking live files: MHC/DEU.json = 200,
// MHC/DEUT.json = 404. Same for Scofield and JFB. fetchMHC()/
// fetchScofield() gate on a Set of short codes checked against the raw
// long-form bookId, so the check silently fails and the real file is
// never even requested; fetchJFB() has no gate at all and just 404s.
//
// THE FIX, and the standing rule going forward: exactly ONE canonical
// translation table exists for "runtime code -> real on-disk short
// code," and it lives here. XREF_BOOK_MAP already contained this exact
// mapping (built earlier for cross-reference file lookups, and already
// proven correct in production) -- reused here under a clearer general
// -purpose name rather than inventing a second, parallel map that could
// drift out of sync with it over time. toShortCode() is the ONLY place
// this translation should ever happen. fetchPerBookFile() applies it
// internally and unconditionally, so ANY current or future per-book
// source (MHC, Scofield, JFB, TDavid, Wesley, Calvin, and anything
// added later) gets correct translation automatically just by going
// through fetchPerBookFile() -- a new source's fetch function does NOT
// need to remember to alias anything itself. This is the structural
// answer to "multiple forms, codes, updates, never seem to have
// complete and consistent principles applied": there is now exactly
// one table, one function, one place it's applied, used everywhere a
// per-book file is fetched.
//
// KNOWN, DELIBERATE EXCEPTION -- the array-format legacy sources
// (Barnes, Clarke, Vincent, Meyer, still on fetchFromJsonFile()): their
// internal 'book' field is CONFIRMED INCONSISTENT even within a single
// file (checked live this session -- Barnes and Clarke both store
// Deuteronomy as 'DEUT', long-form, but Acts as 'ACT', short-form, in
// the very same array). Blindly applying toShortCode() there would fix
// Acts but BREAK Deuteronomy. JSON_ARRAY_BOOK_ALIASES below is kept
// deliberately separate and minimal for exactly this reason -- see its
// own comment. The real fix for those sources is finishing their
// migration to per-book format (matching everything else), not further
// patching an internally inconsistent legacy table.
const RUNTIME_TO_SHORT_CODE = XREF_BOOK_MAP

function toShortCode(bookId) {
  return RUNTIME_TO_SHORT_CODE[bookId] || bookId
}

// ── VERSE-ANCHORED EXTRACTION ────────────────────────────────────────
// Fixes a confirmed, severe, universal bug: every commentary fetch was
// taking the first N characters of a chapter's ENTIRE commentary text,
// regardless of which specific verse was being studied. Confirmed live
// this session across multiple real chapters (not an edge case):
//   - Psalm 119 (176 verses): 2000-char cap covers under 1% of the text
//   - Matthew 21: the fig-tree miracle (v.19) sits at 38.3% through the
//     chapter -- the old cap covered 1.6%. The AI was receiving the
//     chapter's general introduction ("The death and resurrection of
//     Jesus Christ are the two main hinges...") and confidently writing
//     a devotional/study around THAT, dressed up to sound relevant to
//     the actual passage. Confirmed live: this produces smoothly
//     readable, plausible-sounding output that is NOT actually grounded
//     in commentary on the requested verse -- a worse failure mode than
//     an obviously wrong one, because it isn't visible without checking
//     the source.
//   - Romans 8:28 ("all things work together for good"): sits at 63.5%
//     through the chapter; old cap covered 2.5%.
//
// FIX: these long-form sources embed their own inline verse citations
// in the prose (e.g. "Mt 21:19", "Ro 8:28") -- confirmed live across
// multiple sources/books. An EXACT single-verse citation ("21:19")
// reliably marks real expository content; a RANGE citation ("21:17-22")
// reliably marks a chapter-outline summary line only, confirmed by
// checking the actual position and content of every citation in real
// Matthew 21 data. Excluding range citations cleanly separates outline
// noise from real exposition without any hardcoded skip-the-first-N%
// heuristic.
//
// SAFE BY CONSTRUCTION: when no verse is given, or no matching citation
// is found for the requested verse, this falls back to the exact same
// first-N-characters behavior as before. Wiring `verse` through to a
// source whose citation format hasn't been individually verified can
// only improve or leave unchanged that source's output -- never regress it.
function extractVerseAnchoredText(fullText, chapter, verse, cap) {
  if (!verse) return fullText.slice(0, cap).trim()

  // Exact single-verse citation, NOT followed by a hyphen+digit (which
  // would mean it's part of a range citation like "21:17-22", not a
  // real per-verse anchor).
  const pattern = new RegExp(`\\b(?:[A-Z][a-z]{0,4}\\.?\\s*)?${chapter}:${verse}\\b(?!-\\d)`, 'g')
  const matches = [...fullText.matchAll(pattern)]
  if (matches.length > 0) {
    const pos = matches[0].index
    const start = Math.max(0, fullText.lastIndexOf('\n\n', pos))
    return fullText.slice(start, start + cap).trim()
  }

  // Fallback: a range citation that CONTAINS the requested verse.
  const rangePattern = new RegExp(`\\b(?:[A-Z][a-z]{0,4}\\.?\\s*)?${chapter}:(\\d+)-(\\d+)\\b`, 'g')
  for (const m of fullText.matchAll(rangePattern)) {
    const lo = parseInt(m[1], 10), hi = parseInt(m[2], 10)
    if (verse >= lo && verse <= hi) {
      const pos = m.index
      const start = Math.max(0, fullText.lastIndexOf('\n\n', pos))
      return fullText.slice(start, start + cap).trim()
    }
  }

  // Honest fallback -- no anchor found for this verse in this source.
  // Old behavior, not a silent failure, not a guess.
  return fullText.slice(0, cap).trim()
}

async function fetchPerBookFile(folder, bookId, chapter, cap = 1500, verse = null) {
  const shortId = toShortCode(bookId)
  const data = await fetchJSON(`${GITHUB_BASE}/commentary/${folder}/${shortId}.json`)
  if (!data) return null
  const chData = data.chapters?.find(c => c.chapter === chapter)
  if (!chData?.commentary) return null
  return extractVerseAnchoredText(chData.commentary, chapter, verse, cap) || null
}

// Full verification across all four legacy array files (Barnes, Clarke,
// Vincent, Meyer) DONE this session — confirmed only Deuteronomy is
// long-form in Barnes/Clarke, every other book already short-form,
// Vincent/Meyer have zero inconsistency. This table is complete and
// correct as of that check. Barnes/Clarke are still migrating to
// per-book format independently (in progress) -- that migration
// eliminates the need for this table entirely once done, but until
// then this alias table is known-correct, not a stopgap.
const JSON_ARRAY_BOOK_ALIASES = {
  'JONAH': 'JON',
  'ACTS': 'ACT',
}

async function fetchFromJsonFile(filename, bookId, chapter, cap = 1500, verse = null) {
  const data = await fetchJSON(`${GITHUB_BASE}/commentary/${filename}/${filename}_commentary.json`)
  if (!data || !Array.isArray(data)) return null
  const lookupId = JSON_ARRAY_BOOK_ALIASES[bookId] || bookId
  const bookData = data.find(b => b.book === lookupId)
  if (!bookData) return null
  const chData = bookData.chapters?.find(c => c.chapter === chapter)
  if (!chData?.commentary) return null
  return extractVerseAnchoredText(chData.commentary, chapter, verse, cap) || null
}

async function fetchStrongsEntry(bookId, word) {
  const isOT = OT_BOOKS.has(bookId)
  const dict = isOT ? 'strongs_hebrew' : 'strongs_greek'
  const data = await fetchJSON(`${GITHUB_BASE}/dict/${dict}.json`)
  if (!data) return null
  const numMatch = word.match(/\d+/)
  if (!numMatch) return null
  const entry = data.entries[numMatch[0]]
  if (!entry) return null
  return parseStrongsEntry(entry)
}

function joinWithSuffix(base, suffix) {
  if (base.endsWith('e') && suffix && /^[aeiou]/.test(suffix)) {
    return base.slice(0, -1) + suffix
  }
  return base + suffix
}

function expandStrongsCompounds(entryText) {
  const extra = new Set()
  for (const m of entryText.matchAll(/\((\w+)-\)\s*\{?(\w+)/g)) {
    extra.add(m[1] + m[2])
  }
  for (const m of entryText.matchAll(/(\w+)\(-(\w+)\)/g)) {
    extra.add(joinWithSuffix(m[1], m[2]))
  }
  for (const m of entryText.matchAll(/(\w+)\(((?:\s*\{-\w+\}\s*)+)\)/g)) {
    const base = m[1]
    for (const sufM of m[2].matchAll(/-(\w+)/g)) {
      extra.add(joinWithSuffix(base, sufM[1]))
    }
  }
  for (const m of entryText.matchAll(/(\w+)\s+\{-(\w+)\}(?!\))/g)) {
    extra.add(joinWithSuffix(m[1], m[2]))
  }
  return extra
}

function normalizeStrongsText(text) {
  // FIX: strip diacritics (NFD decompose + drop combining marks) so a
  // plain-ASCII typed transliteration ("agape") matches the stored
  // accented form ("agápē"). Confirmed real gap: the transliteration
  // was genuinely present in every entry's etymology field, but never
  // matchable by anyone typing the word the normal, keyboard way --
  // effectively invisible despite being right there in the data.
  const stripped = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return stripped.replace(/[{}()]/g, ' ').replace(/\s+/g, ' ').toLowerCase()
}

function rankStrongsMatch(term, entryText) {
  const t = term.toLowerCase().trim()
  const sepMatch = entryText.match(/:\s*-+\s*/)
  const kjvRaw = sepMatch ? entryText.slice(sepMatch.index + sepMatch[0].length) : ''
  const head = sepMatch ? entryText.slice(0, sepMatch.index) : entryText

  const kjvPart = normalizeStrongsText(kjvRaw)
  const semiParts = head.split(';')
  const defPart = semiParts.length > 1 ? normalizeStrongsText(semiParts[semiParts.length - 1]) : ''
  const etymPart = semiParts.length > 1
    ? normalizeStrongsText(semiParts.slice(0, -1).join(';'))
    : normalizeStrongsText(head)

  const compounds = expandStrongsCompounds(entryText)
  const pattern = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)

  if (compounds.has(t)) return 100
  if (pattern.test(kjvPart)) return 100
  if (pattern.test(defPart)) return 60
  if (pattern.test(etymPart)) return 20
  return null
}

async function searchStrongsByGloss(term, limit = 5) {
  const [hebData, grkData] = await Promise.all([
    fetchJSON(`${GITHUB_BASE}/dict/strongs_hebrew.json`),
    fetchJSON(`${GITHUB_BASE}/dict/strongs_greek.json`)
  ])

  const hebResults = []
  if (hebData) {
    for (const [num, entry] of Object.entries(hebData.entries)) {
      const score = rankStrongsMatch(term, entry)
      if (score !== null) {
        const parsed = parseStrongsEntry(entry)
        hebResults.push({ score, testament: 'Hebrew', num: `H${num}`, entry, parsed })
      }
    }
  }
  const grkResults = []
  if (grkData) {
    for (const [num, entry] of Object.entries(grkData.entries)) {
      const score = rankStrongsMatch(term, entry)
      if (score !== null) {
        const parsed = parseStrongsEntry(entry)
        grkResults.push({ score, testament: 'Greek', num: `G${num}`, entry, parsed })
      }
    }
  }
  hebResults.sort((a, b) => b.score - a.score)
  grkResults.sort((a, b) => b.score - a.score)

  if (limit <= 1) {
    // Preserve existing single-best-overall-match behavior for callers
    // like fetchStrongsForWord that expect exactly one true top result.
    return [...hebResults, ...grkResults].sort((a, b) => b.score - a.score).slice(0, limit)
  }

  // FIX: guarantee real representation from BOTH testaments for the
  // pick-list case, rather than a blind global top-N cutoff. Confirmed
  // real bug: searching "love" had 12 Hebrew matches tied at the top
  // score, ahead of G25/G26 (agápē/agapáō) purely by insertion order --
  // both Greek words scored an equal, genuine 100 but were silently
  // excluded from a limit=10 result. Split the requested limit roughly
  // evenly between testaments, with backfill from whichever side has
  // more real matches if the other comes up short.
  let hebShare = Math.ceil(limit / 2)
  let grkShare = limit - hebShare
  if (hebResults.length < hebShare) {
    grkShare += (hebShare - hebResults.length)
    hebShare = hebResults.length
  }
  if (grkResults.length < grkShare) {
    hebShare = Math.min(hebResults.length, hebShare + (grkShare - grkResults.length))
    grkShare = grkResults.length
  }

  const combined = [...hebResults.slice(0, hebShare), ...grkResults.slice(0, grkShare)]
  combined.sort((a, b) => b.score - a.score)
  return combined.slice(0, limit)
}

async function fetchStrongsForWord(subject, bookId) {
  const results = await searchStrongsByGloss(subject, 1)
  if (!results.length) return null
  const top = results[0]
  if (!top.parsed) return null
  return { num: top.num.replace(/^[HG]/, ''), ...top.parsed }
}

// NEW: real concordance lookup -- given a specific Strong's number (e.g.
// "G5485"), returns every real verse it occurs in, sorted in canonical
// Bible order. Built tonight from CrossWire's original Strong's-tagged
// KJV OSIS data (the underlying source verified correct after finding
// and fixing a real bug in an earlier third-party conversion of it --
// see the guide for the full trail). This is the piece that lets a
// SPECIFIC chosen word anchor to ITS OWN passage, rather than falling
// back to whatever the original typed search text happened to resolve to.
const CANONICAL_BOOK_ORDER = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
  'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO',
  'OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS',
  '1PE','2PE','1JN','2JN','3JN','JUD','REV'
]
const CANONICAL_BOOK_INDEX = Object.fromEntries(CANONICAL_BOOK_ORDER.map((b, i) => [b, i]))

async function fetchWordOccurrences(strongsNum) {
  const data = await fetchJSON(`${GITHUB_BASE}/dict/strongs_concordance.json`)
  if (!data) return null
  const entries = data[strongsNum]
  if (!entries || !entries.length) return null
  const sorted = [...entries].sort((a, b) => {
    const bookDiff = (CANONICAL_BOOK_INDEX[a.book] ?? 999) - (CANONICAL_BOOK_INDEX[b.book] ?? 999)
    if (bookDiff !== 0) return bookDiff
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.verse - b.verse
  })
  return sorted
}

// v27: Matthew Henry is now read by SECTION, not by regex over the chapter
// string. Henry's chapter text interleaves a short heading, a scripture
// paragraph whose verses carry superscript numbers, and his exposition.
// The old extractor treated the chapter-outline citation "Mt 22:15-22" as
// the anchor for 22:15 and returned the chapter's first 2,000 characters
// (overview + marriage-feast parable) as if it were the tribute-question
// commentary. Verified against all 1,189 chapters: every chapter has the
// structure; sections cover 31,102/31,102 verses. A verse with no section
// returns null (honest), never the start of the chapter.
// Matthew Henry chapter text -> sections. Henry's files interleave: a short
// heading paragraph, a scripture paragraph whose verses carry superscript
// numbers, then his exposition paragraphs. Index by those verse numbers.
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SUPMAP = { '⁰':0,'¹':1,'²':2,'³':3,'⁴':4,'⁵':5,'⁶':6,'⁷':7,'⁸':8,'⁹':9 }
const SUP_RUN = new RegExp(`[${SUP}]+`, 'g')
const STARTS_SUP = new RegExp(`^\\s*[${SUP}]`)
const supToInt = s => parseInt([...s].map(c => SUPMAP[c]).join(''), 10)

function parseSections(text) {
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const sections = []
  let cur = null
  let intro = []
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i]
    if (STARTS_SUP.test(p)) {
      const nums = [...p.matchAll(SUP_RUN)].map(m => supToInt(m[0])).filter(n => n > 0 && n < 200)
      if (cur && cur.body.length === 0 && nums.length) {
        // consecutive scripture paragraphs: same section
        cur.verses.push(...nums); continue
      }
      // heading = previous paragraph if short and unpunctuated, and not already used
      let heading = ''
      const prev = paras[i - 1]
      if (prev && prev.length < 140 && !/[.;:]$/.test(prev) && !STARTS_SUP.test(prev)) {
        heading = prev
        // remove the heading from the previous section's body
        if (cur && cur.body.length && cur.body[cur.body.length - 1] === prev) cur.body.pop()
        else if (!cur && intro.length && intro[intro.length - 1] === prev) intro.pop()
      }
      cur = { heading, verses: nums, body: [] }
      sections.push(cur)
    } else if (cur) cur.body.push(p)
    else intro.push(p)
  }
  for (const s of sections) { s.lo = Math.min(...s.verses); s.hi = Math.max(...s.verses); s.text = s.body.join('\n\n') }
  return { intro: intro.join('\n\n'), sections }
}

// Returns { text, how } -- how in 'section' | 'section+anchor' | 'overview' | null.
function mhcExtract(chapterText, chapter, verse, cap = 2000) {
  const { intro, sections } = parseSections(chapterText)
  if (!verse) {
    // Chapter-level request: Henry's overview, then his exposition (no scripture text) in order.
    const body = [intro, ...sections.map(s => (s.heading ? s.heading + '\n\n' : '') + s.text)].filter(Boolean).join('\n\n')
    return { text: (body || chapterText).slice(0, cap).trim(), how: 'overview' }
  }
  const sec = sections.find(s => verse >= s.lo && verse <= s.hi)
  if (!sec || !sec.text) return { text: null, how: null }
  const label = `[Henry's section ${sec.heading ? '"' + sec.heading + '" ' : ''}(verses ${sec.lo}-${sec.hi}) -- he comments on this passage as a whole]\n\n`
  const room = cap - label.length
  // narrow to the paragraph that cites this verse, if one does (e.g. "(Mt 22:22)")
  const pat = new RegExp(`\\b(?:[A-Z0-9][A-Za-z]{0,4}\\.?\\s*)?${chapter}:${verse}\\b(?!-\\d)`)
  const ps = sec.body
  const idx = ps.findIndex(p => pat.test(p))
  if (idx >= 0) return { text: label + ps.slice(idx).join('\n\n').slice(0, room).trim(), how: 'section+anchor', sec }
  return { text: label + sec.text.slice(0, room).trim(), how: 'section', sec }
}

async function fetchMHC(bookId, chapter, verse = null) {
  // v20 FIX kept: gate on the SHORT code (see toShortCode()).
  if (!MHC_BOOKS.has(toShortCode(bookId))) return null
  const data = await fetchJSON(`${LIBRARY_COMMENTARY_BASE}/MHC/${toShortCode(bookId)}.json`)
  if (!data) return null
  const chData = data.chapters?.find(c => c.chapter === chapter)
  if (!chData?.commentary) return null
  const r = mhcExtract(chData.commentary, chapter, verse, 2000)
  return r.text || null
}

// v33 change vs v32: a numbered line is only treated as JFB's note on that verse if it is not SUSPECT.
// Two explicit, deterministic rules mark a numbered line suspect (text is never altered):
//   A: it comes before the chapter's first section heading AND a later numbered line claims the same verse
//      (Psalms 1 and Proverbs 1: the book introduction's own numbered outline).
//   B: after A, it breaks the ascending verse order of the chapter (not in the chapter's longest
//      non-decreasing run of numbered lines): a numbering slip or a note filed under the wrong chapter
//      (Hebrews 13 "7. Two manifestations...", Acts 16 "41.").
// Verified in the sandbox against the notes-shape resolver on all 31,102 verses (see v33-sandbox-report.md).
const JFB_NOTE_LINE = /^\s*(\d+)((?:\s*[-–,]\s*\d+)*)\.\s/
function jfbVersesOf(line) {
  const m = JFB_NOTE_LINE.exec(line)
  if (!m) return null
  const nums = [...m[2].matchAll(/([-–,])\s*(\d+)/g)].map(x => ({ sep: x[1], n: +x[2] }))
  const first = +m[1], out = new Set([first])
  let prev = first
  for (const x of nums) {
    if (x.sep === ',') out.add(x.n)
    else for (let v = prev; v <= x.n; v++) out.add(v)
    prev = x.n
  }
  return { first, verses: out, marker: m[0].trim() }
}

// v32: JFB passage sections. Headings like "Ge 1:6-8. Second Day." or "Ge 1:1, 2. The Creation..." mark the
// verses a section covers. A verse with no note of its own gets its whole section, labelled honestly, so the
// note on verse 6 is never presented as a note on verse 7 (Tom's rule, Oct 26). A section that only points
// elsewhere ("For the exposition, see on Mr 12:13-34.") returns nothing for now (pointers: a later step).
const JFB_HEADING = /^([1-3]?\s?[A-Z][a-z]{0,3})\s?(\d+):(\d+)((?:\s*[-–,]\s*\d+)*)\.\s*(.*)$/
function jfbSection(lines, chapter, verse, cap) {
  for (let i = 0; i < lines.length; i++) {
    const h = JFB_HEADING.exec(lines[i])
    if (!h || +h[2] !== chapter) continue
    const covered = jfbVersesOf(h[3] + h[4] + '. ')
    if (!covered || !covered.verses.has(verse)) continue
    const body = []
    for (let j = i + 1; j < lines.length; j++) {
      const n = JFB_HEADING.exec(lines[j])
      if ((n && +n[2] === chapter) || /^CHAPTER\s+\d+/.test(lines[j])) break
      body.push(lines[j])
    }
    const text = body.join('\n').trim()
    if (!text || /^(For the exposition, )?see on\b/i.test(text)) return { text: null, how: 'pointer' }
    const range = (h[3] + h[4]).replace(/\s+/g, '')
    const title = h[5] ? ' ("' + h[5].trim().replace(/\.$/, '') + '")' : ''
    const label = '[JFB comments on verses ' + range + ' together as one passage' + title + '; it has no separate note on verse ' + verse + ']\n'
    return { text: (label + text).slice(0, cap).trim(), how: 'section' }
  }
  return { text: null, how: null }
}

// v33: classify each line of a chapter, then mark suspect numbered lines (rules A and B above).
function jfbNumberedLines(lines, chapter) {
  const out = []   // { i, n (jfbVersesOf result), ok }
  let firstSec = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^CHAPTER\s+\d+/.test(lines[i])) continue
    const h = JFB_HEADING.exec(lines[i])
    if (h && +h[2] === chapter) { if (firstSec < 0) firstSec = i; continue }
    const n = jfbVersesOf(lines[i])
    if (n) out.push({ i, n, ok: true })
  }
  if (firstSec >= 0) {                                  // rule A
    const later = new Set()
    for (const e of out) if (e.i > firstSec) e.n.verses.forEach(v => later.add(v))
    for (const e of out) if (e.i < firstSec && [...e.n.verses].some(v => later.has(v))) e.ok = false
  }
  const rest = out.filter(e => e.ok)                    // rule B: keep the longest non-decreasing run
  const len = new Array(rest.length).fill(1), prev = new Array(rest.length).fill(-1)
  for (let i = 0; i < rest.length; i++) for (let j = 0; j < i; j++) {
    if (rest[j].n.first <= rest[i].n.first && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j }
  }
  let best = -1
  for (let i = 0; i < rest.length; i++) if (best < 0 || len[i] >= len[best]) best = i
  const keep = new Set()
  for (let i = best; i >= 0; i = prev[i]) keep.add(i)
  rest.forEach((e, i) => { if (!keep.has(i)) e.ok = false })
  return out
}

// Returns { text, how } -- how: 'verse' | 'grouped' | 'section' | 'pointer' | null.
function jfbExtract(chapterText, chapter, verse, cap = 2000) {
  const lines = chapterText.split('\n')
  const numbered = jfbNumberedLines(lines, chapter)
  const sizeOne = e => e.n.verses.size === 1
  const exactE = numbered.find(e => e.ok && sizeOne(e) && e.n.verses.has(verse))
  const groupedE = numbered.find(e => e.ok && !sizeOne(e) && e.n.verses.has(verse))
  const startE = exactE || groupedE
  if (!startE) return jfbSection(lines, chapter, verse, cap)
  const out = [lines[startE.i]]
  for (let i = startE.i + 1; i < lines.length; i++) {
    const n = jfbVersesOf(lines[i])
    if (n && n.first > verse) break
    if (/^CHAPTER\s+\d+/.test(lines[i])) break
    const h = JFB_HEADING.exec(lines[i]); if (h && +h[2] === chapter) break
    out.push(lines[i])
  }
  let text = out.join('\n').trim()
  if (!exactE) text = '[JFB comments on these verses together: ' + startE.n.marker.replace(/\.$/, '') + ']\n' + text
  return { text: text.slice(0, cap).trim(), how: exactE ? 'verse' : 'grouped' }
}

async function fetchJFB(bookId, chapter, verse = null) {
  // v19: per-book files at data/commentary/JFB/{BOOKID}.json.
  // v32/v33: a verse request uses jfbExtract() (JFB's own note, its grouped note, or its labelled passage
  // section; otherwise nothing). Chapter-level requests keep the old behaviour.
  if (!verse) return await fetchPerBookFile('JFB', bookId, chapter, 2000, null)
  const data = await fetchJSON(`${GITHUB_BASE}/commentary/JFB/${toShortCode(bookId)}.json`)
  const chData = data?.chapters?.find(c => c.chapter === chapter)
  if (!chData?.commentary) return null
  return jfbExtract(chData.commentary, chapter, verse, 2000).text
}

async function fetchClarke(bookId, chapter, verse = null) {
  return await fetchFromJsonFile('Clarke', bookId, chapter, 2000, verse)
}

// v25: Barnes' Notes NT rebuilt from CCEL's full-text ntnotes (public domain).
// Per-book, verse-keyed files at data/commentary/Barnes_NT/{CODE}.json:
//   { book, name, source, chapters:[{ chapter, verses:{"1":"..."}, preface? }] }
// The old data/commentary/Barnes/Barnes_commentary.json was hard-truncated to
// 2,000 chars per chapter, so for NT books it is NEVER used as a fallback
// (serving the first 2,000 chars for a verse is exactly the confident-wrong
// failure this rebuild fixes). A verse Barnes did not write on, or that is
// missing, returns null. OT books still use the legacy file until a source
// is rebuilt.
const BARNES_NT_BOOKS = new Set([
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL',
  '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'
])

async function fetchBarnes(bookId, chapter, verse = null) {
  const shortId = toShortCode(bookId)
  if (!BARNES_NT_BOOKS.has(shortId)) {
    return await fetchFromJsonFile('Barnes', bookId, chapter, 1500, verse)
  }
  const data = await fetchJSON(`${GITHUB_BASE}/commentary/Barnes_NT/${shortId}.json`)
  if (!data) return null
  const chData = data.chapters?.find(c => c.chapter === chapter)
  if (!chData?.verses) return null

  if (verse) {
    const t = chData.verses[String(verse)]
    return t ? t.slice(0, 2500).trim() : null
  }
  // Chapter-level request (character/book studies): a spread of real verse
  // notes in order, each trimmed, rather than the start of one long note.
  const keys = Object.keys(chData.verses).map(Number).sort((a, b) => a - b)
  let out = ''
  for (const v of keys) {
    const piece = `v.${v}: ${chData.verses[String(v)].slice(0, 350).trim()}\n\n`
    if (out.length + piece.length > 2400) break
    out += piece
  }
  return out.trim() || null
}

async function fetchScofield(bookId, chapter, verse = null) {
  // v20 FIX: same gate-check mismatch as fetchMHC() above -- see
  // toShortCode()'s comment for the full explanation.
  if (!SCOFIELD_BOOKS.has(toShortCode(bookId))) return null
  // v32: Scofield's notes are keyed to words and phrases, not verse numbers, so a verse request has no
  // reliable anchor: return nothing rather than the chapter's opening. Chapter-level requests unchanged.
  if (verse) return null
  return await fetchPerBookFile('Scofield', bookId, chapter, 1500, null)
}

async function fetchSpurgeon(bookId, chapter, verse = null) {
  // v22 FIX: TDavid/PSA.json rebuilt with REAL per-verse Exposition
  // content -- the file this used to read only ever contained Spurgeon's
  // introductory OVERVIEW essay per Psalm (~1,800-2,000 chars, regardless
  // of the Psalm's real length), never the verse-by-verse exposition that
  // is the actual bulk of Treasury of David. Confirmed live: every Psalm
  // record was suspiciously capped around 2,000 chars whether the Psalm
  // had 6 verses or 176 (Psalm 119) -- the exposition was simply never
  // captured when that file was originally built. No anchoring fix could
  // ever have found content that was never fetched in the first place.
  //
  // Rebuilt from lyteword/chspurgeon-tod (CC0 1.0 Universal), a complete
  // markdown edition of the real 7-volume work, verified against the
  // original test cases: Psalm 23:1 now returns genuine Spurgeon prose
  // (confirmed matching independently against biblestudytools.com's
  // Treasury of David pages), and Psalm 119:105 -- the exact "176-verse
  // chapter, deep in" case that first exposed the truncation bug back in
  // MHC -- now returns real content about lamps and paths, not the
  // Psalm's general overview. Psalm 119 itself required special handling:
  // Treasury of David treats it as 22 separate acrostic sections (matching
  // its Hebrew-alphabet structure in the real printed work) rather than
  // one continuous chapter; the rebuild script merges all 22 sections
  // back into one chapter=119 entry so callers don't need to know this.
  //
  // Same lesson as the Wesley fix: when the source data is already
  // organized by real verse number, no citation-regex anchoring is
  // needed at all -- this reads the verse key directly.
  if (!TDAVID_BOOKS.has(toShortCode(bookId))) return null
  const data = await fetchJSON(`${GITHUB_BASE}/commentary/TDavid/PSA.json`)
  if (!data) return null
  const chData = data.chapters?.find(c => c.chapter === chapter)
  if (!chData) return null

  if (verse && chData.verses && chData.verses[String(verse)]) {
    return chData.verses[String(verse)].slice(0, 2000).trim()
  }

  // Honest fallback -- no per-verse content for this exact verse (a real
  // but small minority, ~3% of verses, where Spurgeon's exposition
  // grouped several verses together rather than treating each alone), or
  // no verse requested at all (e.g. Book Overview studies): serve the
  // real chapter overview, not a guess.
  return (chData.overview || '').slice(0, 2000).trim() || null
}

async function fetchTyndale(bookId, chapter, verse = null) {
  // v24 NEW SOURCE. Tyndale Open Study Notes -- real per-verse content,
  // converted directly to a verse-keyed shape (data/commentary/Tyndale/
  // {CODE}.json), same lesson as Wesley and Spurgeon: no citation-regex
  // anchoring needed when the source data is already organized by verse.
  //
  // HONEST GAP, not a bug: Tyndale's notes are curated highlights, not
  // full verse-by-verse exposition like MHC -- roughly half of all Bible
  // verses (about 15,200 of ~31,100) have no Tyndale note at all.
  // Confirmed live on Romans 8:28 specifically: Tyndale comments on
  // 8:22, 23, 26, 30, 31, 32 in that chapter but not 27, 28, or 29 -- a
  // real content gap in the source itself, not a lookup failure. This
  // function returns null rather than guessing at a nearby verse's note
  // or the chapter's general theme -- an honest null when Tyndale simply
  // didn't comment on this verse, consistent with every other source
  // here.
  //
  // LICENSE: CC BY-SA 4.0, NOT public domain like every other source in
  // this file. Requires attribution and share-alike. See
  // buildHonestSourcesFooter() -- this source gets its own labeled
  // section, never folded into "Protestant Commentaries (Public Domain)".
  if (!TYNDALE_BOOKS.has(toShortCode(bookId))) return null
  const shortId = toShortCode(bookId)
  const data = await fetchJSON(`${GITHUB_BASE}/commentary/Tyndale/${shortId}.json`)
  if (!data) return null
  const chData = data.chapters?.find(c => c.chapter === chapter)
  if (!chData) return null

  if (verse && chData.verses && chData.verses[String(verse)]) {
    return chData.verses[String(verse)].slice(0, 2000).trim()
  }
  return null
}

async function fetchCalvin(bookId, chapter, verse = null) {
  // RE-ENABLED in v20. The old Calvin_commentary.json array (confirmed
  // August 2026 to contain Scripture text/footnotes, not real commentary
  // prose, across all 66 claimed books) has been replaced entirely.
  // New source: per-book files at data/commentary/Calvin/{SHORT}.json,
  // rebuilt from bible.helloao.org's john-calvin dataset (CrossWire
  // SWORD module, sourced from CCEL, public domain). Spot-verified live
  // against the real page text this session -- genuine theological
  // exposition, not scripture dump.
  //
  // 48 books present. Confirmed real, permanent gaps (not bugs, not
  // worth chasing further):
  //   - 2 John, 3 John: Calvin never wrote these (confirmed via his
  //     published bibliography) -- no file exists for them, correctly
  //     returns null via fetchJSON's own 404 handling below.
  //   - Ezekiel, chapters 21-48: Calvin died mid-lecture at the end of
  //     chapter 20 -- genuinely unfinished, confirmed against real
  //     historical sourcing. CAL/EZK.json only has chapters 1-20.
  //   - Jeremiah 52: missing from two independent sources; not yet
  //     resolved as bug vs. genuine gap (Jer. 52 is a historical
  //     appendix largely duplicated from 2 Kings 24-25, possibly never
  //     given detailed verse commentary). Flagged for follow-up, not
  //     blocking -- fetchPerBookFile() returning null here is an honest
  //     "no data," not a wrong answer.
  // Uses fetchPerBookFile(), which applies toShortCode() automatically
  // -- no bespoke aliasing needed here, unlike the pre-v20 pattern.
  return await fetchPerBookFile('Calvin', bookId, chapter, 2000, verse)
}

async function fetchVincent(bookId, chapter, verse = null) {
  return await fetchFromJsonFile('Vincent', bookId, chapter, 1500, verse)
}

async function fetchMeyer(bookId, chapter, verse = null) {
  return await fetchFromJsonFile('Meyer', bookId, chapter, 1500, verse)
}

function resolveNavesTopic(index, query) {
  const q = query.toLowerCase().trim()
  if (index[q] !== undefined) return q
  const keys = Object.keys(index)
  const wordBoundary = keys.filter(k => k.startsWith(q + ' '))
  if (wordBoundary.length) return wordBoundary.reduce((a, b) => a.length <= b.length ? a : b)
  const prefix = keys.filter(k => k.startsWith(q) || q.startsWith(k))
  if (prefix.length) return prefix.reduce((a, b) => a.length <= b.length ? a : b)
  // REMOVED tonight: a 4th fallback here used to do raw substring matching
  // (query.includes(key) with no word boundary) -- confirmed to produce
  // real false positives twice: "numbers" matched "er" (numb-ER-s) and
  // "shine" matched "hin" (s-HIN-e), both sending real user input to
  // completely unrelated passages with no visible sign anything was
  // wrong. Same "confident wrong answer is worse than an honest null"
  // principle already applied to character matching earlier -- an
  // unmatched topic returning null is honest; a topic silently matched
  // via an accidental substring is not.
  return null
}

async function fetchNaves(topic) {
  const data = await fetchJSON(`${GITHUB_BASE}/dict/naves/naves_topics.json`)
  if (!data || !data.index) return null
  const key = resolveNavesTopic(data.index, topic)
  if (key === null) return null
  const idx = data.index[key]
  const entry = data.topics[idx]
  if (!entry) return null
  const lines = [`Nave's Topical Bible — "${entry.topic}"`]
  for (const line of (entry.entries || []).slice(0, 5)) {
    lines.push(line.slice(0, 300))
  }
  return lines.join('\n').slice(0, 1500)
}

function extractFirstReference(entryText) {
  const m = entryText.match(/\b([1-3]?[A-Z]{2,5})\s+(\d+):(\d+)/)
  if (!m) return null
  const bookId = XREF_BOOK_MAP[m[1]] || (BOOK_MAP[m[1].toLowerCase()] ? m[1] : null)
  const resolvedBook = XREF_BOOK_MAP[m[1]] || m[1]
  if (!BOOK_NAMES[resolvedBook]) return null
  return { bookId: resolvedBook, chapter: parseInt(m[2]), verse: parseInt(m[3]) }
}

async function fetchNavesAnchor(topic) {
  const data = await fetchJSON(`${GITHUB_BASE}/dict/naves/naves_topics.json`)
  if (!data || !data.index) return null
  const key = resolveNavesTopic(data.index, topic)
  if (key === null) return null
  const idx = data.index[key]
  const entry = data.topics[idx]
  if (!entry || !entry.entries || !entry.entries.length) return null
  for (const line of entry.entries) {
    const ref = extractFirstReference(line)
    if (ref) return ref
  }
  return null
}

function levenshteinSimilarity(a, b) {
  a = a.toLowerCase()
  b = b.toLowerCase()
  if (a.length < b.length) { [a, b] = [b, a] }
  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currRow.push(Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      ))
    }
    prevRow = currRow
  }
  const dist = prevRow[b.length]
  const maxLen = Math.max(a.length, b.length)
  return maxLen ? 1 - (dist / maxLen) : 0
}

const FUZZY_MATCH_THRESHOLD = 0.65

async function fetchCharacter(name) {
  try {
    const data = await fetchJSON(CHARACTERS_URL)
    if (!data || !data.characters) return null
    const q = name.toLowerCase().trim()
    let rec = data.characters[q]
    if (!rec && data.aliases && data.aliases[q]) {
      rec = data.characters[data.aliases[q]]
    }
    if (!rec) {
      const key = Object.keys(data.characters).find(k => q.startsWith(k) || k.startsWith(q))
      if (key) rec = data.characters[key]
    }
    if (!rec) {
      const tokens = q.split(/\s+/).filter(t => t.length >= 4)
      const strongMatches = []
      for (const token of tokens) {
        let bestForToken = null
        let bestScoreForToken = FUZZY_MATCH_THRESHOLD
        for (const key of Object.keys(data.characters)) {
          if (key.includes(' ')) continue
          const score = levenshteinSimilarity(token, key)
          if (score > bestScoreForToken) {
            bestScoreForToken = score
            bestForToken = key
          }
        }
        if (bestForToken) strongMatches.push({ token, key: bestForToken, score: bestScoreForToken })
      }

      if (strongMatches.length >= 2) {
        strongMatches.sort((a, b) => b.score - a.score)
        rec = data.characters[strongMatches[0].key]
      }
    }
    return rec || null
  } catch { return null }
}

async function fetchBookOverviewMap(bookId) {
  try {
    const data = await fetchJSON(`${GITHUB_BASE}/dict/book_overview_map.json`)
    if (!data) return null
    return data[bookId] || null
  } catch { return null }
}

async function fetchOverviewCommentaries(bookId, keyChapters) {
  const fetches = []
  for (const kc of keyChapters) {
    fetches.push(
      fetchMHC(bookId, kc.ch).then(text =>
        text ? { label: 'Matthew Henry (MH)', ch: kc.ch, chLabel: kc.label, text } : null)
    )
    fetches.push(
      fetchJFB(bookId, kc.ch).then(text =>
        text ? { label: 'Jamieson-Fausset-Brown (JFB)', ch: kc.ch, chLabel: kc.label, text } : null)
    )
  }
  const settled = await Promise.allSettled(fetches)
  return settled
    .map(s => s.status === 'fulfilled' ? s.value : null)
    .filter(Boolean)
}

async function fetchWesleyNotes(bookId, chapter, verse) {
  // v21 FIX: confirmed live -- this function had been returning null on
  // EVERY single call, for every book/chapter/verse, since it was first
  // written. Root cause: it assumed data.chapters was an ARRAY of
  // {chapter, commentary, verses} objects. The real files (confirmed
  // live against all 66 books on GitHub) store data.chapters as a PLAIN
  // OBJECT keyed by chapter number AS A STRING (e.g. "21"), with each
  // value being the chapter's full raw text as a STRING -- no
  // .commentary field, no .verses field, no array at all. The old guard
  // `!data.chapters.length` is always true on a plain object (objects
  // have no .length, so `!undefined` = true), so this returned null
  // immediately, before ever inspecting the real data. Wesley's real
  // per-book files are genuine, complete, and cover all 66 books -- they
  // were simply never actually read.
  //
  // BONUS discovered while fixing this: Wesley's own prose numbers each
  // verse's note at the START of its paragraph ("1. Observe here...",
  // "19. ...", "28. And we know..."), confirmed across multiple real
  // chapters. That is a MORE reliable per-verse anchor than the
  // chapter:verse citation regex used for other sources -- verified live
  // for Genesis 1:1, Isaiah 53:5, John 3:16, Romans 8:28, Ephesians 2:8,
  // and Revelation 21:4, each returning the exact verse-numbered
  // paragraph, not an approximation.
  try {
    const wesleyCode = WESLEY_BOOK_MAP[bookId] || bookId
    const url = `${GITHUB_BASE}/commentary/Wesley/${wesleyCode}.json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.chapters || typeof data.chapters !== 'object') return null

    const chapterText = data.chapters[String(chapter)]
    if (typeof chapterText !== 'string' || !chapterText) return null

    if (verse) {
      const leadPattern = new RegExp(`(?:^|\\n)${verse}\\.\\s`)
      const m = leadPattern.exec(chapterText)
      if (m) {
        const nextPattern = /\n\d+\.\s/
        const rest = chapterText.slice(m.index + m[0].length)
        const nextM = nextPattern.exec(rest)
        const end = nextM ? m.index + m[0].length + nextM.index : chapterText.length
        const extracted = chapterText.slice(m.index, end).trim()
        if (extracted) return extracted.slice(0, 1500)
      }
    }

    // Honest fallback -- no per-verse note found for this exact verse
    // (or no verse requested at all, e.g. Book Overview studies): same
    // chapter-level cap as before, not a silent guess.
    return chapterText.slice(0, 1500).trim() || null
  } catch { return null }
}

// v40: BSB lookups (Morning Trail seed, free preview, devotional fallback) read library/bible/BSB through the v34 scripture helpers,
// not data/bsb/bsb.json (which had ~5,300 cut-short verses and book codes that failed for 37 books). A missing book/verse is an honest null.
async function fetchBSBVerse(bookId, chapter, verse) {
  try {
    const items = readScriptureVerses(await fetchScriptureBook('bsb', bookId), chapter, verse, verse)
    const it = items && items[0]
    return it && it.status === 'text' ? it.text : null
  } catch { return null }
}

async function fetchBSBPassage(bookId, chapter, verseStart, verseEnd) {
  try {
    const items = readScriptureVerses(await fetchScriptureBook('bsb', bookId), chapter, verseStart || 1, verseEnd || 9999)
    if (!items) return null
    const verses = items.filter(i => i.status === 'text').map(i => `[${i.n}] ${i.text}`)
    return verses.join(' ') || null
  } catch { return null }
}

async function fetchFatherOnVerse(fatherName, bookId, chapter, verse) {
  const bookName = HCF_BOOK_MAP[bookId] || bookId
  const encodedFather = encodeURIComponent(fatherName)
  const encodedBook = encodeURIComponent(bookName)
  const filenames = verse
    ? [`${chapter}_${verse}`, `${chapter}_1-${verse}`, `${chapter}_${verse}-${verse + 9}`]
    : [`${chapter}_1`]
  for (const filename of filenames) {
    try {
      const url = `https://raw.githubusercontent.com/HistoricalChristianFaith/Commentaries-Database/master/${encodedFather}/${encodedBook}%20${filename}.toml`
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) continue
      const text = await res.text()
      const quotes = []
      const matches = text.matchAll(/quote='''\n([\s\S]+?)'''/g)
      for (const m of matches) {
        quotes.push(m[1].trim().slice(0, 400))
        if (quotes.length >= 2) break
      }
      if (quotes.length > 0) return quotes.join('\n\n')
    } catch { continue }
  }
  return null
}

async function fetchCrossRefs(bookId, chapter, verse, verseEnd) {
  try {
    const xrefBook = XREF_BOOK_MAP[bookId] || bookId
    const url = `${GITHUB_BASE}/xref/${xrefBook}.json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json()
    // FIX: when a verse range is given, merge cross-refs across the WHOLE
    // range rather than just the first verse -- otherwise a range like
    // Numbers 6:22-27 anchors on verse 22 alone, which may have zero
    // cross-refs of its own while the real content (24-26) is skipped.
    let refs
    if (verse && verseEnd) {
      refs = data.refs.filter(r => r.fc === chapter && r.fv >= verse && r.fv <= verseEnd)
    } else if (verse) {
      refs = data.refs.filter(r => r.fc === chapter && r.fv === verse)
    } else {
      refs = data.refs.filter(r => r.fc === chapter)
    }
    refs.sort((a, b) => b.v - a.v)
    return refs.slice(0, 6).map(r => {
      const bookName = BOOK_NAMES[r.tb] || r.tb
      return `${bookName} ${r.tc}:${r.tv} (${r.v} votes)`
    })
  } catch { return [] }
}

function verifyRabbiRoadCitation(studyText, crossRefs) {
  // v17: Rabbit Trail no longer exists as its own section (see header
  // comment) -- this function used to check both a Trail citation line
  // and a Rabbi Road citation line. Now it checks Rabbi Road only.
  if (!crossRefs || crossRefs.length === 0) {
    return { checked: false, reason: 'no cross-references were fetched for this study' }
  }

  const normalize = (s) => s.replace(/\s*\(\d+\s*votes?\)\s*$/i, '').trim().toLowerCase()
  const topRef = crossRefs[0]

  const result = { checked: true, rabbiRoad: null }

  const roadMatch = studyText.match(/Returning by way of ([^:]+):/i)
  if (roadMatch) {
    const stated = roadMatch[1].trim()
    const statedNorm = normalize(stated)
    const topRefNorm = normalize(topRef)
    result.rabbiRoad = {
      stated,
      verified: statedNorm === topRefNorm || statedNorm.includes(topRefNorm) || topRefNorm.includes(statedNorm),
    }
  } else {
    result.rabbiRoad = { stated: null, verified: false, reason: 'no citation line found' }
  }

  return result
}

// ── Honest source-usage detection ──────────────────────────────────
// NEW in v16: generalized version of the old verifyCommentaryUsage(),
// now shared by BOTH Protestant commentaries and Church Fathers, and
// used to build the real, code-generated sources footer -- not just to
// log to console after the fact. isPatristic controls how the source's
// short display name is extracted, since patristic labels carry a
// "(354-430 AD)" year-range suffix instead of a "(MH)"-style
// abbreviation, and the old stripping regex never matched that shape.
function extractSourceShortName(label, isPatristic) {
  // v24: explicit overrides for labels where the generic suffix-stripping
  // regex below produces something the model is unlikely to write
  // verbatim. Same failure class already confirmed live for JFB and
  // Barnes (see the fix note below) -- "Tyndale Open Study Notes (TSN)"
  // would otherwise reduce to "Tyndale Open Study" (the regex catches on
  // the word "Notes" at the end), which a model writing "**Tyndale**" or
  // "the Tyndale notes" would never match verbatim. Fixing this before
  // it's discovered live, the same way JFB and Barnes were fixed after.
  const SHORT_NAME_OVERRIDES = {
    'Tyndale Open Study Notes (TSN)': 'Tyndale',
  }
  if (SHORT_NAME_OVERRIDES[label]) return SHORT_NAME_OVERRIDES[label]

  let shortName = label
  if (isPatristic) {
    shortName = shortName.replace(/\s*\(\d{2,4}\s*-\s*\d{2,4}\s*AD\)\s*$/i, '')
  } else {
    shortName = shortName.replace(/\s*\([A-Z]{2,5}\)\s*$/, '')
    shortName = shortName.replace(/'s\s+.*$/, '')
    shortName = shortName.replace(/\s+(Reference Notes|Commentary|Commentaries|Notes|Bible Dictionary|Dictionary|Topical Bible|Treasury of David).*$/i, '')
  }
  return shortName.trim()
}

// v20 FIX: confirmed live — Jamieson-Fausset-Brown was being silently
// dropped from the honest sources footer despite being genuinely,
// correctly quoted in a proper >>COMMENTARY block. Root cause: the
// internal label "Jamieson-Fausset-Brown" is hyphenated, but the model
// writes the name naturally in prose ("Jamieson, Fausset & Brown") --
// an exact-substring match between the two never succeeds, so
// appearsAtAll came back false and the source was marked UNUSED even
// though it was visibly, properly used. Confirmed the same fragility
// exists for "Barnes'" (trailing apostrophe in the internal label,
// but the model naturally writes "**Barnes**" without it) via the
// same code-level check, though not yet confirmed live like JFB.
//
// Fix: normalize BOTH the expected short name and the searched text
// the same way before comparing -- strip hyphens, commas, ampersands,
// apostrophes, collapse whitespace. "Jamieson-Fausset-Brown" and
// "Jamieson, Fausset & Brown" both reduce to "jamieson fausset brown"
// and match correctly. This is a general mechanism, not a JFB-specific
// patch -- protects any future compound-name source from the same
// silent-undercounting failure without needing its own alias entry.
function normalizeForMatching(text) {
  return text
    .toLowerCase()
    .replace(/[&,]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function checkSourceUsage(studyText, sources, isPatristic = false) {
  if (!sources || sources.length === 0) {
    return { checked: false, reason: 'no sources of this type were fetched for this study', results: [] }
  }

  const normText = normalizeForMatching(studyText)
  const results = sources.map(({ label }) => {
    const shortName = extractSourceShortName(label, isPatristic)
    const normShortName = normalizeForMatching(shortName)
    const appearsAtAll = normText.includes(normShortName)

    let properlyTagged = false
    if (appearsAtAll) {
      // v23 FIX: tolerate a single OR double leading bracket, matching the
      // same normalization now applied in routeCommentaryAware() -- see
      // that function's comment for the full incident (a real JFB block
      // for Psalm 119:105 used ">COMMENTARY" instead of ">>COMMENTARY").
      const commentaryBlocks = studyText.match(/>{1,2}\s*COMMENTARY[\s\S]*?>{1,2}\s*END/gi) || []
      properlyTagged = commentaryBlocks.some(block =>
        normalizeForMatching(block).includes(normShortName)
      )
    }

    return {
      label,
      source: shortName,
      appearsAtAll,
      properlyTagged,
      status: !appearsAtAll ? 'UNUSED' : (properlyTagged ? 'TAGGED' : 'UNTAGGED'),
    }
  })

  return { checked: true, results }
}


// ── v28: LOG-ONLY QUOTATION VERIFICATION ─────────────────────────────
// checkSourceUsage() only proves a scholar's NAME appears inside a
// >>COMMENTARY block. It does not prove the words in quotation marks are
// the scholar's. Confirmed failure: a PDF attributed a paraphrase
// ("caught and silenced by his words...") to Matthew Henry in quotation
// marks; the words are not in Henry. This check compares each quoted
// passage against the EXACT excerpt that was supplied to the model.
//
// It NEVER changes the study, the footer, or any source's status. It only
// writes log lines, so the rate of paraphrase-in-quotes can be measured
// before any editorial rule is built on it.
//
// Verdicts per block:
//   MATCH         every quoted fragment (>= 4 words) found verbatim in the
//                 attributed source's supplied excerpt (case, punctuation,
//                 markdown and curly-quote differences ignored)
//   PARTIAL       some fragments found verbatim, others not
//   NO MATCH      no fragment found verbatim (longest verbatim run logged)
//   INCONCLUSIVE  no quotation marks, quote too short, scholar not
//                 recognised, or that source was not supplied this study
// A non-MATCH is a flag for human review, not proof of fabrication: the
// model may have merged fragments or altered wording. No fuzzy/semantic
// similarity is ever counted as a match.
function normalizeForQuoteMatch(text) {
  return ' ' + String(text || '')
    .toLowerCase()
    .replace(/[‘’‛']/g, "'")
    .replace(/[“”„"]/g, ' ')
    .replace(/[⁰¹²³⁴-⁹]/g, ' ')
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim() + ' '
}

function verifyQuotedCommentary(studyText, commentaries, patristics) {
  const pool = [
    ...(commentaries || []).map(c => ({ ...c, patristic: false })),
    ...(patristics || []).map(c => ({ ...c, patristic: true })),
  ].map(c => ({
    label: c.label,
    shortNorm: normalizeForMatching(extractSourceShortName(c.label, c.patristic)),
    norm: normalizeForQuoteMatch(c.text),
  }))
  const blocks = studyText.match(/>{1,2}\s*COMMENTARY[\s\S]*?>{1,2}\s*END/gi) || []
  const out = []
  for (const block of blocks) {
    const inner = block.replace(/^>{1,2}\s*COMMENTARY/i, '').replace(/>{1,2}\s*END\s*$/i, '').trim()
    const nameMatch = inner.match(/\*\*([^*]+)\*\*/)
    const scholar = nameMatch ? nameMatch[1].trim() : ''
    const afterName = nameMatch ? inner.slice(nameMatch.index + nameMatch[0].length) : inner
    const quoteMatches = [...afterName.matchAll(/["“]([^"”]{12,})["”]/g)].map(m => m[1])
    const quoted = quoteMatches.join(' ... ')
    const base = { scholar, quote: quoted.slice(0, 90) }
    if (!scholar) { out.push({ ...base, verdict: 'INCONCLUSIVE', why: 'no scholar name' }); continue }
    const nScholar = normalizeForMatching(scholar)
    const src = pool.find(p => nScholar.includes(p.shortNorm) || p.shortNorm.includes(nScholar))
    if (!src) { out.push({ ...base, verdict: 'INCONCLUSIVE', why: 'scholar not among sources supplied this study' }); continue }
    if (!quoted) { out.push({ ...base, source: src.label, verdict: 'INCONCLUSIVE', why: 'no quotation marks (paraphrase or unquoted)' }); continue }
    // Fragments: split on ellipses / bracketed insertions; ignore tiny ones.
    const fragments = quoted.split(/\.{3,}|…|\[[^\]]*\]/).map(f => normalizeForQuoteMatch(f).trim()).filter(f => f.split(' ').length >= 4)
    if (fragments.length === 0) { out.push({ ...base, source: src.label, verdict: 'INCONCLUSIVE', why: 'quote under 4 words' }); continue }
    let found = 0
    for (const f of fragments) if (src.norm.includes(' ' + f + ' ')) found++
    // longest verbatim run, for diagnosis (words of the whole quote)
    const words = normalizeForQuoteMatch(quoted).trim().split(' ')
    let longest = 0
    for (let i = 0; i < words.length; i++) {
      let j = i + Math.max(longest, 1)
      while (j <= words.length && src.norm.includes(' ' + words.slice(i, j).join(' ') + ' ')) { longest = j - i; j++ }
    }
    const verdict = found === fragments.length ? 'MATCH' : (found > 0 ? 'PARTIAL' : 'NO MATCH')
    const other = verdict === 'MATCH' ? null : pool.find(p => p !== src && fragments.some(f => p.norm.includes(' ' + f + ' ')))
    out.push({ ...base, source: src.label, verdict, fragments: `${found}/${fragments.length}`, longestRun: `${longest}/${words.length} words`, foundInOther: other ? other.label : undefined })
  }
  return out
}

// NEW in v16: builds the REAL sources footer from what the study
// actually used, not from what was merely fetched and handed to the
// model. Called only after the stream completes and fullText is known.
// A source is included if it status is TAGGED or UNTAGGED (it
// genuinely appears in the output, properly wrapped or not) -- UNUSED
// sources (fetched, listed nowhere in the actual text) are silently
// dropped rather than claimed. This directly replaces the old approach
// of asking the model to write its own footer from the full fetch
// list, which is exactly what let a study claim it consulted Calvin
// and two Church Fathers it never actually surfaced.
function buildHonestSourcesFooter(commentaries, patristics, crossRefsCited, strongsInfo) {
  const lines = ['\n\n---', '### Sources Consulted']
  let anySourceListed = false

  const sourceFullNames = {
    'Matthew Henry (MH)':               "Matthew Henry's Commentary on the Whole Bible (public domain; digital text from lyteword/mhenry-complete; printed edition not identified)",
    'Jamieson-Fausset-Brown (JFB)':     'Jamieson, Fausset & Brown Commentary, 1871',
    'Adam Clarke (AC)':                 "Adam Clarke's Commentary on the Bible, 1826",
    "Barnes' Notes (BN)":               "Barnes' Notes on the Bible, 1834",
    "Wesley's Explanatory Notes (JW)":  "John Wesley's Explanatory Notes on the Bible",
    'Scofield Reference Notes (SR)':    'Scofield Reference Notes, 1917',
    "Spurgeon's Treasury of David (SP)":'Spurgeon, Treasury of David, 1885',
    "Calvin's Commentaries (CC)":       "Calvin's Commentaries, 1844-1856 (English translation)",
    "Nave's Topical Bible (NT)":        "Nave's Topical Bible, Orville J. Nave, 1896",
    "Easton's Bible Dictionary (EBD)":  "Easton's Bible Dictionary, M.G. Easton, 1897",
    "Vincent's Word Studies (VWS)":     "Marvin Vincent, Word Studies in the New Testament, 1887",
    "Meyer's NT Commentary (MEY)":      "Heinrich Meyer, Critical and Exegetical Commentary on the NT, 1832",
  }

  // v24: Tyndale Open Study Notes is CC BY-SA 4.0, NOT public domain like
  // every other source above -- it must never be folded into the
  // "Protestant Commentaries (Public Domain)" section below, since that
  // would misstate its license. Split it out before that section renders.
  const TYNDALE_LABEL = 'Tyndale Open Study Notes (TSN)'
  const tyndaleUsed = commentaries.filter(c => c.label === TYNDALE_LABEL)
  const publicDomainCommentaries = commentaries.filter(c => c.label !== TYNDALE_LABEL)

  if (publicDomainCommentaries.length > 0) {
    lines.push('\n**Protestant Commentaries (Public Domain)**')
    publicDomainCommentaries.forEach(c => lines.push(`- ${sourceFullNames[c.label] || c.label}`))
    anySourceListed = true
  }

  if (tyndaleUsed.length > 0) {
    lines.push('\n**Modern Study Notes (CC BY-SA 4.0 — not public domain)**')
    lines.push('- Tyndale Open Study Notes, © Tyndale House Publishers. Licensed CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0); this study incorporates and adapts excerpts under that license\'s share-alike terms.')
    anySourceListed = true
  }

  if (patristics.length > 0) {
    lines.push('\n**Church Fathers**')
    patristics.forEach(c => lines.push(`- ${c.label}`))
    anySourceListed = true
  }

  if (strongsInfo) {
    lines.push('\n**Original Language**')
    if (strongsInfo.hebrew) {
      const h = strongsInfo.hebrew
      lines.push(`- Strong's Hebrew Lexicon H${h.num}: *${h.trans}* [${h.pron}] — ${h.brief}`)
    }
    if (strongsInfo.greek) {
      const g = strongsInfo.greek
      lines.push(`- Strong's Greek Lexicon G${g.num}: *${g.trans}* [${g.pron}] — ${g.brief}`)
    }
    anySourceListed = true
  }

  if (crossRefsCited && crossRefsCited.length > 0) {
    lines.push('\n**Cross-References**')
    lines.push('- OpenBible.info cross-reference dataset (ranked by scholarly consensus)')
    anySourceListed = true
  }

  if (!anySourceListed) {
    lines.push('\nThis study draws on general biblical knowledge — no commentary texts were consulted. Verify every claim with your own Bible and study tools.')
  }

  lines.push('\n*RabbiRabbit synthesizes these sources. Every reference is a starting point — verify with your own Bible and commentaries before teaching.*')
  return lines.join('\n')
}

// ── DEVOTIONAL — dedicated, standalone prompt ───────────────────────
// Genuinely separate from buildPrompt(). Contains NO reference to
// Rabbi Road, Over the Hill, the two-source minimum, or the 5000-token
// framing -- those instructions don't exist in this function's universe
// at all. This is the structural fix for the contradiction confirmed
// live this session: the old approach layered devotional constraints
// onto the shared template, which still unconditionally required
// multi-source commentary and "always complete" Rabbi Road/Over the
// Hill sections a few hundred words later in the same prompt -- the
// model tried to satisfy both and got hard-cut mid-sentence by the
// real ~800-token limit, nowhere near a conclusion.
//
// Single source: MHC only. Full 66-book coverage, no gaps, and its
// voice register (pastoral, applicational, always presses toward a
// personal question) is already what a devotional needs -- no reason
// to juggle multiple voices for a ~250-word read. Scripture text is
// FETCHED, not model-recalled -- the old shared-template devotional
// path had no scripture-fetch step at all and trusted the model to
// remember the verse from training data, a real accuracy risk for
// less-common translations. See the dedicated fetch branch in the
// main handler (search "DEDICATED, MINIMAL DEVOTIONAL PATH").
function buildDevotionalPrompt({ reference, scriptureText, mhcText, topic, trailContext }) {
  return `You are writing a short devotional for RabbiRabbit's Morning Trail.

VOICE: Warm, unhurried, honest about difficulty without being heavy.
9th-grade reading level. This is a five-minute morning encounter with
the text, not a study -- one idea, landed completely, no loose threads.
${trailContext ? `
TRAIL CONTINUITY:
The reader has just come from a previous study that ended with this:
"${trailContext}"
Open by picking up that thread naturally in your first sentence.
` : ''}
KEY VERSE:
${reference}
"${scriptureText}"
${mhcText ? `
MATTHEW HENRY, on this passage -- use his actual words or a close
paraphrase for ONE short quote. Do not invent anything beyond what's
given here:
${mhcText}` : `
No Matthew Henry material was available for this passage -- write the
devotional without naming any commentator, rather than inventing what
one might have said.`}
${topic ? `\nTODAY'S THEME: ${topic}` : ''}

Write exactly these four parts, in this order, flowing prose, no headers:

1. KEY VERSE
>>SCRIPTURE
*"quoted text exactly as given above"*
**${reference}**
>>END
This is the only scripture quote in the whole piece.

2. THE MOMENT -- one paragraph only. What's actually happening in this
verse, and what it means for someone reading it this morning. If
Matthew Henry's material was given above, weave in ONE short quote from
it, wrapped exactly as:
>>COMMENTARY
**Matthew Henry**
"his words, one sentence"
>>END
If no Matthew Henry material was given, don't name any commentator at
all. Say the real thing once. Don't restate it in different words later
in the piece -- that's the most common way a short devotional runs long
without adding value.

3. A QUESTION TO CARRY -- one italicized sentence. Not a discussion
question. Something that walks with the reader into the day.

4. CLOSING PRAYER -- 2-3 sentences. Honest, specific to this passage,
no "Amen." Then, on its own line:
*Sit with that for a moment before the day begins.*

HARD LIMITS -- no exceptions:
- 230-250 words total, including the scripture quote.
- Exactly one scripture quote. At most one commentary quote.
- Nothing follows the closing line above. No further sections, ever.
- No bullet points anywhere. No section headers anywhere.

Begin with the >>SCRIPTURE block. End with the closing line above.
Nothing else, before or after.`
}

// ============================================================================
// v34: SCRIPTURE SUPPLIED TO THE STUDY PROMPT, plus a log-only Scripture check.
//
// Until v33 the study prompt contained no verse text: the model recalled every >>SCRIPTURE block from memory
// (live finding, Psalm 1:1, Oct 27: WEB labelled but blended; Jeremiah 15:17 was KJV wording under a WEB label).
// v34: the Worker reads the real verse text from library/bible/<EDITION>/<BOOK>.json (small per-book files on
// main) and puts it in the prompt, numbered, with rules: copy it exactly, never quote a verse that was not
// supplied, never fill a gap (an edition that prints no text) with wording from memory or another translation.
//
// What is supplied: the studied passage (verse, range, or the chapter up to a cap) and the verses of the
// cross-references the prompt already lists (Rabbi Road, supporting, second hop). Which study types get this is
// one constant (SCRIPTURE_SUPPLY_TYPES). The log-only check below runs for every non-devotional study, so the
// other types can be measured before they are switched on. Devotional studies keep their own path, unchanged.
// A fetch failure is an honest null: the prompt then tells the model to write no >>SCRIPTURE block at all.
// ============================================================================
const SCRIPTURE_LIB_BASE = 'https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/library/bible'
const SCRIPTURE_EDITIONS = { web: 'WEB', kjv: 'KJV', asv: 'ASV', bsb: 'BSB' }
const SCRIPTURE_EDITION_NAMES = {
  web: 'World English Bible Updated (WEB)', kjv: 'King James Version (KJV)',
  asv: 'American Standard Version (ASV)', bsb: 'Berean Study Bible (BSB)'
}
const SCRIPTURE_SUPPLY_TYPES = new Set(['passage', 'character'])   // study types that get supplied text + the strict rule (v35: + character)
const SCRIPTURE_PASSAGE_CAP = 8000                    // characters of studied-passage text put in the prompt
const SCRIPTURE_MAX_EXTRA_REFS = 12                   // cross-reference verses supplied at most
const SCRIPTURE_MAX_RANGE = 6                         // verses per cross-reference at most

// v41: an edition may print a passage at a different place than the usual numbering. WEB Updated (eBible.org, 30 Oct 2026) prints the
// doxology of Romans at 14:24-26 (a footnote there says the Textus Receptus puts it at 16:25-27); Romans 16:26-27 do not exist in this edition
// and 16:25 is empty. The Worker never redirects silently: it tells the study where the edition prints the text and supplies it under that reference.
const EDITION_PLACEMENTS = {
  web: [{ book: 'ROM', chapter: 16, from: 25, to: 27, label: 'the doxology of Romans (16:25-27 in many Bibles)',
          at: { book: 'ROM', chapter: 14, from: 24, to: 26 } }]
}
function placementsFor(editionKey, requests) {
  const out = []
  for (const pl of (EDITION_PLACEMENTS[editionKey] || [])) {
    if (requests.some(r => r.bookId === pl.book && r.chapter === pl.chapter && r.from <= pl.to && r.to >= pl.from)) out.push(pl)
  }
  return out
}

function scriptureEditionKey(translation) {
  return SCRIPTURE_EDITIONS[translation] ? translation : 'web'   // same fallback as TRANSLATION in buildPrompt
}

async function fetchScriptureBook(editionKey, bookId) {
  return fetchJSON(`${SCRIPTURE_LIB_BASE}/${SCRIPTURE_EDITIONS[editionKey]}/${toShortCode(bookId)}.json`)
}

// Reads verses from..to of one chapter of a library book. Status per verse follows the library's rules:
//   text   = the edition prints this verse
//   empty  = key present, no text (the edition prints nothing there; also the "[]" placeholder)
//   absent = no such verse number in this edition
// v36: the WEB source file marks the first line of a poem with a literal "&gt; " (117 Psalm verses). That is a formatting marker
// from the conversion, not scripture: remove it, and decode the basic HTML entities, before the text goes into the prompt or the check.
function cleanScriptureText(t) {
  return String(t).replace(/^\s*&gt;\s*/, '').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
}

function readScriptureVerses(book, chapter, from, to) {
  const ch = book && Array.isArray(book.chapters) ? book.chapters.find(c => c.chapter === chapter) : null
  if (!ch || !ch.verses) return null
  const keys = Object.keys(ch.verses).map(Number).filter(Number.isFinite)
  const last = keys.length ? Math.max(...keys) : 0
  const end = Math.min(to, Math.max(last, from))
  const items = []
  for (let n = from; n <= end; n++) {
    const raw0 = ch.verses[String(n)], raw = raw0 === undefined ? raw0 : cleanScriptureText(raw0)
    if (raw === undefined) items.push({ n, status: 'absent' })
    else if (raw === '' || raw === '[]') items.push({ n, status: 'empty' })
    else items.push({ n, status: 'text', text: raw })
  }
  return items
}

// "Psalm 1:1 (WEB)", "John 3:16-17", "Acts 8:22 (12 votes)" -> { bookId (short), chapter, verse, verseEnd } or null.
// Compound references ("John 3:16; 1 John 4:9", "Psalm 1:1, 3") are not attempted.
function parseVerseRef(str) {
  if (!str) return null
  const s = String(str).replace(/\([^)]*\)/g, ' ').replace(/[–—‒]/g, '-').replace(/\s+/g, ' ').trim()
  if (/[;&]|,\s*\d|\band\b/i.test(s)) return null
  const p = parsePassage(s)
  if (!p || !p.verse) return null
  return { bookId: toShortCode(p.bookId), chapter: p.chapter, verse: p.verse, verseEnd: p.verseEnd && p.verseEnd >= p.verse ? p.verseEnd : null }
}

function scriptureRefLabel(bookId, chapter, from, to) {
  const name = BOOK_NAMES[bookId] || bookId
  if (!from) return `${name} ${chapter}`
  return `${name} ${chapter}:${from}${to && to > from ? '-' + to : ''}`
}

function scriptureLines(items, editionKey) {
  const ed = SCRIPTURE_EDITIONS[editionKey]
  return items.map(it => it.status === 'text' ? `[${it.n}] ${it.text}`
    : it.status === 'empty' ? `[${it.n}] (the ${ed} prints no text for verse ${it.n}; do not supply any wording for it)`
    : `[${it.n}] (the ${ed} has no verse ${it.n} here)`)
}

// anchor = { bookId, chapter, verse, verseEnd } of the studied passage; refStrings = the cross-reference strings
// the prompt will list. Returns { ok, promptBlock, suppliedKeys, summary }.
async function buildScriptureSupply(editionKey, anchor, refStrings) {
  const EDN = SCRIPTURE_EDITION_NAMES[editionKey]
  const short = toShortCode(anchor.bookId)
  const from = anchor.verse || 1
  const to = anchor.verse ? (anchor.verseEnd && anchor.verseEnd >= anchor.verse ? anchor.verseEnd : anchor.verse) : 9999

  // extras: cross-reference verses, deduplicated, never the studied passage itself
  const extras = []
  const seen = new Set()
  for (const s of (refStrings || [])) {
    if (extras.length >= SCRIPTURE_MAX_EXTRA_REFS) break
    const r = parseVerseRef(s)
    if (!r) continue
    const rEnd = Math.min(r.verseEnd || r.verse, r.verse + SCRIPTURE_MAX_RANGE - 1)
    const key = `${r.bookId} ${r.chapter}:${r.verse}-${rEnd}`
    if (seen.has(key)) continue
    seen.add(key)
    if (r.bookId === short && r.chapter === anchor.chapter && r.verse >= from && rEnd <= to) continue
    extras.push({ ...r, verseEnd: rEnd })
  }

  const books = new Map()
  const need = [short, ...extras.map(e => e.bookId)]
  await Promise.all([...new Set(need)].map(async b => books.set(b, await fetchScriptureBook(editionKey, b))))

  const suppliedKeys = new Set()
  const passageItems = readScriptureVerses(books.get(short), anchor.chapter, from, to)
  if (!passageItems || passageItems.length === 0) {
    return {
      ok: false, suppliedKeys,
      promptBlock: `\nSCRIPTURE TEXT: the ${EDN} text for ${scriptureRefLabel(short, anchor.chapter, anchor.verse, anchor.verseEnd)} could not be loaded this time.
Do NOT write any >>SCRIPTURE block in this study and do not put any verse wording in quotation marks. Refer to verses
by reference only, in your own words, and tell the reader once, briefly, that the verse text was not available.\n`,
      summary: { passage: scriptureRefLabel(short, anchor.chapter, anchor.verse, anchor.verseEnd), loaded: false }
    }
  }

  // studied passage, up to the cap (whole verses only)
  let used = 0, kept = []
  for (const it of passageItems) {
    const line = scriptureLines([it], editionKey)[0]
    if (kept.length > 0 && used + line.length > SCRIPTURE_PASSAGE_CAP) break
    kept.push(it); used += line.length + 1
  }
  const truncated = kept.length < passageItems.length
  for (const it of kept) suppliedKeys.add(`${short} ${anchor.chapter}:${it.n}`)
  const firstN = kept[0].n, lastN = kept[kept.length - 1].n
  const passageLabel = scriptureRefLabel(short, anchor.chapter, anchor.verse ? from : firstN, anchor.verse ? to : lastN)

  let block = `\nSCRIPTURE TEXT — ${EDN} — read from the library by the system. It is the ONLY scripture you may quote in a >>SCRIPTURE block.
STUDIED PASSAGE: ${scriptureRefLabel(short, anchor.chapter, firstN, lastN)}
${scriptureLines(kept, editionKey).join('\n')}
${truncated ? `(This passage is longer than the space allowed: text is supplied for verses ${firstN}-${lastN} only. Verses after ${lastN} are NOT supplied and must not be quoted.)\n` : ''}`

  // cross-reference verses
  const extraBlocks = []
  let extraCount = 0
  for (const e of extras) {
    const items = readScriptureVerses(books.get(e.bookId), e.chapter, e.verse, e.verseEnd)
    if (!items || items.length === 0) continue
    for (const it of items) suppliedKeys.add(`${e.bookId} ${e.chapter}:${it.n}`)
    extraBlocks.push(`${scriptureRefLabel(e.bookId, e.chapter, e.verse, items[items.length - 1].n)}\n${scriptureLines(items, editionKey).join('\n')}`)
    extraCount++
  }
  if (extraBlocks.length) block += `\nCROSS-REFERENCE VERSES (${EDN}) — the only other verses you may quote:\n${extraBlocks.join('\n')}\n`

  // v41: passages this edition prints elsewhere
  const placeReqs = [{ bookId: short, chapter: anchor.chapter, from, to }, ...extras.map(e => ({ bookId: e.bookId, chapter: e.chapter, from: e.verse, to: e.verseEnd || e.verse }))]
  const placed = []
  for (const pl of placementsFor(editionKey, placeReqs)) {
    const items = readScriptureVerses(await fetchScriptureBook(editionKey, pl.at.book), pl.at.chapter, pl.at.from, pl.at.to)
    if (!items || !items.some(i => i.status === 'text')) continue
    for (const it of items) suppliedKeys.add(`${pl.at.book} ${pl.at.chapter}:${it.n}`)
    const where = scriptureRefLabel(pl.at.book, pl.at.chapter, pl.at.from, pl.at.to)
    block += `
PLACEMENT NOTE — the ${EDN} prints ${pl.label} at ${where}, not at ${scriptureRefLabel(pl.book, pl.chapter, pl.from, pl.to)}. In this edition ${scriptureRefLabel(pl.book, pl.chapter, pl.from, pl.to)} has no text of its own.
That is how the edition is arranged, not a missing or damaged text. If the study touches that passage, say once, briefly, that this edition prints it at ${where}. Quote it only under ${where}, using the text below, and never label it ${scriptureRefLabel(pl.book, pl.chapter, pl.from, pl.to)}.
${where} (${SCRIPTURE_EDITIONS[editionKey]}):
${scriptureLines(items, editionKey).join('\n')}
`
    placed.push(where)
  }

  block += `
SCRIPTURE RULES — strictly observed:
1. Every >>SCRIPTURE block is copied word for word from the SCRIPTURE TEXT above, in the ${EDN}. Do not write the
   [verse numbers] inside the quote.
2. Quote one to three consecutive verses, or part of a verse, using "..." for anything left out. Never join pieces of
   different verses without "...", and never add, swap or modernise a word.
3. A verse that is not in the SCRIPTURE TEXT above must never appear inside a >>SCRIPTURE block. If you want to point
   to it, name the reference in your own words, with no quotation marks and no claim about its exact wording.
4. Where the text above says the ${SCRIPTURE_EDITIONS[editionKey]} prints no text for a verse, or has no such verse, say so plainly in one sentence if it matters
   to the study. Never fill the gap with wording from memory or from another translation.
`
  return {
    ok: true, suppliedKeys, promptBlock: block,
    summary: { passage: passageLabel, loaded: true, passageVerses: kept.length, truncated, extraRefs: extraCount, books: books.size, promptChars: block.length, placements: placed.join('; ') || null }
  }
}

// ---- log-only Scripture check ---------------------------------------------------------------------------------
// For each >>SCRIPTURE block: parse the reference in the bold line, read that reference's verses from the study's
// edition, and compare the quoted words (normalised, fragments of at least 3 words split at "..." and [insertions]).
//   MATCH         every fragment is found verbatim in the edition's text for that reference
//   PARTIAL       some fragments are
//   NO MATCH      none is; the edition (or others) is named when another edition does contain the words
//   INCONCLUSIVE  no parseable single reference, or the quote is under 3 words
// "supplied" says whether the verses were in the prompt (n/a when nothing was supplied for this study type).
// Never alters the output. A non-MATCH is a flag for review.
async function verifyScriptureBlocks(studyText, editionKey, supply) {
  const blocks = (studyText.match(/>{1,2}\s*SCRIPTURE[\s\S]*?>{1,2}\s*END/gi) || []).slice(0, 14)
  const out = []
  let otherLookups = 0
  for (const block of blocks) {
    const inner = block.replace(/^>{1,2}\s*SCRIPTURE/i, '').replace(/>{1,2}\s*END\s*$/i, '').trim()
    const bolds = [...inner.matchAll(/\*\*([^*]+)\*\*/g)]
    const refRaw = bolds.length ? bolds[bolds.length - 1][1].trim() : ''
    const quoteRaw = (refRaw ? inner.replace(/\*\*[^*]+\*\*/g, ' ') : inner).replace(/\*/g, ' ').replace(/\[\d+\]/g, ' ')
    const base = { ref: refRaw || '(no reference)', quote: quoteRaw.replace(/\s+/g, ' ').replace(/^[\s"“”]+|[\s"“”]+$/g, '').slice(0, 80) }
    const ref = parseVerseRef(refRaw)
    if (!ref) { out.push({ ...base, verdict: 'INCONCLUSIVE', why: 'reference is missing, compound or has no verse' }); continue }
    const to = ref.verseEnd || ref.verse
    let supplied = 'n/a'
    if (supply && supply.suppliedKeys && supply.suppliedKeys.size) {
      supplied = 'yes'
      for (let n = ref.verse; n <= to; n++) if (!supply.suppliedKeys.has(`${ref.bookId} ${ref.chapter}:${n}`)) { supplied = 'no'; break }
    }
    const fragments = quoteRaw.split(/\.{3,}|…|\[[^\]]*\]/).map(f => normalizeForQuoteMatch(f).trim()).filter(f => f.split(' ').length >= 3)
    if (fragments.length === 0) { out.push({ ...base, supplied, verdict: 'INCONCLUSIVE', why: 'quote under 3 words' }); continue }
    const textOf = items => items ? normalizeForQuoteMatch(items.filter(i => i.status === 'text').map(i => i.text).join(' ')) : null
    const exp = textOf(readScriptureVerses(await fetchScriptureBook(editionKey, ref.bookId), ref.chapter, ref.verse, to))
    if (exp === null) { out.push({ ...base, supplied, verdict: 'INCONCLUSIVE', why: 'edition text for this reference could not be read' }); continue }
    let found = 0
    for (const f of fragments) if (exp.includes(' ' + f + ' ')) found++
    const words = normalizeForQuoteMatch(quoteRaw).trim().split(' ')
    let longest = 0
    for (let i = 0; i < words.length; i++) {
      let j = i + Math.max(longest, 1)
      while (j <= words.length && exp.includes(' ' + words.slice(i, j).join(' ') + ' ')) { longest = j - i; j++ }
    }
    const verdict = found === fragments.length ? 'MATCH' : (found > 0 ? 'PARTIAL' : 'NO MATCH')
    const r = { ...base, supplied, verdict, fragments: `${found}/${fragments.length}`, longestRun: `${longest}/${words.length} words` }
    if (exp.trim() === '') r.why = `the ${SCRIPTURE_EDITIONS[editionKey]} prints no text for this reference`
    if (verdict !== 'MATCH' && otherLookups < 4) {
      otherLookups++
      const hits = []
      for (const k of Object.keys(SCRIPTURE_EDITIONS)) {
        if (k === editionKey) continue
        const t = textOf(readScriptureVerses(await fetchScriptureBook(k, ref.bookId), ref.chapter, ref.verse, to))
        if (t && fragments.every(f => t.includes(' ' + f + ' '))) hits.push(SCRIPTURE_EDITIONS[k])
      }
      r.foundInOther = hits.join('/') || null
    }
    out.push(r)
  }
  return out
}

function buildPrompt(params, commentaries, patristics, crossRefs, strongsData, overviewMap, overviewCommentaries, secondHopCrossRefs, scriptureSupply) {
  const { studyType, primaryInput, additionalVerses, character,
          theme, audience, translation, sections, notes,
          trailContext } = params

  const transMap = {
    web:'World English Bible Updated (WEB)',
    kjv:'King James Version (KJV)',
    asv:'American Standard Version (ASV)',
    bsb:'Berean Study Bible (BSB)'
  }
  const sectionMap = {
    context:'Historical & Cultural Context',
    original_language:'Original Language Notes (Hebrew/Greek)',
    cross_references:'Cross-References',
    application:'Life Application',
    discussion:'Discussion Questions',
    prayer:'Closing Prayer Points'
  }
  const sectionList = (sections || []).map(s => sectionMap[s]).filter(Boolean).join(', ')

  const audienceInstructions = {
    beginner: `AUDIENCE: New Believers — 10th grade reading level maximum
This study is for people new to faith or exploring it for the first time.
They may have no church background. Theological vocabulary is a foreign language.

TARGET LENGTH: main body ~900-1000 words. Shorter than other audiences on
purpose -- clarity and landing one idea well matters more than covering
everything. This target exists so the study can complete fully within
its token budget without a rushed or truncated ending.

ENTRY POINT: Start from human experience before moving to the text.
Open with something universally felt — longing, fear, shame, hope, loss —
then show how the passage speaks into that experience. The reader is led
toward the text, not dropped into it.

LANGUAGE RULES — non-negotiable:
- Every theological term defined on first use, in plain English, in the same sentence.
  Not a footnote, not a parenthesis — woven in naturally.
  Wrong: "Paul writes about justification here."
  Right: "Paul writes about justification — being declared right with God — here."
- No word longer than three syllables unless it is a proper noun or defined immediately.
- Sentences under 20 words where possible. One idea per sentence.
- Never use: propitiation, sanctification, eschatology, soteriology, hermeneutics,
  exegesis, pericope, or any term a person would not encounter outside a seminary.
  If the concept is essential, describe it in plain language first.

SCHOLARSHIP: Name scholars only if their insight is vivid and brief.
One sentence maximum. Never academic citation style.

TONE: The professor who makes you feel capable, not the one who makes you feel small.
Warm through engagement. Never patronizing. Trust the reader's intelligence
even while simplifying the vocabulary.

RABBI ROAD: Should feel like a discovery the reader makes alongside you.
Not a lecture. End with a question that genuinely opens, not one that implies an answer.

DISCUSSION QUESTIONS: Genuinely open. No assumed answers. Questions a skeptic
could engage honestly.`,

    general: `AUDIENCE: General Adult
This study is for adults with some Bible familiarity.
TARGET LENGTH: main body ~1100-1200 words.
- Balance scholarship with accessibility
- Define technical terms but do not over-explain
- Equal weight to understanding the text and applying it
- Scholarly voices add depth without dominating
- Accessible without being shallow`,

    deeper: `AUDIENCE: Deeper Study
This study is for serious students who want full scholarly engagement.
TARGET LENGTH: main body ~1400-1500 words -- genuinely more room than
General Adult, reflecting the real depth this audience wants, but a
real bounded target, not unlimited. CORRECTED: earlier drafts said "no
ceiling," which directly contradicted the study's actual fixed token
budget and was a real, confirmed contributing cause of Deeper Study
studies cutting off mid-generation. Depth here means density and
quality of engagement within this target, not unbounded length.
- Foreground original language terms with pronunciation on first use
- Extended interaction between scholarly voices — name where they agree and differ
- Historical, textual, and theological depth over brevity
- Trust the reader to handle complexity without hand-holding
- Rabbi Road should go somewhere genuinely unexpected and land richer
- Discussion questions should press into the text, not just apply it
- Do not soften or simplify the scholars' actual positions
- CRITICAL: Never state specific numerical claims — chapter counts, year spans,
  distances, dates, quantities — unless they appear explicitly in the provided
  source material. When precision cannot be verified, use narrative language
  instead: "across the preceding chapters" not "across thirty-seven chapters",
  "decades of waiting" not "twenty-five years". Invented precision destroys
  scholarly credibility faster than acknowledged uncertainty.`,

    small_group: `AUDIENCE: Small Group
This study is designed to be used in a group of 6-12 people.
TARGET LENGTH: main body ~1100-1200 words.
- Discussion points are embedded throughout at moments of tension — not at the end
- Stop at each 💬 prompt and let the group respond before continuing
- Write prose that reads naturally aloud — good transitions, natural pauses
- Each 💬 prompt must open conversation, not produce yes/no answers
- Connect the text to lived experience the group can discuss
- Practical application emphasized throughout
- Rabbi Road should produce at least one 💬 prompt worth arguing about
- Tone: collegial, as if the leader and group are discovering together`,

    youth: `AUDIENCE: Youth (teenagers)
This study is for teens. Write accordingly.
TARGET LENGTH: main body ~900-1000 words.
- Contemporary illustrations and analogies throughout — make the ancient feel present
- Shorter sections, direct sentences, active voice
- Questions that connect honestly to teenage experience — school, relationships, identity
- Define terms but never condescend — teens recognize patronizing tone immediately
- Rabbi Road should feel like an unexpected discovery, not a detour
- Energy and directness. The scribe's observations should feel urgent, not historical
- Discussion questions should be ones teens would actually argue about`
  }

  const studyTypeInstructions = {
    passage: `STUDY TYPE: Passage Study
Work through the passage verse by verse or section by section.
Ground every observation in the text itself. Let the commentators
illuminate what is actually there. At the close, Rabbi Road follows the
single highest-ranked verified cross-reference and reveals something the
straight reading misses. Format: flowing prose with clear sections.`,

    word: `STUDY TYPE: Word Study
This study centers on a single word or concept across Scripture.
- Open with the word in its original language — Hebrew or Greek — with
  pronunciation in brackets: *nephesh* [neh'-fesh]
- Trace the word through its key uses across the canon, showing how
  meaning develops and deepens
- Adam Clarke's attention to language should be surfaced prominently
- Show where the word appears in the passage under study and what
  it reveals that a surface reading misses
- Rabbi Road, at the close, follows the word to its highest-ranked
  cross-reference and returns with what that connection illuminates
- Strong's entry is provided — use it as the foundation, not the ceiling`,

    character: `STUDY TYPE: Character Study
This study follows a biblical figure — their arc, their failures,
their faith, their significance.
- Open with who this person is and why they matter
- Follow the biographical arc: background, key moments, turning points
- Barnes' Notes on character passages should be surfaced naturally
- Show what this person's life reveals about God's character and purposes
- Rabbi Road, at the close, follows the highest-ranked cross-reference,
  connecting this figure to another part of the story they may not
  have known they were part of
- Discussion questions should press into what the character's choices
  reveal about human nature and divine grace`,

    topical: `STUDY TYPE: Topical Study
This study synthesizes what Scripture says about a theme or doctrine
across multiple passages.
- Do not work verse by verse — synthesize thematically
- Open with the topic's scope: where it appears, why it matters, what
  the stakes are for getting it right
- Nave's Topical Bible connections should inform the passage selection —
  use the provided Nave's data to ground the study in its canonical breadth
- Calvin's Commentaries press into the text with characteristic directness —
  his pastoral concern for right doctrine never divorced from the life of the church
- Show where the tradition agrees and where it has genuinely debated
- Rabbi Road, at the close, follows the topic to its highest-ranked
  cross-reference, a passage that reframes it in an unexpected way
- The study should feel like a guided tour through the whole Bible's
  treatment of this theme, not a commentary on one passage`,

    book: `STUDY TYPE: Book Overview
This study walks through an entire biblical book via its structural hinge
points — the chapters where the book's actual shape turns. You are given
these hinge chapters and real commentary on each. Do not treat this as a
single passage; move through the hinges in canonical order, showing how
each connects to the next and what the movement across all of them reveals
about the book as a whole.
- Open with the book's occasion and overall shape (how many parts, where
  they divide) — one clear paragraph, not a lecture
- Walk the hinge chapters in order. For each: what happens, what it reveals,
  how it connects to the hinge before it. This is the spine of the study.
- Identify the book's major theological thread running through all hinges
- Show where this book fits in the larger biblical story
- Discussion questions should help readers know what to look for
  when they read the full book themselves`,

    devotional: `STUDY TYPE: Morning Trail Devotional
GRADE LEVEL: 9th grade maximum. One idea. Lands completely. No loose threads.

CRITICAL — READ FIRST:
This output must stop after the closing prayer and the line
"Sit with that for a moment before the day begins."
DO NOT generate a Rabbit Trail. DO NOT generate Rabbi Road.
DO NOT generate What's Over the Hill. DO NOT generate any
section after the closing prayer. The devotional ends with
the prayer and that one closing line. Nothing else follows.

This is not a study. This is a morning encounter with the text.
The reader has five minutes and a cup of coffee. Serve them well.

INPUT: The user may provide a scripture passage, a biblical
character name, a theological theme, or a single word.
- If a scripture passage is given: use it directly as the KEY VERSE
- If a character name is given (e.g. "Mary Magdalene", "Elijah"):
  select the single most fitting verse that captures their story
  or a defining moment, quote it as the KEY VERSE, then write
  the devotional around that character and verse together
- If a theme or word is given (e.g. "Grace", "Suffering", "Rest"):
  select the single most fitting anchor verse for that theme,
  quote it as the KEY VERSE, then write the devotional around
  that theme
Never tell the user you are choosing a verse — just choose it
and begin. The KEY VERSE should feel inevitable.

STRUCTURE — four sections, no headers, flowing:

1. KEY VERSE
   Format exactly as:
   >>SCRIPTURE
   *"quoted text"*
   **Reference**
   >>END
   Quote one to three verses directly from the specified translation.
   Let it breathe. This is the ONLY scripture quote in the devotional.

2. THE MOMENT (ONE paragraph only — not two)
   What is actually happening in this passage, and what it means for
   someone reading it this morning, woven into a SINGLE paragraph, not
   two separate ones. Do not restate the same insight twice in
   different words — say it once, well, and move on.

   If a real commentary source is provided below, quote it directly,
   in this exact format, placed naturally within or right after your
   paragraph:
   >>COMMENTARY
   **Scholar Name**
   "Direct words from the source, one sentence, no more."
   >>END
   This must be the SOURCE'S actual words, not your paraphrase of
   their position. If no real source material is provided below for
   this passage, do not name a scholar at all — write the paragraph
   without any commentary attribution rather than inventing what a
   scholar "would have said."

3. A QUESTION TO CARRY
   One sentence. Italicized. Not a discussion question — a carrying
   question. Something that walks with the reader into the day.

4. CLOSING PRAYER (2-3 sentences — not 4-5)
   Honest. Specific to this passage. End naturally, no "Amen."
   After the prayer, on its own line:

   *Sit with that for a moment before the day begins.*

TONE: Warm. Unhurried. Honest about difficulty without being heavy.
Say each real thing ONCE. Do not circle back to restate an idea you
already made in different words — this is the most common way these
devotionals run long without adding value.

STRICT LIMITS — no exceptions:
- Total length: 180-250 words maximum, INCLUDING the scripture quote.
  This is shorter than earlier drafts required — tested real output
  showed 300-400 words reads as long even when technically in range,
  because restating the same insight across multiple paragraphs pads
  length without adding value. One tight paragraph beats two loose ones.
- Exactly ONE scripture quote (the key verse), ONE commentary quote
  if real source material exists (none if it doesn't) — never more
- NO Rabbit Trail
- NO Rabbi Road
- NO What's Over the Hill
- NO Historical/Cultural Context section
- NO sources footer
- NO section headers anywhere — flowing prose only
- NO bullet points anywhere
- ONE scholarly voice maximum, named once, briefly
- KEY VERSE is the only formatted element

This devotional must complete fully within its token budget.
It should leave the reader with one thing: a question worth
carrying and a moment of having actually encountered the text.`
  }

  let strongsContext = ''
  if (strongsData) {
    if (strongsData.hebrew) {
      const h = strongsData.hebrew
      strongsContext += `\nKEY HEBREW TERM: *${h.trans}* [${h.pron}] (H${h.num}) — ${h.brief}`
    }
    if (strongsData.greek) {
      const g = strongsData.greek
      strongsContext += `\nKEY GREEK TERM: *${g.trans}* [${g.pron}] (G${g.num}) — ${g.brief}`
    }
  }

  // NOTE (v16): commentaryLines/patristicLines/strongsLine/xrefLine below
  // still list everything FETCHED, and are still handed to the model as
  // context (so it knows what real material is available to draw from).
  // This is different from the sources FOOTER: the footer is no longer
  // written by the model at all -- see buildHonestSourcesFooter(), called
  // after the stream completes, using only what the text actually used.
  const sourceFullNames = {
    'Matthew Henry (MH)':               "Matthew Henry's Commentary on the Whole Bible (public domain; digital text from lyteword/mhenry-complete; printed edition not identified)",
    'Jamieson-Fausset-Brown (JFB)':     'Jamieson, Fausset & Brown Commentary, 1871',
    'Adam Clarke (AC)':                 "Adam Clarke's Commentary on the Bible, 1826",
    "Barnes' Notes (BN)":               "Barnes' Notes on the Bible, 1834",
    'Scofield Reference Notes (SR)':    'Scofield Reference Notes, 1917',
    "Spurgeon's Treasury of David (SP)":'Spurgeon, Treasury of David, 1885',
    'Augustine of Hippo (354-430 AD)':  'Augustine of Hippo, 354-430 AD',
    'John Chrysostom (347-407 AD)':     'John Chrysostom, 347-407 AD',
    'Thomas Aquinas (1225-1274 AD)':    'Thomas Aquinas, 1225-1274 AD',
    'Jerome (347-420 AD)':              'Jerome, 347-420 AD',
    "Calvin's Commentaries (CC)":       "Calvin's Commentaries, 1844-1856 (English translation)",
    "Nave's Topical Bible (NT)":        "Nave's Topical Bible, Orville J. Nave, 1896",
      "Easton's Bible Dictionary (EBD)":  "Easton's Bible Dictionary, M.G. Easton, 1897",
      "Vincent's Word Studies (VWS)":     "Marvin Vincent, Word Studies in the New Testament, 1887",
      "Meyer's NT Commentary (MEY)":      "Heinrich Meyer, Critical and Exegetical Commentary on the NT, 1832",
  }

  // v24: same split as buildHonestSourcesFooter() -- Tyndale Open Study
  // Notes is CC BY-SA 4.0, not public domain, so it can't be listed
  // under "Protestant Commentaries (Public Domain)" even in the prompt
  // context shown to the model itself.
  const TYNDALE_LABEL_FOR_PROMPT = 'Tyndale Open Study Notes (TSN)'
  const promptPublicDomainCommentaries = (commentaries || []).filter(c => c.label !== TYNDALE_LABEL_FOR_PROMPT)
  const promptTyndale = (commentaries || []).filter(c => c.label === TYNDALE_LABEL_FOR_PROMPT)

  const commentaryLines = promptPublicDomainCommentaries.length > 0
    ? `**Protestant Commentaries (Public Domain)**\n${promptPublicDomainCommentaries.map(c =>
        `- ${sourceFullNames[c.label] || c.label}`).join('\n')}`
    : ''

  const tyndaleLine = promptTyndale.length > 0
    ? `**Modern Study Notes (CC BY-SA 4.0 -- not public domain, attribute clearly)**\n- Tyndale Open Study Notes, © Tyndale House Publishers`
    : ''

  const patristicLines = patristics && patristics.length > 0
    ? `**Church Fathers**\n${patristics.map(c =>
        `- ${sourceFullNames[c.label] || c.label}`).join('\n')}`
    : ''

  const strongsLine = strongsData
    ? `**Original Language**\n- Strong's ${strongsData.hebrew ? 'Hebrew' : 'Greek'} Lexicon (Public Domain)`
    : ''

  const xrefLine = crossRefs && crossRefs.length > 0
    ? `**Cross-References**\n- OpenBible.info cross-reference dataset (CC-BY, ranked by scholarly consensus)`
    : ''

  // DECISION finalized tonight: General and Deeper Study skip embedded
  // discussion points entirely -- Deeper's own instructions already say
  // "trust the reader... without hand-holding," which directly conflicts
  // with interruption prompts; General benefits from the same
  // uninterrupted flow. Small Group, Youth, and New Believers keep them
  // -- that's genuinely their design (a leader pausing a room, teens who
  // argue, skeptics who need open questions), not an oversight to fix.
  const includeDiscussionPoints = !['general', 'deeper'].includes(audience)
  const embeddedDiscussionSection = includeDiscussionPoints ? `EMBEDDED DISCUSSION POINTS — for small group and discussion use:
Do not place discussion questions as a separate section at the end.
Instead, weave 4-5 brief discussion prompts throughout the study
at natural moments of tension, surprise, or genuine uncertainty in the text.
Place them where a thoughtful teacher would naturally pause the group.
Mark each with 💬 on its own line, followed by one or two sentences.
The prompt should create productive tension — not resolve it.
The study continues immediately after each 💬 prompt.
Make them incisive. Make them the kind of question a group would
actually argue about. Examples of the register:
  💬 Is Abraham telling the truth here? In what sense might "God will
     provide the lamb" be both false and the most truthful thing he has
     ever said?
  💬 What does it mean that the ram was behind Abraham — present all
     along, but visible only after faith moved him to the edge?
  💬 The Leviticus pattern requires the offerer to perform the sacrifice
     himself. What changes in your reading of Abraham when you hold
     that detail?
These appear throughout — after a key verse, after a scholar's observation,
after a supporting cross-reference is woven in, after Rabbi Road completes.
Solo readers move past them naturally. Group leaders stop at them.` : `DISCUSSION POINTS: none for this audience -- write flowing, uninterrupted
prose instead. Do not include any 💬 markers anywhere in this study.`

  let prompt = `You are a scholarly Bible study author for RabbiRabbit.

VOICE: Scholarly but direct — warm through engagement, not reassurance.
Write as a trusted professor who respects the reader's intelligence.
Register: C.S. Lewis or N.T. Wright in popular writing — clear, substantive,
never cold, never condescending, never hand-holding. Challenge the reader
with honest questions rather than softening hard truths. Warmth expressed
through the depth of engagement, not cushioning. Ecumenical, no denominational
bias. Follow broad scholarly consensus. Never invent details.

GRADE LEVEL TARGETS — strictly observed per audience:
- Morning Trail devotional: 9th grade. Accessible, clear, one idea lands completely.
- New Believers: 10th grade. Define every term. Narrative before theology.
- General Adult: 11th grade. Assume literacy, not theological training.
- Small Group: 10th-11th grade. Must read naturally aloud across a range of people.
- Youth: 8th-9th grade. Direct, contemporary, no condescension.
- Deeper Study: No ceiling. Full scholarly engagement, trust the reader.

${studyTypeInstructions[studyType] || studyTypeInstructions.passage}

${audienceInstructions[audience] || audienceInstructions.general}

${trailContext ? `TRAIL CONTINUITY — IMPORTANT:
The reader has just come from a previous study that ended with this:
"${trailContext}"
Open this study by picking up that thread naturally in your first paragraph.
Reference where they have just been before moving into this new territory.
The reader should feel the journey continuing, not starting over.
` : ''}SUBJECT: ${primaryInput}
TRANSLATION: ${transMap[translation] || 'World English Bible Updated (WEB)'}
${translation === 'bsb' ? 'NOTE: BSB is a modern transparent translation reflecting Greek/Hebrew closely. Quote it exactly as provided. Capitalize pronouns for God (He, Him, His).' : ''}${scriptureSupply ? scriptureSupply.promptBlock : ''}
${character ? `CHARACTER FOCUS: ${character}` : ''}${theme ? `THEME: ${theme}` : ''}
${additionalVerses ? `SUPPORTING VERSES: ${additionalVerses}` : ''}
${sectionList ? `ADDITIONAL SECTIONS REQUESTED: ${sectionList}` : ''}
${notes ? `LEADER NOTES: ${notes}` : ''}
${strongsContext}

${overviewMap ? `
BOOK OVERVIEW DATA — this book's actual structure:
Total chapters: ${overviewMap.totalChapters}
Structural shape: ${overviewMap.structure}
Scope: ${overviewMap.scope.toUpperCase()}

Hinge chapters to walk through, in order:
${overviewMap.keyChapters.map((kc, i) => `${i + 1}. Chapter ${kc.ch} — ${kc.label}`).join('\n')}

${overviewMap.scope === 'large' ? `SCOPE INSTRUCTION — LARGE BOOK (${overviewMap.totalChapters} chapters):
This is a genuine flyover, and the study must say so honestly. After walking
the hinge chapters, explicitly acknowledge that this is a survey of key
turning points, not exhaustive coverage — a book this size deserves its own
dedicated passage studies for each section. The tone should feel like a
guide pointing at the mountain range from a good vantage point, not
claiming to have hiked every trail. Over the Hill should explicitly invite
the reader to continue with a passage study on one specific hinge chapter
that most rewards deeper attention — name it directly.` : ''}
${overviewMap.scope === 'medium' ? `SCOPE INSTRUCTION — MEDIUM BOOK (${overviewMap.totalChapters} chapters):
This overview covers the book's real shape well but is still a guided
walk through hinges, not full chapter-by-chapter coverage. The reader
should feel they've grasped the whole book's argument. Over the Hill can
point either to a deeper passage study within this book or to a connected
book/theme.` : ''}
${overviewMap.scope === 'small' ? `SCOPE INSTRUCTION — SMALL BOOK (${overviewMap.totalChapters} chapters):
At this length, walking the hinge chapters IS walking nearly the whole
book. The reader should feel the task is genuinely complete — this study
should stand on its own as a full grasp of the book, not a preview of
something bigger. Over the Hill should point outward — to a connected
book, theme, or cross-reference — not back into this book, since there is
little left uncovered here.` : ''}
` : ''}
FORMAT: # title, ## sections, ### sub-labels (uppercase),
**bold** key terms and verse refs, *italic* original language terms,
flowing prose throughout. No bullet points in the main body —
prose only except for embedded discussion points.

ACCURACY: Never state specific numerical claims — chapter counts, year spans,
distances, dates, quantities — unless they appear explicitly in the provided
source material or are universally established facts (e.g. the number of
psalms, the number of disciples). Use narrative language when precision
cannot be verified: "across the preceding chapters" not "across thirty-seven
chapters", "years of waiting" not "twenty-five years". Invented precision
undermines the entire study.

PRONUNCIATION: When introducing any Hebrew or Greek term for the
first time, include its pronunciation in brackets immediately after:
*nephesh* [neh'-fesh], *lógos* [log'-os], *agápē* [ag-ah'-pay].
Use only pronunciations from the provided Strong's data.
Never invent a pronunciation.

TOKEN BUDGET: This study has a 5000 token budget. Your main body target
length is stated above under AUDIENCE — that target already accounts
for the full budget below and leaves real margin; honor it rather than
writing toward "as much as fits." Beyond the main body:
- Optional sections if selected (context, character): ~350 tokens total.
  Be concise. 150-180 words maximum per optional section.
- Rabbi Road + Over the Hill: ~350-400 words total (roughly 200-250 for
  Rabbi Road, 120-150 for Over the Hill's shorter format). These are
  non-negotiable and PROTECTED — if the main body is running long,
  tighten the main body's prose, never these two closing sections.
- Embedded discussion points: ~150 tokens woven throughout.
CORRECTED tonight: earlier drafts told Deeper Study "no ceiling" while
every audience shared the same fixed 5000-token wall -- a direct,
confirmed contradiction and a real cause of cutoffs. Every audience
above now has its own real, bounded main-body target instead.

DO NOT REPEAT YOURSELF -- say each real thing once. Do not restate an
observation already made, in different words, later in the study --
across sections OR within the same section. This is the single most
common way a study runs long without adding proportional value, and it
directly eats into the room Rabbi Road and Over the Hill need to
complete. (This principle was already proven necessary for the
Devotional format; it applies here for the same reason.)

SECTION WORD LIMITS — strictly observed:
- Historical/Cultural Context: 180 words maximum.
- Character Focus: 180 words maximum.
- Life Application: 130 words maximum. Use 2-3 points in bullet or
  brief story form. No more than 3 points.
- Prayer: 100 words maximum. One focused prayer only.
- Main body: see your audience's TARGET LENGTH above -- a real target,
  not an open invitation to write at length.
- Rabbi Road: ~200-250 words. Over the Hill: ~120-150 words (its own
  format is already short: two formatted lines plus one short paragraph).

${embeddedDiscussionSection}

STRUCTURE — follow this order exactly, top to bottom:
1. # Title, then an OPENING that establishes what this study is about —
   the passage, word, character, or topic — moving directly into the
   FULL teaching: verse-by-verse or thematic development, >>SCRIPTURE
   and >>COMMENTARY blocks, scholarly synthesis, embedded discussion
   points if this audience uses them. This is the bulk of the study.
   If SUPPORTING CROSS-REFERENCES are listed below, weave a brief,
   natural mention of one or two of them into this development where
   they genuinely illuminate the text — a sentence or two, in plain
   prose, no special heading and no mandatory citation-line format.
   Only ever name a reference that actually appears in that list; never
   invent one. It is fine to use none of them if nothing fits naturally.
2. ## 🕍 Rabbi Road — placed after the main teaching is complete. See
   the Rabbi Road rules below.
3. ## 🐇 What's Over the Hill — the final section. See the rules below.
There is no separate "Rabbit Trail" section in this format — do NOT
create a section with that title. Do NOT place Rabbi Road or Over the
Hill anywhere but at the very end, in that order.

REQUIRED — both of the following are mandatory, positioned per the
STRUCTURE above:
## 🕍 Rabbi Road
MANDATORY CONSTRAINT, not a preference: the passage this section brings
the reader to MUST be the exact reference reserved below under VERIFIED
CROSS-REFERENCE — the single highest-ranked connection for this
passage. Do not substitute a connection from memory or general
theological association, no matter how illuminating it seems.

Begin with this exact citation line, so the actual reference used is
stated plainly and auditable:
**Returning by way of [exact reference reserved below]:**

Then bring the reader to that passage and show what it reveals that a
straight reading of the original text would have missed — a genuinely
substantive angle, not a restatement of the main body. Land enriched.
Place one 💬 discussion prompt at the end of Rabbi Road.
## 🐇 What's Over the Hill
${secondHopCrossRefs && secondHopCrossRefs.length > 0 ? `MANDATORY CONSTRAINT, same shape as Rabbi Road's: the passage named
here MUST be one of the exact references listed under SECOND-HOP
OPTIONS FOR OVER THE HILL below. These are real, fetched cross-
references FROM Rabbi Road's own destination -- one real hop further
out, not invented, and never the passage this study opened with.
Choose whichever of them most naturally continues the thread this
study opened.` : `No second-hop cross-reference data was available for this study --
choose a genuine, specific next passage based on the actual thread this
study opened (never the passage this study opened with), and be honest
in tone rather than falsely certain.`}

Open with two formatted lines:
**[Theme Title in 3-5 words]**
*[Exact scripture reference]*

Then one short paragraph picking up the thread naturally — what this study
opened, what question it left unresolved, why the named passage is the next
step. Be specific enough that a reader could enter that passage next and feel
the thread connecting the two studies. Do not gesture vaguely; point precisely.
End with a single sentence invitation: "The trail leads there."
This is the door to the next expedition. Leave it open, not ajar.

CRITICAL: Rabbi Road and What's Over the Hill are NON-NEGOTIABLE. They
must always appear and always complete. Condense the main body before
cutting either of these two closing sections.

QUOTE HIERARCHY — STRICT FORMULA, follow exactly, no deviation:

Three distinct block types exist. Each has ONE exact format. Do not mix
them, do not improvise variations. The reader's ability to trust what
they're reading depends on this being followed precisely every time.

LEVEL 1 — SCRIPTURE (highest authority):
Exact format, every time, no exceptions:
>>SCRIPTURE
*"quoted text exactly as given in the source translation"*
**Reference** (e.g. **John 3:16**)
>>END

Never paraphrase scripture. Never quote it without this exact wrapper.${scriptureSupply && scriptureSupply.ok ? '\nThis study has SCRIPTURE TEXT supplied above: copy every >>SCRIPTURE block from it exactly, and quote nothing else.' : ''}
Never bury a scripture quote inside a paragraph — it always gets its
own >>SCRIPTURE block.

LEVEL 2 — COMMENTARY QUOTE (secondary authority — real source material):
MANDATORY, BINARY RULE — not a judgment call:
Any time you name a specific scholar (Matthew Henry, Calvin, Barnes,
JFB, Augustine, Aquinas, or any other provided source) and state their
position, observation, or argument, that ENTIRE statement — the whole
sentence or two containing their view — MUST be wrapped in this exact
format:
>>COMMENTARY
**Scholar Name** (e.g. **Matthew Henry**)
"Their words or a close paraphrase, 1-3 sentences maximum."
>>END

This applies REGARDLESS of whether you consider it a direct quote or a
paraphrase. The test is simple and has no exceptions: did you write a
sentence that names a scholar and attributes a specific view to them?
If yes, it goes in a >>COMMENTARY block. There is no third category of
"named attribution that stays as plain prose." Sentences like
"Matthew Henry observes that..." or "Calvin presses into this..." or
"Tertullian understood this as..." are EXACTLY the sentences this rule
requires wrapping — writing them as ordinary prose instead of inside
>>COMMENTARY is the single most common way this format fails, and it
has been directly confirmed to fail this way in real testing. Do not
let a named attribution slip into Level 3 synthesis just because it
feels like connective writing rather than a "quote" — naming a scholar
and describing their view IS the trigger, not the presence of quotation
marks.

If you cannot recall the source's specific words closely enough to
quote or closely paraphrase them, do not name them at all — describe
the idea generally without attribution rather than naming a scholar
outside the required format.

Only use this when genuine source material from the sources provided
below is being surfaced. Never use it for your own synthesis. Never
invent a scholar's words — only what the provided text actually says.

CRITICAL — DO NOT NAME A SOURCE YOU ARE NOT ACTUALLY QUOTING FROM:
Only name and attribute a view to a source that is provided to you
below under PROTESTANT COMMENTARIES, CHURCH FATHERS, or HINGE CHAPTER
COMMENTARIES. Never name a source (Calvin, a Church Father, or any
other scholar) unless real material from them appears in this prompt.
This is not a stylistic preference -- a study that lists or implies a
source it never actually drew from is a confident wrong answer, exactly
the failure mode this app exists to avoid.

LEVEL 3 — SYNTHESIS (your own connective writing):
Regular flowing prose. NO wrapper, NO markers, NO attribution.
This is the space between Scripture and Commentary blocks — your own
observations, transitions, and connections. It should read naturally
and invisibly, never labeled as "synthesis" or referred to as your
own voice. Just write plainly.

CRITICAL: Every >>SCRIPTURE and >>COMMENTARY block MUST be closed with
>>END on its own line immediately after. This is how the reader's
display distinguishes authoritative quotation from your own writing.
Never leave a block unclosed. Never nest one inside another.

SOURCE-FIRST DISCIPLINE — the single most important structural rule:
The commentators are the teachers. You are the host. Your prose exists
for three purposes only, each with a strict word budget:

  1. INTRODUCE the next source (2-4 sentences): name the voice, say
     what question or angle they bring, why their perspective matters
     here. Do NOT summarize what they are about to say — introduce
     the voice, then let them speak.
  2. BRIDGE between sources (1-3 sentences): name what the previous
     source just revealed and what remains unresolved. Then introduce
     the next voice. That is all.
  3. OPEN or CLOSE a section (3-5 sentences maximum): orient the
     reader to the passage or draw the thread closed after the last
     source has spoken.

NEVER explain what a commentator just said in your own words after
their >>COMMENTARY block closes. If they said it well, the next
sentence is either a bridge to the next voice or a >>SCRIPTURE block.
Trust the reader to have read the quote.

NEVER summarize a source's position before quoting them. The sequence
is always: [your 2-4 sentence introduction] → [>>COMMENTARY block].
Never: [your summary of their view] → [>>COMMENTARY confirming it].

QUOTE LENGTH: when source material below is substantive, quote 3-6
sentences from it rather than 1 sentence plus your explanation of the
rest. The reader came to hear these voices, not your description of
them. A study with six real 4-sentence commentary blocks and thirty
words of AI framing between each is better than a study with six
1-sentence quotes surrounded by AI explanation.

MINIMUM SOURCE REQUIREMENT — non-negotiable:
Every study must include >>COMMENTARY blocks from AT LEAST TWO
distinct named sources where the fetched material below contains
real scholarly prose. One source tagged is never sufficient. If
Matthew Henry is used, at least one other provided source MUST
also appear in its own named >>COMMENTARY block. Satisfying this
with a single voice and synthesis prose around it is a failure.

For CHARACTER STUDIES specifically: Barnes' Notes is the
designated secondary source and must appear in its own >>COMMENTARY
block if Barnes content is provided below. Adam Clarke is also
fetched for character studies and must appear if his content is
provided below. Barnes brings careful textual and geographical
grounding; Clarke brings original language and narrative structure
analysis. Henry, Barnes, and Clarke cover three distinct angles —
pastoral, textual, and linguistic. All three must appear if their
content is provided below. Do not collapse three voices into one
source with synthesis filling the rest.

YOUR TOTAL PROSE across the entire main body should not exceed 20-25%
of the word count. The commentators write the study. You curate it.

VOICE REGISTERS — how each source actually moves. Read these before
you encounter the source texts below, so you know what temperament
and method each voice brings to the passage:

PROTESTANT COMMENTARIES:

Matthew Henry (1662-1714): Pastoral and applicational. Moves from
doctrinal observation directly to the reader's own condition in every
paragraph. Structures argument as observation → doctrine → use.
Warm without being soft. Always presses toward a question the reader
must answer about themselves. Introduce him when the passage needs
to land in the reader's life, not just their mind.

Adam Clarke (1762-1832): Philological and argumentative. Goes to
the Greek or Hebrew first, every time. Will name and correct other
interpreters by their position if not by name. His warmth is
intellectual — he gets excited about what the text actually says
versus what people have assumed it says. Introduce him when a word
or phrase needs its original meaning recovered or a common reading
needs to be tested against the actual language.

John Wesley (1703-1791): Compressed and urgent. Wrote short by
conviction — he wanted working people to read these notes between
shifts. Every sentence moves. No ornamentation. The pastoral concern
is always the movement from hearing to believing to living it today,
not tomorrow. Introduce him at moments of decision or delay — when
the passage is calling for a response and the reader might defer it.

Charles Spurgeon (1834-1892): Literary, dramatic, image-driven.
Builds pictures before arguments. The emotional register is high but
never manipulative — the emotion comes from the weight of the thing
being described. Longest sentences in the Protestant stack, and the
most memorable. Introduce him when the passage has an image or a
paradox that deserves to be opened up rather than explained. One
Spurgeon paragraph can do what three paragraphs of analysis cannot.

Albert Barnes (1798-1870): Careful, textual, irenic. Defines terms
before using them. Notes where debate exists without always resolving
it with force. The most reference-like voice — useful for anchoring
a claim precisely or noting what a word rules out. Introduce him
when a technical definition or a note on interpretive range is needed
before the more applicational voices can be heard.

Jamieson, Fausset & Brown (1871): Comprehensive and measured. Three
voices producing a formal collaborative tone — thorough without being
distinctive. Best for summary statements and for noting where the
tradition converges. Introduce them when you want to establish what
the broad Reformed scholarly consensus holds before a more individual
voice presses further or dissents.

C.I. Scofield (1843-1921): Note-style and framework-driven. Defines
terms within their dispensational context and cross-references
precisely. Does not build paragraphs — annotates. Most effective as
a brief definitional insert or a clarifying note on how a term
functions across the biblical framework. Introduce him for a precise
term definition or a dispensational structural observation, then move
on — he is not a sustained narrative voice.

Calvin (1509-1564): Logical, austere, relentless. Builds arguments
and will not let a soft interpretation stand without pressing it.
His warmth is real but comes through the seriousness of what he
believes is at stake. Introduce him when a point needs to be driven
to its conclusion without softening, or when the passage has an edge
that other commentators have smoothed over too quickly. Best used
after gentler voices have established the ground — Calvin presses
what they opened.

CHURCH FATHERS:

Augustine of Hippo (354-430 AD): Confessional and searching, moving
between second and first person mid-thought. Argues with himself and
with the reader simultaneously. Emotional register is high but
grounded in precise theological reasoning. His homilies have a
sermonic warmth his systematic works lack — he is preaching, not
just writing. Introduce him when the passage needs to press the
reader toward personal reckoning. He closes distance between the
ancient text and the present reader faster than anyone else in this
stack.

John Chrysostom (347-407 AD): Rhetorical and confrontational — the
greatest preacher of the ancient church. Asks questions directly of
the reader, answers them, then asks harder ones. Urgent without being
anxious. Shames despair and complacency equally. Introduce him when
the study needs to name an obstacle the reader is hiding behind and
remove it publicly. His voice raises the stakes of the passage in a
way that is hard to ignore.

Jerome (347-420 AD): Precise, polemical, textually exacting. Always
on the exact word and what it rules out as much as what it affirms.
Not warm in the way Augustine is, but not cold — he cares intensely
about getting it right because he thinks getting it wrong destroys
souls. Introduce him when a term needs to be defined against a common
misreading, or when a translation choice has real theological weight
that deserves to be named plainly.

Thomas Aquinas (1225-1274 AD): Structured and scholastic — thinks
in distinctions. Will number the elements of a passage before
examining any of them. The voice is impersonal in the sense that it
subordinates personality to precision, but the precision reveals deep
care. Not a preacher's voice — a teacher's. Introduce him when a
complex passage needs its components separated cleanly before they
can be synthesized. Best used when the reader needs to understand
a structure before they can feel its weight.

Cyril of Alexandria (376-444 AD): Christological and precise, shaped
by the Nestorian controversy. Always has one eye on what the text
means for the doctrine of Christ — who exactly it was that came, and
why it had to be that one and no other. Formal but not cold; the
doctrinal precision is in service of deep devotional conviction.
Introduce him when the passage touches on the person of Christ or
the meaning of the Incarnation — he will not let the reader reduce
Jesus to a teacher or an example.

Bonaventure (1221-1274 AD): Contemplative and structured around
spiritual ascent — a Franciscan mystic as much as a scholastic
theologian. Moves the reader through stages of meditation rather than
argument alone. Warmer than Aquinas, more imagistic. Introduce him
when the study is devotional in orientation or when the passage
invites the reader into an interior movement rather than an
intellectual conclusion. His voice follows Aquinas well — Aquinas
separates; Bonaventure ascends.

Tertullian (155-220 AD): Polemical and prosecutorial — a lawyer
before a theologian, and it never left him. Argues against named
positions, builds his case methodically, delivers verdicts. Sharp
and sometimes severe, but always in service of protecting something
he believes is essential. Introduce him when the study needs to hold
two truths in tension that are tempting to resolve too easily —
love and judgment, grace and justice, mercy and holiness. He will
not let one swallow the other.

Ephrem the Syrian (306-373 AD): Poetic and imagistic — wrote in
verse, and his theological insight comes through image and paradox
rather than argument. Unlike any other voice in this stack. Use
sparingly: one Ephrem image placed deliberately after sustained
argument lands with singular force. More than one per study and it
becomes a mannerism. Never use for sustained prose exposition —
use for a single lyrical crystallization at the close of a section,
where the image says what the reasoning left unsaid.

CRITICAL — ONLY NAME A SOURCE THAT IS ACTUALLY PROVIDED BELOW:
Only name and quote from a source whose text appears in this prompt
under PROTESTANT COMMENTARIES, CHURCH FATHERS, or HINGE CHAPTER
COMMENTARIES. Never name a source (Calvin, a Church Father, or any
other) unless their real material appears below. A study that claims
a voice it never actually drew from is a confident wrong answer —
the exact failure this app exists to prevent. If a source's text
was not fetched for this passage, that voice is simply absent from
this study. Acknowledge the absence honestly if it matters; do not
fill it with invented paraphrase dressed as that voice.

Quote scripture directly in the specified translation.
Where sources agree, name the consensus briefly and move on.
Where they differ honestly, name the disagreement and let the
reader sit with it — do not resolve every tension artificially.

DO NOT WRITE A SOURCES FOOTER: a real, honest sources footer listing
only the sources this study actually used is generated automatically
after your response completes. Do not write "### Sources Consulted" or
any "---" divider, and do not write a bibliography of any kind. End
your response after What's Over the Hill's closing "The trail leads
there." sentence — nothing follows it.

Start directly with the # title.
End immediately after What's Over the Hill's closing sentence.`

  if (crossRefs && crossRefs.length > 0) {
    const [topRef, ...remainingRefs] = crossRefs

    prompt += `\n\nVERIFIED CROSS-REFERENCE reserved for Rabbi Road's own citation
(the single highest-ranked connection for this passage — OpenBible.info,
ranked by scholarly consensus):\n${topRef}\n`
    prompt += `\nRabbi Road MUST cite this reference explicitly, in this format,
as part of bringing the reader back:
**Returning by way of ${topRef.replace(/\s*\(\d+\s*votes?\)\s*$/i, '')}:**`

    if (remainingRefs.length > 0) {
      prompt += `\n\nSUPPORTING CROSS-REFERENCES (OpenBible.info, ranked by scholarly
consensus) -- optional. Weave a brief, natural mention of one or two of
these into the main teaching ONLY if they genuinely illuminate the text.
Never use these for Rabbi Road or Over the Hill, and never invent a
reference not on this list:\n`
      remainingRefs.forEach((ref, i) => { prompt += `${i + 1}. ${ref}\n` })
    }
  }

  if (secondHopCrossRefs && secondHopCrossRefs.length > 0) {
    prompt += `\n\nSECOND-HOP OPTIONS FOR OVER THE HILL (OpenBible.info, fetched
FROM Rabbi Road's own destination -- a real second hop, not invented):\n`
    secondHopCrossRefs.forEach((ref, i) => { prompt += `${i + 1}. ${ref}\n` })
  }

  if (commentaries && commentaries.length > 0) {
    // v24: Tyndale Open Study Notes is CC BY-SA 4.0, not public domain --
    // must not be dumped under the "public domain" header below, and
    // "modernize language" doesn't apply to it (it's already modern
    // prose, not 18th/19th-century English needing translation).
    const TYNDALE_LABEL_FOR_PROMPT_TEXT = 'Tyndale Open Study Notes (TSN)'
    const publicDomainForPrompt = commentaries.filter(c => c.label !== TYNDALE_LABEL_FOR_PROMPT_TEXT)
    const tyndaleForPrompt = commentaries.filter(c => c.label === TYNDALE_LABEL_FOR_PROMPT_TEXT)

    if (publicDomainForPrompt.length > 0) {
      prompt += `\n\nPROTESTANT COMMENTARIES (public domain — blend voices, modernize language, name each voice):\n`
      publicDomainForPrompt.forEach(({ label, text }) => {
        prompt += `\n--- ${label} ---\n${text}\n`
      })
    }

    if (tyndaleForPrompt.length > 0) {
      prompt += `\n\nMODERN STUDY NOTES (CC BY-SA 4.0 — NOT public domain; already contemporary
English, do not "modernize" it further; name the voice as "Tyndale" when used):\n`
      tyndaleForPrompt.forEach(({ label, text }) => {
        prompt += `\n--- ${label} ---\n${text}\n`
      })
    }
  }

  if (overviewCommentaries && overviewCommentaries.length > 0) {
    prompt += `\n\nHINGE CHAPTER COMMENTARIES (public domain — organized by hinge chapter, use to ground each part of the walk-through):\n`
    overviewCommentaries.forEach(({ label, ch, chLabel, text }) => {
      prompt += `\n--- Chapter ${ch} (${chLabel}) — ${label} ---\n${text}\n`
    })
  }

  if (patristics && patristics.length > 0) {
    prompt += `\n\nCHURCH FATHERS (4th-13th century, public domain — surface their voices by name):\n`
    patristics.forEach(({ label, text }) => {
      prompt += `\n--- ${label} ---\n${text}\n`
    })
  }

  return prompt
}

// ═══════════════════════════════════════════════════════════════════
// v14 — first-step free-fetch functions
// Every function marked (TESTED LIVE) was run tonight against real
// GitHub data, not just written — results checked by hand.
// ═══════════════════════════════════════════════════════════════════

async function fetchTopicScores(topic, limit = 3) {                    // (TESTED LIVE)
  const data = await fetchJSON(`${GITHUB_BASE}/dict/openbible_topic_scores.json`)
  if (!data) return null
  const key = topic.toLowerCase().trim()
  if (data[key]) return data[key].slice(0, limit)
  return null
}

async function resolveSharedInput(input, studyType) {
  // FIX (found via real testing): try parsePassage FIRST. A well-formed
  // scripture reference like "Numbers 6:22-27" must never fall through to
  // fuzzy Topic Scores/Nave's matching -- confirmed real bug tonight where
  // "numbers" matched Nave's "er" topic via its substring-match fallback
  // (numb-ER-s), because passage parsing was checked LAST instead of FIRST.
  const directPassage = parsePassage(input)
  if (directPassage) {
    return { input, topicScores: null, navesKey: null, characterRecord: null, anchor: directPassage }
  }

  const [topicScores, navesKey, characterRecord] = await Promise.all([
    fetchTopicScores(input),
    (async () => {
      const data = await fetchJSON(`${GITHUB_BASE}/dict/naves/naves_topics.json`)
      if (!data || !data.index) return null
      const key = resolveNavesTopic(data.index, input)
      if (key === null) return null
      const entry = data.topics[data.index[key]]
      return entry ? { matchedKey: key, entries: entry.entries.slice(0, 5) } : null
    })(),
    (studyType === 'character') ? fetchCharacter(input) : Promise.resolve(null),
  ])

  let anchor = null
  if (characterRecord && characterRecord.passage) {
    anchor = { bookId: characterRecord.passage.bookId, chapter: characterRecord.passage.chapter, verse: null }
  } else if (topicScores && topicScores.length) {
    const top = topicScores[0]
    anchor = { bookId: top.book, chapter: top.chapterStart, verse: top.verseStart }
  } else if (navesKey) {
    const ref = extractFirstReference(navesKey.entries[0] || '')
    if (ref) anchor = ref
  }

  return { input, topicScores, navesKey, characterRecord, anchor }
}

async function fetchHistoricalContext(bookId) {                        // (TESTED LIVE)
  const scofieldFetch = SCOFIELD_BOOKS.has(bookId)
    ? fetchPerBookFile('Scofield', bookId, 1)
    : Promise.resolve(null)
  const clarkeFetch = fetchFromJsonFile('Clarke', bookId, 1)

  const [scofield, clarke] = await Promise.all([scofieldFetch, clarkeFetch])
  const sources = []
  // FIX: only include a source when its chapter-1 content is genuinely a
  // book introduction, not scattered verse-level footnotes that happen
  // to sit in chapter 1. Confirmed real, bounded gap: Scofield lacks a
  // true "Book Introduction" for 6 of 65 books (Judges, Ezra,
  // Ecclesiastes, Lamentations, Matthew, Galatians) -- Matthew's
  // chapter-1 text is genealogy footnotes ("Josias... Six Marys...")
  // that read as confusing and off-topic when surfaced as "historical
  // context" for an unrelated passage like Matthew 8. Clarke has its
  // own, different 7-book gap (Deuteronomy, Song of Solomon, Obadiah,
  // Habakkuk, Zephaniah, Haggai, Malachi). The two gap lists never
  // overlap -- checking each source's own real marker before including
  // it gives honest, complete coverage across all 66 books using only
  // data already hosted, no new source needed.
  if (scofield && scofield.slice(0, 40).includes('Book Introduction')) {
    sources.push({ label: 'Scofield Reference Notes (SR)', text: scofield })
  }
  if (clarke) {
    const head = clarke.slice(0, 60)
    if (head.includes('Preface to') || head.includes('Introduction to')) {
      sources.push({ label: 'Adam Clarke (AC)', text: clarke })
    }
  }
  return sources
}

async function buildFirstStepPreview(input, studyType, chosenStrongsNum, chosenTestament) {
  let anchor = null
  let resolvedVia = null
  let resolved = { topicScores: null, navesKey: null }

  // NEW: once a specific Strong's-numbered word has been chosen, anchor to
  // ITS OWN real occurrence via the concordance -- takes priority over the
  // general shared-resolution path below, same reasoning as the main
  // generation flow's equivalent fix.
  if (studyType === 'word' && chosenStrongsNum) {
    const prefix = chosenTestament === 'Hebrew' ? 'H' : 'G'
    const num = `${prefix}${chosenStrongsNum.replace(/^[HG]/, '')}`
    const occurrences = await fetchWordOccurrences(num)
    if (occurrences && occurrences.length) {
      anchor = { bookId: occurrences[0].book, chapter: occurrences[0].chapter, verse: occurrences[0].verse }
      resolvedVia = 'concordance'
    }
  }

  if (!anchor) {
    resolved = await resolveSharedInput(input, studyType)
    anchor = resolved.anchor
  }

  if (!anchor) {
    return {
      input,
      resolved: false,
      message: "Nothing in Topic Scores, Nave's, Easton's, or direct passage parsing matched this input.",
    }
  }

  const { bookId, chapter, verse, verseEnd } = anchor

  const [scripture, crossRefs, historicalContext] = await Promise.all([
    verse
      ? (verseEnd ? fetchBSBPassage(bookId, chapter, verse, verseEnd) : fetchBSBVerse(bookId, chapter, verse))
      : fetchBSBPassage(bookId, chapter, null, null),
    fetchCrossRefs(bookId, chapter, verse, verseEnd),
    fetchHistoricalContext(bookId),
  ])

  return {
    input,
    resolved: true,
    anchor,
    resolvedVia,
    scripture,
    crossReferences: crossRefs,
    historicalContext,
    topicScores: resolved.topicScores,
    navesEntry: resolved.navesKey,
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

    const url = new URL(request.url)

    // ── /daily-seed — UPDATED, combined-pool version ────────────────────
    // Replaces the old single-dataset version. Same GET endpoint, same
    // contract (same date -> same verse for every user worldwide, no
    // server state, no database) -- only the candidate pool and selection
    // logic changed.
    //
    // TWO REAL BUGS FOUND AND FIXED DURING BUILD (both confirmed via live
    // simulation against the real datasets, not assumed):
    //
    // (1) The pool must be DEDUPLICATED by (book,chapter,verse) before
    // selection. Flattening every topic-score entry naively gives ~73,510
    // raw entries, but the SAME verse appears under many different topics
    // -- confirmed live: John 3:16 alone appeared under 707 different
    // topics, meaning it had roughly a 1-in-100 chance of being the pick
    // on any given day regardless of hash quality. True distinct-verse
    // count is 10,712 (10,258 from topic_scores + 454 genuinely new
    // verses contributed by the xref significance pool -- real,
    // concrete justification for combining both datasets, not just
    // intuition). Every distinct verse gets EQUAL selection weight here.
    //
    // (2) The OLD selection formula (`(dateInt * bigConstant) % poolSize`,
    // inherited from the pre-existing /daily-seed code) is a raw linear
    // multiplicative step applied to a slowly-incrementing input -- it
    // lacks the avalanche property a real hash needs, and produced far
    // more repeat picks than chance alone would (confirmed live: 135
    // duplicates in a 730-day simulation vs. ~4 expected). Replaced with
    // a proper integer-mixing hash (Wang/Murmur3-finalizer style). Re-
    // verified live against the deduplicated pool: 29 duplicates in 730
    // days and 580 in 3650 days, both close to the theoretical random
    // expectation (~25 and ~622) -- healthy, not pathological.
    //
    // Topic-score entries carry a real topic name; xref-pool-only entries
    // don't (a verse can be significant by connection count without a
    // natural topical label) -- `topic` in the response can be null.
    // COMPANION FRONTEND CHANGE NEEDED (not in this file): MorningTrailSeed.jsx
    // currently always renders "Today's theme: {seed.topic}" -- needs to
    // conditionally skip that line when seed.topic is null, rather than
    // showing "Today's theme: null" or similar.
    // ── /clear-devotional-cache — GET, manual cache-clear ──────────────
    // Deletes today's (or a specified date's) cached Morning Trail
    // devotional from KV, forcing the next request to generate fresh.
    // Useful whenever a bad or outdated devotional got cached -- e.g.
    // after fixing a real bug in commentary extraction, today's already-
    // cached devotional would otherwise keep serving the old, wrong
    // version until the cache naturally expired.
    //
    // Deliberately unauthenticated -- the worst case if someone else
    // hits this is "today's devotional regenerates once," which costs
    // one AI call and nothing else. Not worth adding real auth for that
    // level of stakes. Usage: visit or curl the URL directly, optionally
    // with ?date=YYYY-MM-DD to clear a specific day instead of today.
    if (url.pathname === '/clear-devotional-cache') {
      try {
        if (!env.DEVOTIONAL_CACHE) {
          return new Response(JSON.stringify({ error: 'DEVOTIONAL_CACHE binding not configured on this Worker' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const dateParam = url.searchParams.get('date')
        const now = dateParam ? new Date(dateParam) : new Date()
        const cacheKey = `devo:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
        await env.DEVOTIONAL_CACHE.delete(cacheKey)
        return new Response(JSON.stringify({ cleared: cacheKey }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (url.pathname === '/daily-seed') {
      try {
        const dateParam = url.searchParams.get('date')
        const now = dateParam ? new Date(dateParam) : new Date()
        const dateInt = now.getUTCFullYear() * 10000
          + (now.getUTCMonth() + 1) * 100
          + now.getUTCDate()

        const [topicData, xrefPoolData] = await Promise.all([
          fetchJSON(`${GITHUB_BASE}/dict/openbible_topic_scores.json`),
          fetchJSON(`${GITHUB_BASE}/dict/xref_seed_pool.json`),
        ])

        if (!topicData && !xrefPoolData) {
          return new Response(JSON.stringify({ error: 'Seed pool unavailable' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Build ONE combined, DEDUPLICATED, flat candidate pool. Construction
        // order is fixed and deterministic (Object.keys().sort(), then
        // xref_seed_pool.json's already-canonical-order array) -- this MUST
        // produce byte-identical pool contents on every call, or the same
        // date could yield different verses for different users, breaking
        // the core daily-seed contract.
        const dedup = new Map() // "BOOK:chapter:verse" -> { book, chapter, verse, topic }

        if (topicData) {
          const topicNames = Object.keys(topicData).sort()
          for (const topic of topicNames) {
            const entries = topicData[topic]
            if (!Array.isArray(entries)) continue
            for (const e of entries) {
              if (e.book && e.chapterStart && e.verseStart) {
                const key = `${e.book}:${e.chapterStart}:${e.verseStart}`
                if (!dedup.has(key)) {
                  dedup.set(key, { book: e.book, chapter: e.chapterStart, verse: e.verseStart, topic })
                }
              }
            }
          }
        }

        if (xrefPoolData && Array.isArray(xrefPoolData.verses)) {
          for (const v of xrefPoolData.verses) {
            const key = `${v.book}:${v.chapter}:${v.verse}`
            if (!dedup.has(key)) {
              dedup.set(key, { book: v.book, chapter: v.chapter, verse: v.verse, topic: null })
            }
          }
        }

        const candidates = [...dedup.values()]
        if (!candidates.length) {
          return new Response(JSON.stringify({ error: 'Seed pool unavailable' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Proper integer hash (Thomas Wang / Murmur3-finalizer style) --
        // has real avalanche properties, confirmed live against the real
        // pool to distribute close to theoretical random expectation. Do
        // NOT replace with a simple multiply-mod step -- that was the
        // exact bug this replaces.
        function hashDateInt(x) {
          x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
          x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
          x = x ^ (x >>> 16)
          return x >>> 0 // force unsigned 32-bit
        }

        const index = hashDateInt(dateInt) % candidates.length
        const picked = candidates[index]

        const [scriptureText, crossRefs] = await Promise.all([
          fetchBSBVerse(picked.book, picked.chapter, picked.verse),
          fetchCrossRefs(picked.book, picked.chapter, picked.verse, null)
        ])

        const bookName = BOOK_NAMES[picked.book] || picked.book

        return new Response(JSON.stringify({
          date: `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`,
          topic: picked.topic, // may be null -- xref-pool-only picks have no topic label
          anchor: { bookId: picked.book, chapter: picked.chapter, verse: picked.verse },
          reference: `${bookName} ${picked.chapter}:${picked.verse}`,
          scripture: scriptureText,
          crossReferences: crossRefs,
          studyInput: `${bookName} ${picked.chapter}:${picked.verse}`,
          poolSize: candidates.length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }


    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    if (url.pathname === '/word-lookup') {
      try {
        const { term } = await request.json()
        if (!term || !term.trim()) {
          return new Response(JSON.stringify({ error: 'No term provided' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const results = await searchStrongsByGloss(term.trim(), 10)
        const candidates = results.map(r => ({
          strongsNum: r.num,
          testament: r.testament,
          transliteration: r.parsed?.trans || null,
          pronunciation: r.parsed?.pron || null,
          briefDef: r.parsed?.brief || null,
          score: r.score
        }))
        return new Response(JSON.stringify({ term, candidates }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // ── /study-preview — free, pre-AI first step ──
    if (url.pathname === '/study-preview') {
      try {
        const { input, studyType, chosenStrongsNum, chosenTestament } = await request.json()
        if (!input || !input.trim()) {
          return new Response(JSON.stringify({ error: 'No input provided' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const preview = await buildFirstStepPreview(input.trim(), studyType, chosenStrongsNum, chosenTestament)
        return new Response(JSON.stringify(preview), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    try {
      const apiKey = env.ANTHROPIC_API_KEY
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const body = await request.json()
      const { studyType, primaryInput, trailContext } = body
      let parsed = parsePassage(primaryInput)

      // NEW: once a specific Strong's-numbered word has been chosen (the
      // second step of Word Study's pick-list flow), anchor to that word's
      // OWN real occurrence via the concordance -- more precise than any
      // text-based guess from the original search term, and takes priority
      // over both parsePassage and the Nave's fallback below for this case.
      if (studyType === 'word' && body.chosenStrongsNum) {
        const prefix = body.chosenTestament === 'Hebrew' ? 'H' : 'G'
        const num = `${prefix}${body.chosenStrongsNum.replace(/^[HG]/, '')}`
        const occurrences = await fetchWordOccurrences(num)
        if (occurrences && occurrences.length) {
          parsed = { bookId: occurrences[0].book, chapter: occurrences[0].chapter, verse: occurrences[0].verse }
          console.log(`Word anchored via concordance: ${num} -> ${parsed.bookId} ${parsed.chapter}:${parsed.verse} (1st of ${occurrences.length} real occurrences)`)
        }
      }

      let characterRecord = null
      // v38: a character study always looks the character up (so the Easton bio is supplied) even when the input already
      // parses as a passage ("Daniel" parses as the book of Daniel; the app may send "Acts 18:24-28" with character set).
      // An already-parsed passage is kept; the record only anchors the study when nothing was parsed.
      if (studyType === 'character' || body.character || (!parsed && studyType === 'devotional')) {
        const lookupName = body.character || primaryInput
        characterRecord = await fetchCharacter(lookupName)
        if (!parsed && characterRecord && characterRecord.passage) {
          parsed = {
            bookId: characterRecord.passage.bookId,
            chapter: characterRecord.passage.chapter,
            verse: null
          }
          console.log(`Character resolved: ${characterRecord.name} -> ${parsed.bookId} ${parsed.chapter}`)
        }
      }

      let navesAnchor = null
      if (!parsed && (studyType === 'topical' || studyType === 'devotional')) {
        navesAnchor = await fetchNavesAnchor(primaryInput)
        if (navesAnchor) {
          parsed = { bookId: navesAnchor.bookId, chapter: navesAnchor.chapter, verse: navesAnchor.verse }
          console.log(`Topic anchored via Nave's: "${primaryInput}" -> ${parsed.bookId} ${parsed.chapter}:${parsed.verse}`)
        }
      }

      if (!parsed && studyType === 'word') {
        // Fallback only -- reached when no specific word has been chosen
        // yet (e.g. the very first pass, before the pick-list selection).
        const wordAnchor = await fetchNavesAnchor(primaryInput)
        if (wordAnchor) {
          parsed = { bookId: wordAnchor.bookId, chapter: wordAnchor.chapter, verse: wordAnchor.verse }
          console.log(`Word anchored via Nave's (no specific word chosen yet): "${primaryInput}" -> ${parsed.bookId} ${parsed.chapter}:${parsed.verse}`)
        }
      }


      let commentaries = []
      let patristics = []
      let crossRefs = []
      let strongsData = null
      let devotionalPrompt = null
      let isSeededDevotionalFlow = false
      let devotionalCacheKey = null
      let cachedDevotionalText = null

      let overviewMap = null
      let overviewCommentaries = null
      if (studyType === 'book' && parsed) {
        overviewMap = await fetchBookOverviewMap(parsed.bookId)
        if (overviewMap && overviewMap.keyChapters) {
          overviewCommentaries = await fetchOverviewCommentaries(parsed.bookId, overviewMap.keyChapters)
          console.log(`Book Overview: ${parsed.bookId} scope=${overviewMap.scope} chapters=${overviewMap.keyChapters.length} commentaries=${overviewCommentaries.length}`)
        }
      }

      if (parsed && !overviewMap) {
        const { bookId, chapter, verse } = parsed
        const isOT = OT_BOOKS.has(bookId)
        const isDevotionalStudyType = studyType === 'devotional'

        // ── DEDICATED, MINIMAL DEVOTIONAL PATH ──────────────────────
        // Completes the "just click" Morning Trail experience: MHC
        // only, real fetched scripture text (not model-recalled), no
        // cross-refs, no patristics, no Strong's, no word/character/
        // book-overview machinery -- none of it applies to a devotional
        // and fetching it anyway (the old behavior) was pure waste.
        //
        // Scripture text: prefers body.scripture if the caller already
        // has it (the seeded "just click" path -- /daily-seed already
        // fetches this before the user even clicks "Begin," so
        // re-fetching here would be a redundant duplicate request).
        // Falls back to a live fetch otherwise (the "type your own"
        // freeform path, not the focus of this pass, but shouldn't be
        // left broken -- an honest fallback, not a hard requirement).
        if (isDevotionalStudyType) {
          const scriptureText = body.scripture
            || (verse
                 ? await fetchBSBVerse(bookId, chapter, verse)
                 : await fetchBSBPassage(bookId, chapter, 1, 1))

          const bookName = BOOK_NAMES[bookId] || bookId
          const reference = verse ? `${bookName} ${chapter}:${verse}` : `${bookName} ${chapter}`

          // ── MORNING TRAIL CACHE (KV) ──────────────────────────────
          // Cache ONLY the seeded "just click" flow (signaled by
          // body.scripture being present -- that's the daily-seed
          // path, and only that path is guaranteed identical for
          // every user on a given date). Freeform typed input and
          // devotional-continuation are NOT cached here -- their
          // inputs vary per user/click, a date-keyed cache would risk
          // serving the wrong content to a different request.
          //
          // Cache key is just today's UTC date -- deliberately simple.
          // Since /daily-seed is itself deterministic by date, everyone
          // requesting the seeded devotional today resolves to the
          // same verse, so keying by date alone is sufficient and
          // correct without needing to also encode the verse in the key.
          //
          // Decision, made explicitly by Tom: cache and serve
          // devotionals as-is, including known commentary-truncation
          // quality limits (see worker header/handoff notes) -- fixing
          // that is a separate, deliberately deferred piece of work,
          // not blocking this cost-control feature.
          isSeededDevotionalFlow = !!body.scripture
          if (isSeededDevotionalFlow && env.DEVOTIONAL_CACHE) {
            const today = new Date()
            devotionalCacheKey = `devo:${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
            try {
              cachedDevotionalText = await env.DEVOTIONAL_CACHE.get(devotionalCacheKey)
            } catch (err) {
              console.log(`KV read failed (falling back to live generation): ${err.message}`)
            }
          }

          if (cachedDevotionalText) {
            console.log(`Devotional CACHE HIT: ${devotionalCacheKey} — serving from KV, no AI call`)
          } else {
            const mhcText = await fetchMHC(bookId, chapter, verse)

            devotionalPrompt = buildDevotionalPrompt({
              reference,
              scriptureText: scriptureText || '(scripture text unavailable)',
              mhcText,
              topic: body.topic || null,
              trailContext: body.trailContext || null,
            })

            commentaries = mhcText ? [{ label: 'Matthew Henry (MH)', text: mhcText }] : []
            patristics = []
            crossRefs = []
            strongsData = null

            console.log(`Devotional CACHE MISS: ${reference}, MHC ${mhcText ? 'found' : 'not found'}, scripture ${body.scripture ? 'from client' : 'fetched live'}${isSeededDevotionalFlow ? `, will cache as ${devotionalCacheKey}` : ' (not cached -- freeform input)'}`)
          }
        } else {

        const secondaryType = STUDY_SECONDARY[studyType] || 'JFB'

        // CHARACTER STUDIES: fetch commentary across multiple key chapters,
        // not just the anchor chapter. A character like Leah spans Genesis
        // 29-30 and potentially more -- fetching only chapter 29 leaves the
        // model starved of sources when that chapter is thin or absent.
        // Build a list of chapters to fetch: the anchor plus any additional
        // chapters stored on the character record (characterChapters field),
        // capped at 3 total to stay within prompt budget.
        const extraChapters = (studyType === 'character' && characterRecord?.chapters)
          ? characterRecord.chapters
              .filter(c => c.bookId === bookId && c.chapter !== chapter)
              .slice(0, 2)
              .map(c => c.chapter)
          : []
        const chaptersToFetch = [chapter, ...extraChapters]

        // Merge commentary text across chapters -- concatenate with a brief
        // chapter label so the model knows which passage each excerpt covers.
        async function fetchMerged(fetchFn, ...args) {
          if (chaptersToFetch.length <= 1) return fetchFn(...args)
          const results = await Promise.all(
            chaptersToFetch.map(ch => fetchFn(bookId, ch))
          )
          const parts = results
            .map((text, i) => text ? `[Chapter ${chaptersToFetch[i]}] ${text}` : null)
            .filter(Boolean)
          return parts.length ? parts.join('\n\n').slice(0, 2500) : null
        }

        // NOTE: MHC's actual fetch happens inline in the WAVE 1 block
        // below, alongside the other primary sources. An earlier,
        // separately-built `mhcFetch` promise here was constructed but
        // never used -- a real, live wasted network fetch on every
        // full-study generation, found and removed while tightening
        // this file. secondaryFetch and clarkeCharacterFetch below ARE
        // genuinely used (confirmed by checking every reference before
        // removing anything) -- only the MHC one was dead.

        let secondaryFetch
        if (secondaryType === 'JFB') {
          secondaryFetch = (studyType === 'character'
            ? fetchMerged(fetchJFB, bookId, chapter)
            : fetchJFB(bookId, chapter, verse)
          ).then(text => text ? { label: 'Jamieson-Fausset-Brown (JFB)', text } : null)
        } else if (secondaryType === 'Clarke') {
          secondaryFetch = (studyType === 'character'
            ? fetchMerged(fetchClarke, bookId, chapter)
            : fetchClarke(bookId, chapter, verse)
          ).then(text => text ? { label: 'Adam Clarke (AC)', text } : null)
        } else if (secondaryType === 'Barnes') {
          secondaryFetch = (studyType === 'character'
            ? fetchMerged(fetchBarnes, bookId, chapter)
            : fetchBarnes(bookId, chapter, verse)
          ).then(text => text ? { label: "Barnes' Notes (BN)", text } : null)
        } else {
          secondaryFetch = Promise.resolve(null)
        }

        // CHARACTER STUDIES: also fetch Clarke as a third voice alongside
        // Barnes. Clarke brings original language and narrative structure
        // analysis that complements Henry (pastoral) and Barnes (textual/
        // geographical). Character studies benefit most from multiple
        // angles since the story spans multiple chapters and aspects.
        const clarkeCharacterFetch = (studyType === 'character')
          ? fetchMerged(fetchClarke, bookId, chapter)
              .then(text => text ? { label: 'Adam Clarke (AC)', text } : null)
          : Promise.resolve(null)

        const isDevotional = body.studyType === 'devotional'

        // TWO-WAVE FETCH: Cloudflare Workers have a concurrent HTTP
        // request limit. Firing 20+ simultaneous GitHub fetches exceeds
        // it -- confirmed live: Cloudflare canceled stalled responses to
        // prevent deadlock, causing commentary fetches to silently fail
        // and the model to invent quotes instead of using real material.
        // Fix: split fetches into two sequential waves. Wave 1 gets the
        // highest-value sources. Wave 2 gets supplementary sources once
        // Wave 1 completes. Total concurrent requests per wave stays
        // well under the limit.

        // WAVE 1: cross-refs + primary commentaries
        const [
          xrefs,
          mhcResult,
          secondaryResult,
          clarkeCharResult,
          calvinResult,
          navesCharResult,
        ] = await Promise.all([
          isDevotional ? Promise.resolve([]) : fetchCrossRefs(bookId, chapter, verse),
          (studyType === 'character'
            ? fetchMerged(fetchMHC, bookId, chapter)
            : fetchMHC(bookId, chapter, verse)
          ).then(text => text ? { label: 'Matthew Henry (MH)', text } : null),
          secondaryFetch,
          clarkeCharacterFetch,
          (studyType === 'character'
            ? fetchMerged(fetchCalvin, bookId, chapter)
            : fetchCalvin(bookId, chapter, verse)
          ).then(text => text ? { label: "Calvin's Commentaries (CC)", text } : null),
          (studyType === 'character' && primaryInput)
            ? fetchNaves(primaryInput).then(text =>
                text ? { label: "Nave's Topical Bible (NT)", text } : null)
            : Promise.resolve(null),
        ])

        // WAVE 2: supplementary sources (after Wave 1 completes)
        const [
          scofieldResult,
          spurgeonResult,
          vincentResult,
          meyerResult,
          tyndaleResult,
          barnesPassageResult,
          strongsResult,
          wesleyResult,
          ...fatherResults
        ] = await Promise.all([
          fetchScofield(bookId, chapter, verse).then(text =>
            text ? { label: 'Scofield Reference Notes (SR)', text } : null),
          fetchSpurgeon(bookId, chapter, verse).then(text =>
            text ? { label: "Spurgeon's Treasury of David (SP)", text } : null),
          (!isOT) ? fetchVincent(bookId, chapter, verse).then(text =>
            text ? { label: "Vincent's Word Studies (VWS)", text } : null)
            : Promise.resolve(null),
          (!isOT) ? fetchMeyer(bookId, chapter, verse).then(text =>
            text ? { label: "Meyer's NT Commentary (MEY)", text } : null)
            : Promise.resolve(null),
          fetchTyndale(bookId, chapter, verse).then(text =>
            text ? { label: 'Tyndale Open Study Notes (TSN)', text } : null),
          // v26: Barnes' Notes as an extra voice on NT PASSAGE studies. Only
          // NT (the rebuilt full-text files); the OT file is still truncated.
          // Needs a real verse -- no verse, no Barnes (honest null, no guess).
          // Character studies already get Barnes via the secondary slot.
          (studyType === 'passage' && !isOT && verse && secondaryType !== 'Barnes')
            ? fetchBarnes(bookId, chapter, verse).then(text =>
                text ? { label: "Barnes' Notes (BN)", text } : null)
            : Promise.resolve(null),
          // Strongs fetch (word studies)
          (studyType === 'word' && body.chosenStrongsNum)
            ? (() => {
                const dict = body.chosenTestament === 'Hebrew' ? 'strongs_hebrew' : 'strongs_greek'
                const num = body.chosenStrongsNum.replace(/^[HG]/, '')
                return fetchJSON(`${GITHUB_BASE}/dict/${dict}.json`).then(data => {
                  if (!data || !data.entries[num]) return null
                  const parsedEntry = parseStrongsEntry(data.entries[num])
                  if (!parsedEntry) return null
                  const result = { num, ...parsedEntry }
                  return body.chosenTestament === 'Hebrew' ? { hebrew: result } : { greek: result }
                })
              })()
            : (studyType === 'word')
              ? fetchStrongsForWord(primaryInput, bookId).then(result => {
                  if (!result) return null
                  return isOT ? { hebrew: result } : { greek: result }
                })
              : Promise.resolve(null),
          isDevotional
            ? Promise.resolve(null)
            : fetchWesleyNotes(bookId, chapter, verse),
          ...(isDevotional
            ? []
            : CHURCH_FATHERS.map(({ name, label }) =>
                fetchFatherOnVerse(name, bookId, chapter, verse).then(text =>
                  text ? { label, text } : null))),
        ])

        crossRefs = xrefs
        const mhc = mhcResult
        const secondary = secondaryResult
        const clarkeChar = clarkeCharResult
        const calvin = calvinResult
        const navesChar = navesCharResult
        const scofield = scofieldResult
        const spurgeon = spurgeonResult
        const vincent = vincentResult
        const meyer = meyerResult
        const tyndale = tyndaleResult
        const barnesPassage = barnesPassageResult
        const strongs = strongsResult
        const wesley = wesleyResult
        const fathers = fatherResults

        crossRefs = xrefs
        const wesleyCommentary = wesley
          ? { label: "Wesley's Explanatory Notes (JW)", text: wesley }
          : null
        const eastonsBio = (characterRecord && characterRecord.bio)
          ? { label: "Easton's Bible Dictionary (EBD)", text: `${characterRecord.name}: ${capBio(characterRecord.bio)}` }
          : null
        // v39: log what was supplied (the sources footer lists only sources the study itself names)
        if (studyType === 'character' || body.character) {
          console.log(characterRecord && characterRecord.bio
            ? `Easton bio supplied: ${characterRecord.name}, ${characterRecord.bio.length} chars, cap ${characterRecord.bio.length > BIO_CAP ? 'applied (excerpt of ' + BIO_CAP + ' max)' : 'not needed'}`
            : `Easton bio NOT supplied: ${characterRecord ? characterRecord.name + ' has no bio' : 'no character record found for ' + (body.character || primaryInput)}`)
        }
        commentaries = [eastonsBio, mhc, secondary, clarkeChar, scofield, spurgeon, wesleyCommentary, calvin, vincent, meyer, tyndale, barnesPassage, navesChar].filter(Boolean)
        patristics = fathers.filter(Boolean)
        strongsData = strongs

        console.log(`Protestant: ${commentaries.map(c => c.label).join(', ')}`)
        console.log(`Patristic: ${patristics.map(c => c.label).join(', ')}`)
        console.log(`Cross-refs: ${crossRefs.length}`)
        console.log(`Strong's: ${strongsData ? JSON.stringify(strongsData) : 'none'}`)

        } // end else (non-devotional studyType branch)

      } else if (studyType === 'topical') {
        const navesResult = await fetchNaves(primaryInput)
        if (navesResult) {
          commentaries = [{ label: "Nave's Topical Bible (NT)", text: navesResult }]
        }
        console.log(`Topical — Nave's: ${navesResult ? 'found' : 'not found'}`)
      }

      if (studyType === 'topical' && parsed) {
        const navesResult = await fetchNaves(primaryInput)
        if (navesResult) {
          commentaries = [...commentaries, { label: "Nave's Topical Bible (NT)", text: navesResult }]
        }
      }

      // Ground Over the Hill in a real second hop instead of AI
      // invention. crossRefs[0] is the reference reserved for Rabbi
      // Road's own citation -- fetch fresh cross-refs FROM that verse, so
      // Over the Hill can point to something real, one hop further out.
      // Graceful no-op if crossRefs is empty or unparseable.
      let secondHopCrossRefs = []
      if (crossRefs && crossRefs.length > 0) {
        const rabbiRoadRef = parseCrossRefString(crossRefs[0])
        if (rabbiRoadRef) {
          secondHopCrossRefs = await fetchCrossRefs(rabbiRoadRef.bookId, rabbiRoadRef.chapter, rabbiRoadRef.verse)
          // Don't let Over the Hill just re-suggest Rabbi Road's own reference.
          secondHopCrossRefs = secondHopCrossRefs.filter(r => r !== crossRefs[0])
          // FIX (v17, found via live testing on Daniel 4 / Acts 8:22): the
          // filter above only excluded Rabbi Road's own reference -- it
          // never excluded the ORIGINAL passage being studied, so the
          // "second hop" could loop straight back to where the study
          // started (confirmed live: Daniel 4:27 -> Acts 8:22 -> back to
          // Daniel 4:27). A trail that leads back to its own starting
          // point isn't a trail. Exclude any candidate in the same
          // book+chapter as the studied passage too.
          if (parsed && parsed.bookId && parsed.chapter) {
            const originalBookName = BOOK_NAMES[parsed.bookId] || parsed.bookId
            const originalPrefix = `${originalBookName} ${parsed.chapter}:`
            secondHopCrossRefs = secondHopCrossRefs.filter(r => !r.startsWith(originalPrefix))
          }
        }
      }

      // v34: real scripture text for the prompt (see buildScriptureSupply). Passage studies only (SCRIPTURE_SUPPLY_TYPES).
      const scriptureEdition = scriptureEditionKey(body.translation)
      let scriptureSupply = null
      if (!devotionalPrompt && !cachedDevotionalText && parsed && !overviewMap && SCRIPTURE_SUPPLY_TYPES.has(studyType)) {
        try {
          scriptureSupply = await buildScriptureSupply(scriptureEdition, parsed, [...(crossRefs || []), ...(secondHopCrossRefs || [])])
          console.log(`Scripture supply: ${scriptureEdition.toUpperCase()} ${JSON.stringify(scriptureSupply.summary)}`)
        } catch (e) {
          scriptureSupply = null
          console.log(`Scripture supply failed (non-fatal; v33 behaviour for this study): ${e && e.message}`)
        }
      }

      const prompt = devotionalPrompt || buildPrompt(body, commentaries, patristics, crossRefs, strongsData, overviewMap, overviewCommentaries, secondHopCrossRefs, scriptureSupply)

      let anthropicRes
      if (cachedDevotionalText) {
        // KV cache hit -- serve directly, no Anthropic call at all.
        // Reuses the existing mock-stream mechanism (already proven via
        // DEV_MODE) rather than inventing a second way to fake a stream.
        anthropicRes = {
          ok: true,
          body: createMockStream(cachedDevotionalText)
        }
      } else if (DEV_MODE) {
        console.log(`[DEV_MODE] Mocking response for studyType=${body.studyType} — no API call made`)
        const mockText = getMockResponse(body.studyType)
        anthropicRes = {
          ok: true,
          body: createMockStream(mockText)
        }
      } else {
        anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: body.studyType === 'devotional'
              ? (body.trailContext ? 1100 : 800)
              : 5000,
            stream: true,
            messages: [{ role: 'user', content: prompt }]
          })
        })

        if (!anthropicRes.ok) {
          const err = await anthropicRes.text()
          return new Response(JSON.stringify({ error: err }), {
            status: anthropicRes.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }

      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()

      // v20: STREAM OUTPUT ROUTER — two real-time safety nets. Both
      // exist because content already streamed to the client can't be
      // retroactively un-sent -- these intervene on outgoing chunks as
      // they're produced, not after the fact like the sources footer.
      //
      // (1) DEVOTIONAL POST-STREAM STRIPPER: the devotional prompt is
      // explicit that generation must stop after "Sit with that for a
      // moment before the day begins." -- no Rabbit Trail, no Rabbi
      // Road, no Over the Hill. LLM instruction-following isn't 100%
      // reliable; if the model keeps generating past that point anyway,
      // this catches it in real time: once the closing marker is seen
      // in the accumulated text, every chunk after it is silently
      // dropped rather than forwarded. The chunk that completes the
      // marker itself still sends normally.
      //
      // (2) DUPLICATE COMMENTARY-SOURCE PREVENTION: confirmed real
      // pattern in live output -- the same scholar appearing in two
      // back-to-back >>COMMENTARY blocks (nothing but synthesis prose
      // or a >>SCRIPTURE block between them) reads redundant and crowds
      // out other sources. True prevention (not just detection) needs
      // to intervene before the repeat block reaches the client, so
      // text is buffered ONLY while inside a >>COMMENTARY ... >>END
      // block (these are short by design, 1-3 sentences) -- once a
      // block completes, its scholar name is compared to the
      // immediately preceding commentary block's; a repeat is dropped,
      // anything else forwards immediately. All non-commentary text
      // (the vast majority of the stream) continues to forward exactly
      // as before, unbuffered, chunk by chunk.
      //
      // fullText itself (used below for the honest-footer/verification
      // logic) always accumulates the model's raw, complete output
      // regardless of what gets forwarded here -- a source whose
      // duplicate block was dropped from the client-visible stream
      // still genuinely appeared once, and should still be credited
      // in the real sources footer.
      const isDevotionalStudy = body.studyType === 'devotional'
      const DEVOTIONAL_END_MARKER = 'Sit with that for a moment before the day begins.'
      let devotionalEnded = false

      function createOutputRouter() {
        // v23 FIX: confirmed live -- the model occasionally emits a single
        // ">COMMENTARY" or ">END" instead of the required double
        // ">>COMMENTARY"/">>END". Confirmed on a real JFB block for Psalm
        // 119:105: this one-character slip silently broke THREE things at
        // once, all keyed off an exact ">>" match -- block-start detection
        // here (so duplicate-scholar buffering never engaged),
        // checkSourceUsage()'s TAGGED classification, and, most visibly,
        // left the raw, unstyled marker text exposed directly to the user
        // instead of a properly rendered commentary quote.
        //
        // Fix: detect EITHER one or two leading brackets, and always
        // NORMALIZE the text actually written to the client to the
        // canonical double-bracket form, regardless of which the model
        // produced. This keeps the frontend's existing ">>" parser working
        // with no frontend change needed, and makes the marker tolerant by
        // construction rather than dependent on the model getting it
        // exactly right every single time -- same philosophy as the
        // devotional post-stream stripper and the honest sources footer.
        const COMMENTARY_START_RE = />{1,2}\s*COMMENTARY/
        const COMMENTARY_END_RE = />{1,2}\s*END\b/

        let inCommentaryBlock = false
        let blockBuffer = ''
        let lastCommentaryScholar = null

        async function writeRaw(text) {
          if (!text) return
          await writer.write(encoder.encode(text))
        }

        async function routeCommentaryAware(text) {
          if (!inCommentaryBlock) {
            const startMatch = COMMENTARY_START_RE.exec(text)
            if (!startMatch) {
              await writeRaw(text)
              return
            }
            if (startMatch.index > 0) await writeRaw(text.slice(0, startMatch.index))
            inCommentaryBlock = true
            // Normalize whatever bracket count the model used to the
            // canonical double form for everything downstream.
            blockBuffer = '>>COMMENTARY' + text.slice(startMatch.index + startMatch[0].length)
            await maybeFlushBlock()
            return
          }
          blockBuffer += text
          await maybeFlushBlock()
        }

        async function maybeFlushBlock() {
          const endMatch = COMMENTARY_END_RE.exec(blockBuffer)
          if (!endMatch) return // block not complete yet -- keep buffering
          const blockText = blockBuffer.slice(0, endMatch.index) + '>>END'
          const rest = blockBuffer.slice(endMatch.index + endMatch[0].length)
          inCommentaryBlock = false
          blockBuffer = ''

          const nameMatch = blockText.match(/\*\*([^*]+)\*\*/)
          const scholar = nameMatch ? nameMatch[1].trim() : null

          if (scholar && scholar === lastCommentaryScholar) {
            // Same voice as the immediately preceding commentary block
            // -- drop this repeat rather than forward it to the client.
          } else {
            await writeRaw(blockText)
          }
          if (scholar) lastCommentaryScholar = scholar

          if (rest) await routeCommentaryAware(rest)
        }

        return {
          async write(text) {
            if (isDevotionalStudy) {
              if (devotionalEnded) return // already past the required ending -- drop everything further
              await writeRaw(text)
              return
            }
            await routeCommentaryAware(text)
          }
        }
      }

      const outputRouter = createOutputRouter()

      async function processStream() {
        const reader = anthropicRes.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullText = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop()
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.type === 'content_block_delta' &&
                      parsed.delta?.type === 'text_delta') {
                    fullText += parsed.delta.text
                    await outputRouter.write(parsed.delta.text)
                    // Check AFTER writing so the chunk completing the
                    // marker itself still reaches the client -- only
                    // chunks arriving after this point get suppressed.
                    if (isDevotionalStudy && !devotionalEnded &&
                        fullText.includes(DEVOTIONAL_END_MARKER)) {
                      devotionalEnded = true
                    }
                  }
                } catch { }
              }
            }
          }
        } finally {
          // ── MORNING TRAIL CACHE WRITE ─────────────────────────────
          // Only writes when: this was the seeded flow, it was a real
          // fresh generation (not itself served from cache), not
          // DEV_MODE, and the KV binding actually exists. Guarded with
          // try/catch -- a KV write failure should never break the
          // response the user is already receiving.
          if (isSeededDevotionalFlow && !cachedDevotionalText && !DEV_MODE && env.DEVOTIONAL_CACHE && devotionalCacheKey && fullText) {
            try {
              await env.DEVOTIONAL_CACHE.put(devotionalCacheKey, fullText, { expirationTtl: 60 * 60 * 24 * 30 }) // 30 days, generous, not load-bearing -- 1 entry/day is nowhere near the 1GB free cap
              console.log(`Devotional CACHED: ${devotionalCacheKey} (${fullText.length} chars) — next request today serves from KV, no AI call`)
            } catch (err) {
              console.log(`KV write failed (non-fatal, response already sent): ${err.message}`)
            }
          }

          // NEW IN v16: honest, code-generated sources footer.
          // The model was told NOT to write its own footer (see
          // buildPrompt). Here, after the real fullText is known, check
          // which fetched sources actually appear in the output and
          // build the footer from only those -- this is the fix for the
          // confirmed real bug where a study's footer listed sources
          // (e.g. Calvin, two Church Fathers) it never actually surfaced
          // in the body.
          let commentaryCheck = { checked: false, results: [] }
          let patristicCheck = { checked: false, results: [] }
          let roadVerification = { checked: false }

          if (!DEV_MODE) {
            console.log(`fullText length at verification: ${fullText.length}`)
            commentaryCheck = checkSourceUsage(fullText, commentaries, false)
            patristicCheck = checkSourceUsage(fullText, patristics, true)
            roadVerification = crossRefs && crossRefs.length > 0
              ? verifyRabbiRoadCitation(fullText, crossRefs)
              : { checked: false }

            // v20 FIX: devotionals were getting a footer despite the
            // prompt's explicit "NO sources footer" instruction -- this
            // write was previously unconditional for every studyType.
            // Found while building the devotional post-stream stripper;
            // same category of fix, same prompt instruction it should
            // have always honored.
            if (!isDevotionalStudy) {
              const usedCommentaries = commentaryCheck.checked
                ? commentaries.filter((c, i) => commentaryCheck.results[i].status !== 'UNUSED')
                : []
              const usedPatristics = patristicCheck.checked
                ? patristics.filter((c, i) => patristicCheck.results[i].status !== 'UNUSED')
                : []
              const crossRefsGenuinelyCited = roadVerification.checked &&
                roadVerification.rabbiRoad && roadVerification.rabbiRoad.verified

              const footerText = buildHonestSourcesFooter(
                usedCommentaries,
                usedPatristics,
                crossRefsGenuinelyCited ? crossRefs : [],
                strongsData
              )
              try {
                await writer.write(encoder.encode(footerText))
              } catch { }
            }
          }

          await writer.close()

          if (!DEV_MODE && roadVerification.checked) {
            const r = roadVerification.rabbiRoad
            console.log(`Rabbi Road verification: ${r.stated ? (r.verified ? 'PASS' : 'FAIL') : 'MISSING CITATION'} — stated "${r.stated || 'none'}"`)
            if (r.stated && !r.verified) {
              console.log(`  Real cross-references were: ${crossRefs.join(', ')}`)
            }
          } else if (!DEV_MODE) {
            console.log(`Rabbi Road verification: not checked — no cross-references were fetched for this study`)
          }

          if (!DEV_MODE && commentaryCheck.checked) {
            const unused = commentaryCheck.results.filter(r => r.status === 'UNUSED')
            const untagged = commentaryCheck.results.filter(r => r.status === 'UNTAGGED')
            const tagged = commentaryCheck.results.filter(r => r.status === 'TAGGED')
            console.log(`Commentary usage: ${tagged.length} TAGGED, ${untagged.length} UNTAGGED, ${unused.length} UNUSED (of ${commentaryCheck.results.length} fetched)`)
            if (untagged.length > 0) {
              console.log(`  Untagged sources (used but not in >>COMMENTARY block): ${untagged.map(r => r.source).join(', ')}`)
            }
            if (unused.length > 0) {
              console.log(`  Unused sources (fetched, never appear in body, correctly OMITTED from real footer): ${unused.map(r => r.source).join(', ')}`)
            }
          }

          // v28: log-only quotation verification (never alters output).
          if (!DEV_MODE && !isDevotionalStudy) {
            try {
              const qv = verifyQuotedCommentary(fullText, commentaries, patristics)
              const tally = qv.reduce((m, r) => (m[r.verdict] = (m[r.verdict] || 0) + 1, m), {})
              console.log(`Quote check: ${qv.length} commentary blocks -- ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`)
              for (const r of qv.filter(r => r.verdict !== 'MATCH').slice(0, 12)) {
                console.log(`  Quote check ${r.verdict}: ${r.scholar || '(no name)'} ${r.fragments ? '[' + r.fragments + ' fragments, longest verbatim run ' + r.longestRun + ']' : '(' + r.why + ')'} ${r.foundInOther ? '-- words found in ' + r.foundInOther + ' instead' : ''} | "${r.quote}"`)
              }
            } catch (e) {
              console.log(`Quote check failed (non-fatal): ${e && e.message}`)
            }
          }

          // v34: log-only Scripture check (never alters output). Runs for every non-devotional study so the study types
          // that are not yet supplied with text can be measured too ("supplied" says which blocks had their verses in the prompt).
          if (!DEV_MODE && !isDevotionalStudy) {
            try {
              const sv = await verifyScriptureBlocks(fullText, scriptureEdition, scriptureSupply)
              const tally = sv.reduce((m, r) => (m[r.verdict] = (m[r.verdict] || 0) + 1, m), {})
              const sup = sv.reduce((m, r) => (m[r.supplied || 'n/a'] = (m[r.supplied || 'n/a'] || 0) + 1, m), {})
              console.log(`Scripture check: ${sv.length} blocks (${scriptureEdition.toUpperCase()}) -- ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'} | supplied: ${Object.entries(sup).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`)
              for (const r of sv.filter(r => r.verdict !== 'MATCH').slice(0, 12)) {
                console.log(`  Scripture check ${r.verdict}: ${r.ref} supplied=${r.supplied || 'n/a'} ${r.fragments ? '[' + r.fragments + ' fragments, longest verbatim run ' + r.longestRun + ']' : '(' + r.why + ')'} ${r.why && r.fragments ? '-- ' + r.why : ''} ${r.foundInOther ? '-- words found in ' + r.foundInOther + ' instead' : ''} | "${r.quote}"`)
              }
            } catch (e) {
              console.log(`Scripture check failed (non-fatal): ${e && e.message}`)
            }
          }

          if (!DEV_MODE && patristicCheck.checked) {
            const unused = patristicCheck.results.filter(r => r.status === 'UNUSED')
            const tagged = patristicCheck.results.filter(r => r.status !== 'UNUSED')
            console.log(`Patristic usage: ${tagged.length} used, ${unused.length} UNUSED (of ${patristicCheck.results.length} fetched)`)
            if (unused.length > 0) {
              console.log(`  Unused Church Fathers (fetched, never appear in body, correctly OMITTED from real footer): ${unused.map(r => r.source).join(', ')}`)
            }
          }
        }
      }

      processStream()

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        }
      })

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
}