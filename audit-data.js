#!/usr/bin/env node
// RabbiRabbit Data Quality Audit Script
// Run from the root of your local repo clone:
//   node audit-data.js
// Produces a full report of coverage gaps, truncation, and data quality
// issues across all commentary sources and the BSB translation.

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

// ── Configuration ─────────────────────────────────────────────────

const DATA_DIR = './data'

// All 66 Bible books in canonical order with expected chapter counts
const BIBLE_BOOKS = [
  { id: 'GEN', name: 'Genesis',         chapters: 50 },
  { id: 'EXO', name: 'Exodus',          chapters: 40 },
  { id: 'LEV', name: 'Leviticus',       chapters: 27 },
  { id: 'NUM', name: 'Numbers',         chapters: 36 },
  { id: 'DEU', name: 'Deuteronomy',     chapters: 34 },
  { id: 'JOS', name: 'Joshua',          chapters: 24 },
  { id: 'JDG', name: 'Judges',          chapters: 21 },
  { id: 'RUT', name: 'Ruth',            chapters: 4  },
  { id: '1SA', name: '1 Samuel',        chapters: 31 },
  { id: '2SA', name: '2 Samuel',        chapters: 24 },
  { id: '1KI', name: '1 Kings',         chapters: 22 },
  { id: '2KI', name: '2 Kings',         chapters: 25 },
  { id: '1CH', name: '1 Chronicles',    chapters: 29 },
  { id: '2CH', name: '2 Chronicles',    chapters: 36 },
  { id: 'EZR', name: 'Ezra',            chapters: 10 },
  { id: 'NEH', name: 'Nehemiah',        chapters: 13 },
  { id: 'EST', name: 'Esther',          chapters: 10 },
  { id: 'JOB', name: 'Job',             chapters: 42 },
  { id: 'PSA', name: 'Psalms',          chapters: 150},
  { id: 'PRO', name: 'Proverbs',        chapters: 31 },
  { id: 'ECC', name: 'Ecclesiastes',    chapters: 12 },
  { id: 'SNG', name: 'Song of Solomon', chapters: 8  },
  { id: 'ISA', name: 'Isaiah',          chapters: 66 },
  { id: 'JER', name: 'Jeremiah',        chapters: 52 },
  { id: 'LAM', name: 'Lamentations',    chapters: 5  },
  { id: 'EZK', name: 'Ezekiel',         chapters: 48 },
  { id: 'DAN', name: 'Daniel',          chapters: 12 },
  { id: 'HOS', name: 'Hosea',           chapters: 14 },
  { id: 'JOL', name: 'Joel',            chapters: 3  },
  { id: 'AMO', name: 'Amos',            chapters: 9  },
  { id: 'OBA', name: 'Obadiah',         chapters: 1  },
  { id: 'JON', name: 'Jonah',           chapters: 4  },
  { id: 'MIC', name: 'Micah',           chapters: 7  },
  { id: 'NAH', name: 'Nahum',           chapters: 3  },
  { id: 'HAB', name: 'Habakkuk',        chapters: 3  },
  { id: 'ZEP', name: 'Zephaniah',       chapters: 3  },
  { id: 'HAG', name: 'Haggai',          chapters: 2  },
  { id: 'ZEC', name: 'Zechariah',       chapters: 14 },
  { id: 'MAL', name: 'Malachi',         chapters: 4  },
  { id: 'MAT', name: 'Matthew',         chapters: 28 },
  { id: 'MRK', name: 'Mark',            chapters: 16 },
  { id: 'LUK', name: 'Luke',            chapters: 24 },
  { id: 'JHN', name: 'John',            chapters: 21 },
  { id: 'ACT', name: 'Acts',            chapters: 28 },
  { id: 'ROM', name: 'Romans',          chapters: 16 },
  { id: '1CO', name: '1 Corinthians',   chapters: 16 },
  { id: '2CO', name: '2 Corinthians',   chapters: 13 },
  { id: 'GAL', name: 'Galatians',       chapters: 6  },
  { id: 'EPH', name: 'Ephesians',       chapters: 6  },
  { id: 'PHP', name: 'Philippians',     chapters: 4  },
  { id: 'COL', name: 'Colossians',      chapters: 4  },
  { id: '1TH', name: '1 Thessalonians', chapters: 5  },
  { id: '2TH', name: '2 Thessalonians', chapters: 3  },
  { id: '1TI', name: '1 Timothy',       chapters: 6  },
  { id: '2TI', name: '2 Timothy',       chapters: 4  },
  { id: 'TIT', name: 'Titus',           chapters: 3  },
  { id: 'PHM', name: 'Philemon',        chapters: 1  },
  { id: 'HEB', name: 'Hebrews',         chapters: 13 },
  { id: 'JAS', name: 'James',           chapters: 5  },
  { id: '1PE', name: '1 Peter',         chapters: 5  },
  { id: '2PE', name: '2 Peter',         chapters: 3  },
  { id: '1JN', name: '1 John',          chapters: 5  },
  { id: '2JN', name: '2 John',          chapters: 1  },
  { id: '3JN', name: '3 John',          chapters: 1  },
  { id: 'JUD', name: 'Jude',            chapters: 1  },
  { id: 'REV', name: 'Revelation',      chapters: 22 },
]

// Per-book file sources (one JSON file per book)
const PER_BOOK_SOURCES = [
  { name: 'Matthew Henry (MHC)',    folder: 'MHC',     filePattern: '{ID}.json' },
  { name: 'Scofield Notes',         folder: 'Scofield', filePattern: '{ID}.json' },
  { name: "Spurgeon's Treasury",    folder: 'TDavid',  filePattern: '{ID}.json', onlyBooks: ['PSA'] },
  { name: "Wesley's Notes",         folder: 'Wesley',  filePattern: '{ID}.json' },
]

// Array-format sources (all books in one JSON file)
const ARRAY_SOURCES = [
  { name: 'JFB',            file: 'JFB/JFB_commentary.json',       bookField: 'book', chaptersField: 'chapters' },
  { name: 'Adam Clarke',    file: 'Clarke/Clarke_commentary.json',  bookField: 'book', chaptersField: 'chapters' },
  { name: "Barnes' Notes",  file: 'Barnes/Barnes_commentary.json',  bookField: 'book', chaptersField: 'chapters' },
  { name: "Calvin",         file: 'Calvin/Calvin_commentary.json',  bookField: 'book', chaptersField: 'chapters' },
  { name: "Vincent",        file: 'Vincent/Vincent_commentary.json',bookField: 'book', chaptersField: 'chapters' },
  { name: "Meyer",          file: 'Meyer/Meyer_commentary.json',    bookField: 'book', chaptersField: 'chapters' },
]

// Thresholds
const MIN_COMMENTARY_LENGTH = 150    // chars — below this is likely a stub or index entry
const BILINGUAL_RATIO_THRESHOLD = 0.4  // if >40% of text is non-ASCII, flag as possibly bilingual/corrupted
const TRUNCATION_MARKERS = ['oth}', 'oth"', 'he w"', 'the s"']  // known truncation patterns

// ── Utilities ─────────────────────────────────────────────────────

function loadJSON(path) {
  try {
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function isBilingual(text) {
  // Flag text that contains substantial Latin interleaving --
  // confirmed real Calvin issue: Genesis chapters contain raw
  // Latin/English bilingual Scripture dump instead of commentary.
  // Heuristic: look for common Latin Bible words in quantity.
  const latinPatterns = ['Iahacob', 'puteus', 'gregibus', 'pecudum', 'suos', 'ergo', 'erat', 'illuc']
  const matches = latinPatterns.filter(p => text.includes(p)).length
  return matches >= 3
}

function isTruncated(text) {
  // Check for known mid-word truncation patterns found in JFB data
  const trimmed = text.slice(-20)
  return TRUNCATION_MARKERS.some(m => trimmed.includes(m)) ||
    // Generic: ends mid-sentence without punctuation
    (text.length > 100 && !/[.!?'")\]:]$/.test(text.trimEnd()))
}

function isStub(text) {
  // Chapter index/outline rather than real commentary --
  // Clarke pattern: "Jacob proceeds on his journey, Genesis 29:1.
  // Comes to a well... Genesis 29:2, Genesis 29:3..."
  const refDensity = (text.match(/Genesis \d+:\d+|Exodus \d+:\d+|[A-Z][a-z]+ \d+:\d+/g) || []).length
  const wordCount = text.split(/\s+/).length
  // If more than 1 scripture ref per 15 words, it's likely an index
  return refDensity > 0 && (wordCount / refDensity) < 15
}

function analyzeChapter(text, chapterNum) {
  const issues = []
  if (!text || text.length === 0) {
    issues.push('EMPTY')
    return issues
  }
  if (text.length < MIN_COMMENTARY_LENGTH) {
    issues.push(`SHORT (${text.length} chars)`)
  }
  if (isBilingual(text)) {
    issues.push('BILINGUAL_DUMP')
  }
  if (isTruncated(text)) {
    issues.push('TRUNCATED')
  }
  if (isStub(text)) {
    issues.push('INDEX_ONLY')
  }
  return issues
}

function summarize(issues) {
  const counts = {}
  for (const issue of issues) {
    counts[issue] = (counts[issue] || 0) + 1
  }
  return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')
}

// ── Audit functions ───────────────────────────────────────────────

// Per-book sources disagree on shape. MHC / Scofield / TDavid store
// chapters as an array of { chapter, commentary }; Wesley stores an
// object keyed by chapter number whose value IS the commentary string.
// Normalise both to a Map of chapterNumber -> commentary text.
function normalizeChapters(raw) {
  if (Array.isArray(raw)) {
    return new Map(
      raw
        .filter(c => c && c.chapter != null)
        .map(c => [Number(c.chapter), c.commentary])
    )
  }
  if (raw && typeof raw === 'object') {
    return new Map(
      Object.entries(raw).map(([k, v]) => [
        Number(k),
        typeof v === 'string' ? v : v?.commentary,
      ])
    )
  }
  return new Map()
}

function auditPerBookSource(source) {
  const results = { source: source.name, books: [], totalChapters: 0, coveredChapters: 0, issues: [] }
  const baseDir = join(DATA_DIR, 'commentary', source.folder)

  for (const book of BIBLE_BOOKS) {
    if (source.onlyBooks && !source.onlyBooks.includes(book.id)) continue

    const filePath = join(baseDir, `${book.id}.json`)
    if (!existsSync(filePath)) {
      results.books.push({ book: book.id, status: 'FILE_MISSING', issues: ['NO FILE'] })
      results.totalChapters += book.chapters
      continue
    }

    const data = loadJSON(filePath)
    if (!data) {
      results.books.push({ book: book.id, status: 'PARSE_ERROR', issues: ['JSON PARSE FAILED'] })
      results.totalChapters += book.chapters
      continue
    }

    const chapters = normalizeChapters(data.chapters)
    const bookIssues = []
    let covered = 0

    for (let ch = 1; ch <= book.chapters; ch++) {
      results.totalChapters++
      const commentary = chapters.get(ch)
      if (!commentary) {
        bookIssues.push(`ch${ch}:MISSING`)
        continue
      }
      covered++
      results.coveredChapters++
      const chIssues = analyzeChapter(commentary, ch)
      if (chIssues.length > 0) {
        bookIssues.push(`ch${ch}:${chIssues.join('+')}`)
      }
    }

    const status = covered === book.chapters ? 'COMPLETE' :
      covered === 0 ? 'NO_CHAPTERS' : `PARTIAL (${covered}/${book.chapters})`

    results.books.push({ book: book.id, name: book.name, status, issues: bookIssues })
  }

  return results
}

function auditArraySource(source) {
  const results = { source: source.name, books: [], totalChapters: 0, coveredChapters: 0, issues: [] }
  const filePath = join(DATA_DIR, 'commentary', source.file)

  if (!existsSync(filePath)) {
    results.issues.push('FILE_MISSING')
    return results
  }

  const data = loadJSON(filePath)
  if (!data || !Array.isArray(data)) {
    results.issues.push('PARSE_ERROR or not an array')
    return results
  }

  for (const book of BIBLE_BOOKS) {
    const bookData = data.find(b => b[source.bookField] === book.id)
    if (!bookData) {
      results.books.push({ book: book.id, name: book.name, status: 'BOOK_MISSING', issues: ['NOT IN FILE'] })
      results.totalChapters += book.chapters
      continue
    }

    const chapters = bookData[source.chaptersField] || []
    const bookIssues = []
    let covered = 0

    for (let ch = 1; ch <= book.chapters; ch++) {
      results.totalChapters++
      const chData = chapters.find(c => c.chapter === ch)
      if (!chData || !chData.commentary) {
        bookIssues.push(`ch${ch}:MISSING`)
        continue
      }
      covered++
      results.coveredChapters++
      const chIssues = analyzeChapter(chData.commentary, ch)
      if (chIssues.length > 0) {
        bookIssues.push(`ch${ch}:${chIssues.join('+')}`)
      }
    }

    const status = covered === book.chapters ? 'COMPLETE' :
      covered === 0 ? 'NO_CHAPTERS' : `PARTIAL (${covered}/${book.chapters})`

    results.books.push({ book: book.id, name: book.name, status, issues: bookIssues })
  }

  return results
}

function auditBSB() {
  const results = { source: 'BSB Translation', books: [], totalVerses: 0, coveredVerses: 0, issues: [] }
  const filePath = join(DATA_DIR, 'bsb/bsb.json')

  if (!existsSync(filePath)) {
    results.issues.push('FILE_MISSING — bsb/bsb.json not found')
    return results
  }

  const data = loadJSON(filePath)
  if (!data || !data.books) {
    results.issues.push('PARSE_ERROR or missing .books key')
    return results
  }

  for (const book of BIBLE_BOOKS) {
    const bookData = data.books[book.id]
    if (!bookData) {
      // issues must always be present — printReport maps over it unconditionally
      results.books.push({ book: book.id, name: book.name, status: 'BOOK_MISSING', issues: ['NOT IN FILE'] })
      continue
    }

    let covered = 0
    let missing = []
    let emptyVerses = []

    for (let ch = 1; ch <= book.chapters; ch++) {
      const chData = bookData[String(ch)]
      if (!chData) {
        missing.push(`ch${ch}`)
        continue
      }
      const verseNums = Object.keys(chData).map(Number)
      for (const v of verseNums) {
        results.totalVerses++
        const text = chData[String(v)]
        if (!text || text.trim().length === 0) {
          emptyVerses.push(`${ch}:${v}`)
        } else {
          covered++
          results.coveredVerses++
        }
      }
    }

    const bookIssues = [
      ...missing.map(m => `${m}:MISSING`),
      ...emptyVerses.map(v => `v${v}:EMPTY`),
    ]

    const status = missing.length === 0 && emptyVerses.length === 0 ? 'COMPLETE' :
      missing.length === book.chapters ? 'NO_CHAPTERS' : 'PARTIAL'

    results.books.push({ book: book.id, name: book.name, status, issues: bookIssues })
  }

  return results
}

// ── Report printer ────────────────────────────────────────────────

function printReport(auditResults) {
  console.log('\n' + '='.repeat(70))
  console.log(`RABBIRABBIT DATA QUALITY AUDIT`)
  console.log(`Run: ${new Date().toISOString()}`)
  console.log('='.repeat(70))

  for (const result of auditResults) {
    console.log(`\n${'─'.repeat(70)}`)
    console.log(`SOURCE: ${result.source}`)

    if (result.issues && result.issues.length > 0) {
      console.log(`  ⛔ FILE-LEVEL ISSUES: ${result.issues.join(', ')}`)
      continue
    }

    if (result.totalChapters) {
      const pct = ((result.coveredChapters / result.totalChapters) * 100).toFixed(1)
      console.log(`  Coverage: ${result.coveredChapters}/${result.totalChapters} chapters (${pct}%)`)
    }

    if (result.totalVerses) {
      const pct = ((result.coveredVerses / result.totalVerses) * 100).toFixed(1)
      console.log(`  Coverage: ${result.coveredVerses}/${result.totalVerses} verses (${pct}%)`)
    }

    // Books with issues
    const problemBooks = result.books.filter(b =>
      b.status !== 'COMPLETE' || b.issues.length > 0
    )

    if (problemBooks.length === 0) {
      console.log(`  ✅ All books complete — no issues found`)
    } else {
      console.log(`\n  Books with issues (${problemBooks.length}):`)
      for (const book of problemBooks) {
        const issueTypes = new Set(
          book.issues.map(i => i.replace(/ch\d+:/g, '').split('+')[0])
        )
        const uniqueIssues = [...issueTypes].join(', ')
        const chapCount = book.issues.filter(i => i.includes(':')).length

        // Only show chapter-level detail if there are quality issues
        // (not just missing chapters, which is expected for sparse sources)
        const qualityIssues = book.issues.filter(i =>
          i.includes('BILINGUAL') || i.includes('TRUNCATED') ||
          i.includes('INDEX_ONLY') || i.includes('SHORT')
        )

        console.log(`\n  📖 ${book.name} (${book.book}) — ${book.status}`)
        if (book.issues.includes('NOT IN FILE') || book.issues.includes('NO FILE')) {
          console.log(`     ⚠️  Not present in source file`)
        } else if (qualityIssues.length > 0) {
          console.log(`     ⚠️  Quality issues: ${uniqueIssues}`)
          // Show first 5 chapter-level issues to avoid flooding output
          qualityIssues.slice(0, 5).forEach(i => console.log(`        • ${i}`))
          if (qualityIssues.length > 5) {
            console.log(`        • ... and ${qualityIssues.length - 5} more`)
          }
        } else if (!book.status.includes('COMPLETE')) {
          // Just missing chapters -- summarize
          const missingChs = book.issues.filter(i => i.includes('MISSING'))
          console.log(`     ℹ️  Missing ${missingChs.length} chapters`)
        }
      }
    }
  }

  // Summary table
  console.log('\n\n' + '='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log(`${'Source'.padEnd(30)} ${'Coverage'.padEnd(20)} ${'Issues'}`)
  console.log('─'.repeat(70))
  for (const result of auditResults) {
    if (result.issues && result.issues.length > 0) {
      console.log(`${result.source.padEnd(30)} ${'FILE MISSING'.padEnd(20)}`)
      continue
    }
    const total = result.totalChapters || result.totalVerses || 0
    const covered = result.coveredChapters || result.coveredVerses || 0
    const pct = total ? ((covered / total) * 100).toFixed(1) + '%' : 'N/A'
    const problemCount = result.books.filter(b =>
      b.status !== 'COMPLETE' || b.issues.filter(i =>
        i.includes('BILINGUAL') || i.includes('TRUNCATED') ||
        i.includes('INDEX_ONLY')
      ).length > 0
    ).length
    const issueStr = problemCount > 0 ? `${problemCount} books with quality issues` : '✅ Clean'
    console.log(`${result.source.padEnd(30)} ${pct.padEnd(20)} ${issueStr}`)
  }

  console.log('\nAudit complete.')
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('Starting RabbiRabbit data audit...')
  console.log(`Looking for data at: ${DATA_DIR}`)

  if (!existsSync(DATA_DIR)) {
    console.error(`\n❌ Data directory not found at "${DATA_DIR}"`)
    console.error('Run this script from the root of your repo clone:')
    console.error('  cd /path/to/RabbiRabbit')
    console.error('  node audit-data.js')
    process.exit(1)
  }

  const results = []

  // Per-book sources
  for (const source of PER_BOOK_SOURCES) {
    process.stdout.write(`  Auditing ${source.name}...`)
    results.push(auditPerBookSource(source))
    console.log(' done')
  }

  // Array sources
  for (const source of ARRAY_SOURCES) {
    process.stdout.write(`  Auditing ${source.name}...`)
    results.push(auditArraySource(source))
    console.log(' done')
  }

  // BSB translation
  process.stdout.write('  Auditing BSB translation...')
  results.push(auditBSB())
  console.log(' done')

  printReport(results)
}

main().catch(console.error)
