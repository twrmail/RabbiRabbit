# RabbiRabbit Study Worker v1

Serves finished studies: build once, serve many. No model calls, no API key. A separate Worker from the live v46, which stays untouched.

- Reads `pool/studies/index.json` and the study pages it names from this public repo (main branch).
- Serves a study only if the index marks it **approved** (by a named person, with a time), and only if the page's bytes match the
  sha256 the index records. Anything else is refused, never patched. (`study_index.py check` in CI already makes sure every approved
  study is servable before the index can change on main.)
- **Review mode:** set the variable `REVIEW` = `on` and pending studies are shown too, under a "NOT YET APPROVED" banner. That is Rabbit's
  review screen on his phone. Leave it unset for the public.
- The app is installable (manifest, icon, offline copy of studies already opened). A passage search ("John 3:16") finds the unit's studies,
  or says no finished study covers it yet and links to live RabbiRabbit.

Deploy (Cloudflare dashboard): Workers & Pages -> Create -> Worker -> name it (for example `rabbistudy`) -> Deploy -> Edit code -> paste
all of `worker.js` -> Deploy. Then Settings -> Variables -> add `REVIEW` = `on` while reviewing.

Test offline: `node tools/study-worker/test-worker.mjs` (GitHub replaced by this checkout's files; includes a tampered-page refusal).
