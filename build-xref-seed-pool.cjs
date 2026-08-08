#!/usr/bin/env node
/**
 * build-xref-seed-pool.cjs — one-time consolidation script.
 *
 * WHY THIS EXISTS: the daily devotional seed needs a large, high-quality
 * candidate pool so a committed user (opens the app every morning, for
 * years) never perceives repetition. openbible_topic_scores.json already
 * gives ~6,710 topics x up to 5 verses. This script adds a second, large,
 * independent pool built from cross-reference VOTE counts -- verses the
 * scholarly cross-reference network itself flags as significant, not
 * just topically tagged.
 *
 * WHY PRECOMPUTED, NOT FETCHED LIVE: the xref dataset is split across 66
 * per-book files (confirmed live: Psalms alone is 1.16MB, 23,042 entries).
 * Fetching all 66 on every /daily-seed request would risk the same
 * Cloudflare concurrent-request ceiling already documented elsewhere in
 * the Worker ("Cloudflare canceled stalled responses to prevent
 * deadlock"). This script runs ONCE, consolidates everything into a
 * single small static file, and /daily-seed fetches that one file --
 * same architecture pattern as every other dataset already in the repo.
 *
 * THRESHOLD: vote >= 10. Chosen from real data, not a guess -- confirmed
 * live this session: Psalms alone has 304 entries at this threshold
 * (from 23,042 total), a meaningfully "significant" filter without being
 * so strict the pool shrinks too far for smaller books.
 *
 * CAPTURES BOTH DIRECTIONS of each cross-reference: the "from" verse
 * (the one that HAS the cross-reference) and the "to" verse (the one
 * being pointed TO). A verse can be significant either as a source or
 * as a frequently-cited destination -- capturing only one direction
 * would miss well-known "hub" verses that are cited far more than they
 * cite others.
 *
 * OUTPUT: data/dict/xref_seed_pool.json
 *   { "verses": [ { "book": "PSA", "chapter": 23, "verse": 1, "votes": 42 }, ... ] }
 * Deduplicated by (book, chapter, verse), keeping the MAX vote seen
 * across both directions and across however many times a verse appears.
 * Sorted in canonical Bible order for a stable, reproducible file (byte-
 * for-byte the same on every re-run against the same source data).
 *
 * USAGE: node build-xref-seed-pool.cjs
 * Writes to ./output/xref_seed_pool.json -- review before pushing to
 * data/dict/xref_seed_pool.json in the real repo.
 */

const fs = require('fs');
const path = require('path');

const XREF_BASE = 'https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/data/xref';
const OUT_DIR = path.join(__dirname, 'output');
const VOTE_THRESHOLD = 10;

// Same 66 short-form codes used throughout the repo's xref/, MHC/,
// Scofield/, Calvin/, TDavid/ per-book files -- confirmed consistent
// convention this session.
const BOOKS = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
  'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO',
  'OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS',
  '1PE','2PE','1JN','2JN','3JN','JUD','REV'
];
const BOOK_INDEX = Object.fromEntries(BOOKS.map((b, i) => [b, i]));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

(async () => {
  // key = "BOOK:chapter:verse" -> max vote seen
  const candidates = new Map();

  console.log(`Fetching all ${BOOKS.length} xref files...`);
  for (const book of BOOKS) {
    let data;
    try {
      data = await fetchJson(`${XREF_BASE}/${book}.json`);
    } catch (err) {
      console.log(`  ${book}: FAILED (${err.message}) -- skipped, not guessed`);
      continue;
    }

    let addedFromThisBook = 0;
    for (const ref of data.refs || []) {
      if (ref.v < VOTE_THRESHOLD) continue;

      // FROM side -- anchored in the current book being processed.
      const fromKey = `${book}:${ref.fc}:${ref.fv}`;
      const prevFrom = candidates.get(fromKey);
      if (!prevFrom || ref.v > prevFrom) {
        candidates.set(fromKey, ref.v);
        if (!prevFrom) addedFromThisBook++;
      }

      // TO side -- could be any book, including a different one than
      // the file we're currently reading.
      if (ref.tb) {
        const toKey = `${ref.tb}:${ref.tc}:${ref.tv}`;
        const prevTo = candidates.get(toKey);
        if (!prevTo || ref.v > prevTo) {
          candidates.set(toKey, ref.v);
          if (!prevTo) addedFromThisBook++;
        }
      }
    }
    console.log(`  ${book}: ${(data.refs || []).length} entries scanned, ${addedFromThisBook} new candidate verses added (running total: ${candidates.size})`);
  }

  // Convert to sorted array, canonical Bible order.
  const verses = [...candidates.entries()].map(([key, votes]) => {
    const [book, chapter, verse] = key.split(':');
    return { book, chapter: parseInt(chapter, 10), verse: parseInt(verse, 10), votes };
  });

  verses.sort((a, b) => {
    const bookDiff = (BOOK_INDEX[a.book] ?? 999) - (BOOK_INDEX[b.book] ?? 999);
    if (bookDiff !== 0) return bookDiff;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, 'xref_seed_pool.json');
  fs.writeFileSync(outFile, JSON.stringify({ threshold: VOTE_THRESHOLD, verses }, null, 2));

  console.log(`\n=== DONE ===`);
  console.log(`Total unique candidate verses: ${verses.length}`);
  console.log(`Books represented: ${new Set(verses.map(v => v.book)).size} of ${BOOKS.length}`);
  console.log(`Output: ${outFile}`);

  // Quick sanity summary per book, so any suspiciously-thin book is visible.
  const perBook = {};
  for (const v of verses) perBook[v.book] = (perBook[v.book] || 0) + 1;
  const thin = BOOKS.filter(b => (perBook[b] || 0) < 3);
  if (thin.length) {
    console.log(`\nBooks with fewer than 3 candidate verses at this threshold (expected for short books, worth a glance otherwise): ${thin.join(', ')}`);
  }
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
