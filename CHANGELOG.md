# RabbiRabbit Worker — Version History

Extracted from the worker file's header comments, which had grown to 280
lines (7.7% of the file) sitting before any actual code. Kept here as
real, valuable history — just moved out of the way of the code itself,
since a long comment block at the top of a working file is exactly the
kind of place a stale, outdated claim can sit unnoticed and mislead a
future reader who trusts it without re-verifying (this happened for
real once already: v19's header claimed per-book files "already use
runtime codes as filenames," which was wrong, and cost real effort to
untangle before the actual 37-book alias bug got found and fixed).

// RabbiRabbit Cloudflare Worker v20
// v20 adds, on top of everything in v19:
//       BOOK-CODE ALIAS BUG FIXED — confirmed live, currently-active,
//       affecting 37 of 66 books across MHC, Scofield, and JFB. Root
//       cause: parsePassage()/BOOK_MAP produces a LONG-FORM runtime
//       code (DEUT, ACTS, EZEK, 1SAM, PHIL, 1COR, etc.) for most books,
//       but the real per-book files on GitHub are named with SHORT-FORM
//       codes (DEU, ACT, EZK...) — confirmed directly against live
//       files: MHC/DEU.json = 200, MHC/DEUT.json = 404, same for
//       Scofield and JFB. fetchMHC()/fetchScofield() gated on a Set of
//       short codes checked against the raw long-form bookId, so the
//       gate silently failed and the real file was never even
//       requested; fetchJFB() had no gate at all and just 404'd. Net
//       effect: for the majority of the Bible, MHC/Scofield/JFB
//       commentary was invisible to users despite the data existing
//       and being correctly built. Predates this session entirely.
//
//       THE FIX: one canonical translation table (toShortCode(), reusing
//       XREF_BOOK_MAP, already proven correct in production) applied
//       INSIDE fetchPerBookFile() itself, unconditionally, plus at each
//       gate check (fetchMHC/fetchScofield/fetchSpurgeon). Any per-book
//       source — current or future — gets correct translation
//       automatically just by going through fetchPerBookFile(); a new
//       source's fetch function does not need to remember to alias
//       anything. This is the structural answer to needing one
//       consistent, hard-to-forget principle instead of scattered,
//       partial fixes: exactly one table, one function, applied
//       everywhere a per-book file is fetched. See toShortCode()'s
//       comment for full detail, including the deliberate exception for
//       the still-array-format legacy sources (Barnes/Clarke/Vincent/
//       Meyer), whose internal book-code convention is confirmed
//       INCONSISTENT even within a single file (Deuteronomy stored
//       long-form, Acts stored short-form, same file) and is treated as
//       legacy debt to migrate away from, not further alias-patch.
//
//       CALVIN RE-ENABLED. fetchCalvin() was returning null
//       unconditionally since the old Calvin_commentary.json turned out
//       to be a Scripture-text dump, not real commentary. Fully rebuilt
//       this session from bible.helloao.org's john-calvin dataset
//       (CrossWire SWORD module, sourced from CCEL, public domain),
//       spot-verified live against real page text. 48 per-book files.
//       Now safe to serve since it goes through the same
//       fetchPerBookFile() + toShortCode() path as everything else.
//       See fetchCalvin()'s own comment for the three known, confirmed
//       gaps (2/3 John never written, Ezekiel 21+ unfinished at Calvin's
//       death, Jeremiah 52 unresolved).
//
//       DEVOTIONAL POST-STREAM STRIPPER. The devotional prompt requires
//       generation to stop after "Sit with that for a moment before the
//       day begins." — no Rabbit Trail, Rabbi Road, or Over the Hill.
//       LLM instruction-following isn't 100% reliable; if the model
//       kept generating anyway, users could see forbidden sections. Now
//       enforced in real time during streaming: once the closing marker
//       is seen in the accumulated output, every chunk after it is
//       dropped before it reaches the client (content already streamed
//       can't be retroactively un-sent, so this has to intervene as
//       chunks are produced, not after the fact). Also fixed in the
//       same pass: the honest sources footer was being written
//       unconditionally for every studyType, including devotionals,
//       despite the prompt's explicit "NO sources footer" instruction —
//       now skipped for devotionals.
//
//       DUPLICATE COMMENTARY-SOURCE PREVENTION. Confirmed real pattern
//       in live output: the same scholar appearing in two back-to-back
//       >>COMMENTARY blocks (nothing but synthesis prose or a
//       >>SCRIPTURE block between them) reads redundant and crowds out
//       other voices. True prevention (not just after-the-fact
//       detection) requires holding output briefly: text is now
//       buffered ONLY while inside a >>COMMENTARY...>>END block (short
//       by design), and a block is compared against the immediately
//       preceding commentary block's scholar before being forwarded to
//       the client — an exact repeat is dropped, everything else
//       (including the same scholar appearing again after a DIFFERENT
//       scholar spoke in between) forwards normally. All non-commentary
//       text continues streaming immediately, unbuffered, exactly as
//       before. The real sources footer still credits a source whose
//       duplicate block was dropped, since the material genuinely
//       appeared once — fullText accumulates the model's raw complete
//       output regardless of what the client-facing router forwards.
//
// v19 adds, on top of everything in v18e:
//       BOOK_MAP Psalms entries corrected: 'psalms','psalm','ps','psa','pss'
//       all now return 'PSA' (the runtime code) instead of 'PS'. Before
//       this fix, parsePassage('Psalm 23') returned bookId='PS', which
//       failed MHC_BOOKS.has('PS') check and caused fetchMHC() to return
//       null for every Psalm study. Confirmed live: Protestant line was
//       empty for Psalm 23 despite MHC/PSA.json existing and being
//       pristine. Fix is in BOOK_MAP, not in the fetch infrastructure.
//
//       fetchJFB() switched from fetchFromJsonFile() to fetchPerBookFile()
//       now that the JFB data rebuild (August 2026) produced per-book
//       files at data/commentary/JFB/{BOOKID}.json. Before: single 10.8MB
//       array file, every chapter capped at 2000 chars, 47MB heap on
//       parse. After: one small file fetched per study, average chapter
//       length 9,315 chars (up from 1,928), zero capped chapters.
//
//       NOTE: PER_BOOK_FILE_ALIASES was added then removed in the same
//       session after confirming all per-book sources (MHC, Wesley,
//       Scofield, Spurgeon) already use runtime codes as filenames --
//       the alias map was built on a false assumption and was actively
//       breaking MHC by redirecting PSA to PS.json which doesn't exist.
//       The "36 dead books" problem for array sources (JFB, Barnes,
//       Clarke) is resolved differently: those sources are being
//       converted to per-book format, which inherits the correct runtime
//       codes directly.
//
//       Barnes and Clarke still use fetchFromJsonFile() against the
//       capped array files pending completion of their per-book rebuild.
//       Calvin remains on fetchFromJsonFile() pending a full data rebuild
//       from a clean English source.e
// v18 adds, on top of everything in v17:
//       SOURCE-FIRST DISCIPLINE AND 16-VOICE REGISTER SYSTEM.
//       The core failure mode in prior versions: AI synthesis prose
//       was crowding out the actual commentators -- describing what
//       they said rather than letting them say it. The model was
//       functioning as a lecturer about sources rather than a host
//       introducing them. Two structural changes fix this:
//
//       (1) SYNTHESIS CAP: AI framing prose now has explicit word
//       budgets per function -- 2-4 sentences to introduce a voice,
//       1-3 sentences to bridge between voices, 3-5 sentences to
//       open or close a section. Total AI prose target across the
//       full main body is 20-25% of word count. Commentators write
//       the study; the model curates it. The old "PREFER REAL SOURCES"
//       instruction was a preference; this is a strict discipline
//       with named functions and sentence counts.
//
//       (2) 16 VOICE REGISTERS: Every Protestant commentator and
//       every Church Father in the source stack now has a 3-5
//       sentence voice register in the prompt describing how their
//       voice moves, what temperament and method they bring, and
//       when to deploy them. The model reads these before it
//       encounters the source texts, so it knows not just WHAT each
//       voice said but HOW each voice moves through an argument.
//       Four voices identified as primary (MHC, Clarke, Spurgeon,
//       Calvin) -- fetch cap raised from 1500 to 2000 characters
//       to give more raw material for the model to quote from at
//       real length. Secondary sources remain at 1500.
//
//       CHARACTER STUDY COMMENTARY FIX (found via live testing on
//       Leah): character studies were fetching commentary for only the
//       single anchor chapter from characters.json. A character whose
//       story spans multiple chapters (Leah: Genesis 29-30+) received
//       no commentary at all when the anchor chapter was thin or absent
//       in the source data -- confirmed: the Leah study produced a
//       sources footer showing only cross-references, because every
//       commentary fetch for Genesis 29 returned null. Three fixes:
//       (1) fetchMerged() helper fetches commentary across multiple key
//       chapters for character studies (anchor + up to 2 additional
//       chapters from characterRecord.chapters if present), merging
//       results with chapter labels so the model knows which passage
//       each excerpt covers, capped at 2500 chars total.
//       (2) Nave's Topical Bible is now fetched for the character name
//       directly (fetchNaves(primaryInput)) for character studies --
//       Nave's has entries for major figures (Leah, Elijah, Peter, etc.)
//       that provide real cross-reference material even when chapter-
//       level commentary is absent.
//       (3) navesCharacterFetch wired into Promise.allSettled and the
//       commentaries assembly list alongside existing sources.
// v15 adds, on top of everything in v14:
//       fetchWordOccurrences() -- real Strong's concordance lookup
//       (strongs_concordance.json, built from CrossWire's original
//       Strong's-tagged KJV OSIS data after finding and fixing a real
//       bug in a third-party conversion of it -- see the guide)
//       Word Study now anchors to the SPECIFIC chosen word's own real
//       occurrence, in both the paid generation flow and /study-preview
//       -- previously every candidate silently fell back to the same
//       result regardless of which word was chosen; confirmed fixed
//       live (cháris -> Luke 1:30, chên -> Genesis 6:8, correctly
//       different anchors for different words)
//       searchStrongsByGloss() now guarantees real representation from
//       BOTH testaments in the /word-lookup pick-list -- confirmed real
//       bug where "love" returned only Hebrew results because 12 tied
//       Hebrew matches filled the whole limit=10 cutoff ahead of G25/
//       G26 (agápē/agapáō), which scored an equally genuine 100 but
//       lost purely on insertion-order tie-breaking
//       normalizeStrongsText() now strips diacritics before matching --
//       confirmed real gap: typing the plain-ASCII transliteration
//       ("agape") could never match the stored accented form ("agápē"),
//       even though it was genuinely present in the data the whole time
//       fetchHistoricalContext() now checks each source's own real
//       intro marker before including it, instead of blindly trusting
//       chapter 1 -- confirmed real gap live in production: Matthew's
//       Historical Context showed unrelated genealogy footnotes
//       ("Josias... Six Marys...") because Scofield has no true Book
//       Introduction for 6 of 65 books. Clarke has a different, non-
//       overlapping 7-book gap. Checking both closes the gap completely
//       across all 66 books using only data already hosted.
//       Prompt tightened for conciseness and guaranteed completion:
//       removed the "no ceiling" instruction for Deeper Study, which
//       directly contradicted the shared fixed token budget and was a
//       real, confirmed cause of cutoffs -- replaced with real, bounded,
//       audience-specific word targets for every audience (Deeper still
//       genuinely gets more room than General, just not unlimited).
//       Removed "no word limit" claims for main body and Rabbit Trail/
//       Rabbi Road/Over the Hill, replaced with real targets. Added an
//       explicit anti-repetition instruction to the main study prompt
//       (previously only Devotional had this, despite the same failure
//       mode applying everywhere). Tightened Level 3 synthesis guidance
//       to favor real source quotes over invented paraphrase when
//       either could serve -- less ad lib, more grounded in what
//       sources actually say. Verified: new Deeper Study targets leave
//       a genuine ~26% safety margin under the real 5000-token ceiling.
//       DECIDED AND SHIPPED: General and Deeper Study no longer get
//       embedded 💬 discussion points -- Deeper's own instructions
//       already said "trust the reader without hand-holding," directly
//       conflicting with interruption prompts. Small Group/Youth/New
//       Believers keep them, since that's genuinely their design.
//       DECIDED AND SHIPPED: Over the Hill now grounded in a real
//       second-hop cross-reference fetched from Rabbi Road's own
//       destination, not AI invention -- same real-data discipline
//       already proven for Rabbit Trail. Verified live end-to-end on
//       Numbers 6:22-27: Rabbi Road lands on 2 Chronicles 7:14, and the
//       real second hop correctly surfaces genuinely connected verses
//       (Proverbs 28:13, Jeremiah 33:6) about the same repentance/
//       healing theme -- not coincidence, real crowd-ranked data
//       followed honestly one hop further.
// v16 adds, on top of everything in v15:
//       RABBIT TRAIL MOVED EARLY. Previously all three of Rabbit Trail /
//       Rabbi Road / Over the Hill were appended after the full main
//       body. Tom's field testing flagged this as backwards for how the
//       feature is meant to feel -- the Trail should be a real detour
//       taken partway through the study, not a coda tacked on at the
//       end. buildPrompt() now gives the model an explicit STRUCTURE
//       block: title/opening -> Rabbit Trail (early) -> return to the
//       passage and complete the main teaching -> Rabbi Road -> Over
//       the Hill. Rabbi Road and Over the Hill remain the closing
//       sections; only Rabbit Trail moved. verifyTrailCitation()
//       required no code change -- it already regex-searches the full
//       text for both citation lines regardless of position.
//       HONEST SOURCES FOOTER, built by code instead of asked of the
//       model. Confirmed real bug via live field testing: the model was
//       listing every commentary/patristic source it was GIVEN in the
//       prompt as "consulted," even sources it never actually surfaced
//       in the body (e.g. Calvin and two Church Fathers appeared in a
//       study's footer with zero presence in the text). This is the
//       same "confident wrong answer" problem the sources footer exists
//       to prevent, just showing up in the citation list instead of the
//       body. Fix: the model is now told NOT to write a sources footer
//       at all. After the stream completes, the real fullText is
//       checked against every source actually fetched (same detection
//       already used for the existing UNUSED/UNTAGGED console logging,
//       generalized to also cover patristic sources, which the old
//       verifyCommentaryUsage() did not check). Only sources that
//       genuinely appear in the output are listed. The footer is then
//       appended to the stream as real, code-generated content -- the
//       model can no longer overclaim what it drew on.
// v17 adds, on top of everything in v16:
//       RABBIT TRAIL ELIMINATED AS ITS OWN SECTION -- real bug found via
//       live testing tonight on Daniel 4 / Acts 8:22, confirmed two
//       distinct problems:
//       (1) When a passage has only ONE real cross-reference, the old
//       fallback logic (`trailOptions = remainingRefs.length > 0 ?
//       remainingRefs : [topRef]`) let Rabbit Trail fall back to the
//       SAME reference reserved for Rabbi Road -- both sections cited
//       Acts 8:22, defeating the entire "two distinct destinations"
//       design. Not a rare edge case: many single passages genuinely
//       only have one strong cross-reference.
//       (2) Over the Hill's second-hop fetch was only filtered against
//       Rabbi Road's own reference, never against the ORIGINAL passage
//       being studied -- so the "second hop" could (and did) loop
//       straight back to Daniel 4:27, the verse the study opened with.
//       A trail that leads back to where it started isn't a trail.
//       Per Tom's redesign: Rabbit Trail no longer exists as a separate
//       required section. buildPrompt()'s STRUCTURE is now: title ->
//       opening -> full main teaching (optionally weaving brief, real
//       mentions of SUPPORTING CROSS-REFERENCES -- crossRefs[1:] --
//       naturally into the prose where they illuminate the text, no
//       dedicated heading or citation-line format required) -> Rabbi
//       Road (still cites crossRefs[0], the single highest-ranked
//       connection, exactly as before) -> Over the Hill. This structurally
//       removes bug (1): Rabbi Road no longer needs a *different*
//       reference from anything else, so a passage with only one real
//       cross-reference is no longer a conflict. Bug (2) is fixed
//       directly in code: secondHopCrossRefs is now also filtered to
//       exclude any candidate whose book+chapter matches the original
//       studied passage, not just Rabbi Road's own reference.
//       verifyTrailCitation() renamed to verifyRabbiRoadCitation() and
//       simplified to check only the Rabbi Road citation line, since
