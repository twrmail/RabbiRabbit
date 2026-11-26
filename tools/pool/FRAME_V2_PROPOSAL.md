# frame_v2 proposal (Nov 26, 2026): an approval covers the whole study

**Status: proposal only. Not built. Needs Tom's go-ahead.**

## The gap
An approval record holds three fingerprints: source, pieces and frame. `frame_v1` hashes the picked pieces, their roles, labels and references, and the gap and pointer lines. It does not hash anything else the reader sees, including:
- the modern-language summaries (`SAY`);
- Study D's headings (`HEAD`);
- Rabbit's own focus, take, questions, closing and reflection;
- the credits and the page note;
- the WEB verse text.

Proof (PR #112): Study D's take and closing were reworded, and all four approval records came out byte-identical.

## The rule
**The page is rendered from the frame, and from nothing else.** frame_v2 is a single object, in reading order, holding every word the reader will see. The renderer may add only fixed layout (HTML tags and CSS). Every word on the page then sits inside the hash, so changing any of it breaks the approval.

## What frame_v2 holds (render order)
```
frame_version: "frame_v2"
renderer: "study_html_v1"          # names the fixed label set and layout; a label change means a new renderer id
scope, edition
study: { key, title, shape,
         focus,                     # Rabbit's own
         take,                      # Rabbit's own
         question, closing }        # Rabbit's own (study-level; null if the shape has none)
verses: [ { verse, scripture_text,  # the WEB text exactly as printed
            question,               # Rabbit's own per-verse question, or null
            items: [ { id, role, role_label,          # e.g. "What it means"
                       teacher, compiler, container, work, reference, covers_label,
                       heading,                        # AI heading or null
                       summary,                        # AI modern-language summary or null
                       text,                           # stored teacher text, exact
                       citation_line } ],              # Gill footnote line as printed, or null
            gap_line, pointers } ]
labels: { ai_summary: "Modern language, by AI", ai_heading: "Heading by AI",
          own_words: "{teacher} in his own words", own_take: "Rabbit's own take", ... }
credits: "<the credits sentence exactly as printed>"
note: "<the page note exactly as printed>"
```
For a model-written weave (`weave_v1` in the weave design), bridges, summaries, questions and takeaways go into the same slots. One frame_v2 serves both hand-written and model-written studies. The weave design's "frame_v1 plus the weave plan hash" is replaced by this.

Left out on purpose: CSS, fonts and spacing. A colour change should not force re-approval; a word change should.

## Tests (a build fails if any one fails)
1. **Every field is covered (generated, not hand-picked).** Walk every string in the frame. For each one, change one character, and check two things: the frame fingerprint changes, and `is_servable` returns false with "frame fingerprint does not match". The test counts the fields it touched and fails if the count is zero or lower than the frame holds.
2. **Nothing on the page is outside the frame.** Render the page, remove the fixed markup, then remove every frame string. No visible text may be left over.
3. **Round trip.** Rendering the same frame twice gives byte-identical HTML. Each teacher text block, read back from the HTML, equals its pool piece.
4. **Sentinel.** Put a marker word into a summary, a heading, a take, a per-verse question, a closing and the credits, one at a time. Each time, the marker appears on the page and the old approval is refused.
5. **Version guard.** A frame_v1 record is never servable under frame_v2. `is_servable` already refuses a version mismatch.
6. The existing 13 tamper tests carry over unchanged.

## Migration
- No study has been approved yet, so nothing is lost.
- The A–D records are rebuilt as frame_v2, still PENDING.
- `fingerprints.py` keeps `build_frame` for v1 (used by old reports) and adds `build_frame_v2`.
- `build_studies_jhn.py` builds the frame first, then renders the page from it.

## Decisions for Tom
1. Should the credits line and the page note be inside the approval? Recommended: yes. They make claims about rights and AI text.
2. Should the WEB verse text be inside the approval? Recommended: yes. Today no fingerprint covers the Bible text file.
3. Should a label change (for example "Modern language, by AI") force re-approval of every study? Recommended: yes, through the renderer id.
