# Marks Music app notes

Last reviewed: 2026-10-22 (Asia/Kolkata)

These notes are the working map for future changes. Update this file in the same change as each app change: record the behavior changed, source/database locations, migration or deployment implications, and what was verified. Keep credentials, passwords, calendar subscription URLs, student records, and secrets out of this file.

## Project and live services

- Repository: `marksmusicschool/Marks-Music`; default branch is `main`. GitHub Pages is documented as serving `site/` from `gh-pages`; app URL: `https://marksmusicschool.github.io/Marks-Music/`.
- Supabase project: `jfylfmdzkfaprqmcoxwx` (active, region `ap-southeast-2`), API host `https://jfylfmdzkfaprqmcoxwx.supabase.co`.
- Main app endpoint: `/functions/v1/marks-api`. Live Edge Function is active (version 6, JWT verification disabled); requests use the app's own password check.
- A second live Edge Function, `student-portal` (active version 1, JWT verification disabled), supports the student progress site. Its source is on `gh-pages` and `feature/student-portal-auth`, but not on `main`.
- GitHub connection reports `push` permission. The Supabase SQL connection runs as `postgres` and reports database schema/object creation privileges. This establishes technical write capability; it does not mean production writes or deploys should be made casually.

## Source map

- `site/index.html`: the admin app source on `main` (HTML, CSS, JavaScript). API constant points at the live project above. It supports Log, Dashboard, and Log History views.
- `gh-pages/index.html` is the deployed admin page; `gh-pages/student.html` is the deployed student progress page. Shared `icon-180.png`, `icon-192.png`, and `icon-512.png` assets are the Marks Music brand artwork.
- `gh-pages/manifest.webmanifest` installs the admin at the site root. The student page uses `student-manifest.webmanifest`, whose start URL is `student.html`, while reusing the same brand icons. Keep these manifests separate so installing the student app opens the student experience.
- `site/manifest.webmanifest` and `site/icon-*.png`: installable web app metadata and icons.
- `supabase/functions/marks-api/index.ts`: Deno Edge Function; validates the shared app password, routes app actions, accesses Postgres, and fetches calendar feeds.
- `supabase/functions/marks-api/calendar.js`: iCalendar parsing helpers, including floating-time conversion, recurrence expansion/exceptions, cancellation filtering, deduplication, and event sorting.
- `gh-pages/student.html` and `gh-pages/supabase/functions/student-portal/index.ts` contain the student portal UI and backend. These currently are not on `main`.
- `supabase/migrations/20261011_mm_logging_app.sql` and `20261012_mm_dashboard_history.sql`: only two migration files currently in the GitHub tree on `main`.
- `README.md` and `INSTALL.md`: operator setup and user workflow documentation.

## App behavior and request flow

1. The browser sends POST JSON to the Marks API. Every request includes the app password; the backend validates it against a bcrypt hash via `mm.check_password`. The app stores its signed-in state locally on that device; Lock clears the local session.
2. `bootstrap` loads the exercise catalogue, student list/bests and calendar connection status. The catalogue is based on public `categories`, `subcategories`, and `items`.
3. The Log view selects or creates a student, accepts exercise shorthand/BPM rows (or pasted notes), and sends `log`. The database routine creates unknown students with `teacher_id = 1`; for a repeated student/exercise/date, it retains the higher score. Positive BPM is required.
4. `bests`, `students`, and `student_history` back student progress and Dashboard summaries. `history` is paginated and `delete_log` removes a selected history row. `day_logs` reloads a student's entries for a selected day.
5. Calendar settings store three Apple public iCalendar feed URLs under `Personal`, `Offline`, and `Swaralaya`. The API validates a feed when saved; `today` fetches and parses it. The browser refreshes class lists and matches event titles to student names. Calendar links reveal class names/times to anyone possessing them.
6. Other main API actions: `login`, `set_calendar`, and `today`. The browser's API helper is in `site/index.html`; action routing is in `marks-api/index.ts`.
7. The live `student-portal` function supports student login/refresh/logout, forced password change, student-only bootstrap and history, plus password-gated admin listing/reset of student accounts. It uses Supabase Auth and `private.student_portal_accounts`. Its UI and backend are present on `gh-pages` (and the feature branch), while `main` does not include them. Check deployed `gh-pages` before changing student-facing behavior.

## Data model and live/source drift

- Public app tables observed live: `students`, `teachers`, `admins`, `categories`, `subcategories`, `items`, and `student_logs`. RLS is enabled on all seven. Key links: students to teachers; items to categories/subcategories; student_logs to students/items.
- Exercises are ordered by `items.exc_order`; `student_logs.score` is a positive integer in the live database. `student_logs.created_at` records class time/date.
- The private `mm` schema contains password-gated database routines and settings. Settings include the app password hash and calendar feed URLs. Do not read or expose secret values.
- Live migration history has nine entries, through `20261015125538 student_portal_auth`. `main` contains only the two older migration files; the `gh-pages` tree also contains `20261015101112_student_portal_auth.sql`, but the repo still lacks several live migrations and is behind production. The live `mm.log_class` also has a six-argument overload with explicit timestamp, beyond the five-argument function in the checked-in initial migration.
- Because checked-in migrations on `main` are behind live migration history, reconcile schema/function history before deploying migrations or Edge Functions. Do not assume the main branch migrations alone reproduce production.

## Change log

- 2026-10-22: Admin login repair. The Progress code on `gh-pages` initially contained escaped template-string delimiters, causing a JavaScript parse error before the login handler initialized. Replaced that grouping block with the corrected implementation from `main/site/index.html` and published it to `gh-pages/index.html` in commit `644366e372e47737676fcbd0a1b84b0f6fbd7796`. No password or credential was accessed.

- 2026-10-22: Teacher Progress workflow and rhythm grouping. On `main/site/index.html`, renamed the visible Dashboard tab to Progress; selecting Progress opens the current saved student from Log when one is loaded; progress rows now group supported rhythm suffixes (downstroke, Waltz, Foxtrot, Strumming Pattern N) within their exercise category and retain catalogue order inside each group. The change was published to `gh-pages/index.html` in commit `caf5a176ae4507eae15a1fe6aa261ac2c7a13ca9` after the user confirmed that requested app changes should go live.

- 2026-10-22: Initial source/live-system review. Confirmed repository and project identity, read app/install docs and the complete static app/backend/calendar source, inspected live project metadata, public table structure, migration history, and live Edge Function inventory. No production data or configuration was changed. Created this baseline map.
- 2026-10-22: Student brand and install metadata. `gh-pages/student.html` now points to the shared Marks Music favicon and Apple touch icon, and to a student-specific PWA manifest that reuses the admin artwork but launches `student.html`. Existing wordmark styling was already consistent. Updated `APP_NOTES.md` to capture the branch/source layout and install behavior. Verified both student page metadata and manifest after the GitHub commits; existing installed devices may need to refresh or re-add the app to refresh a cached icon.

## Progress preload and exercise grouping — 2026-10-22

- Selecting a saved student on Log starts fetching their full progress history in the background, alongside the existing best-score request.
- Progress details reuse that in-memory history immediately when opened. Students first opened from the Progress list fetch once, then also use the cache on later visits.
- Saving a class forces a fresh history request for the saved student. Version tracking prevents an older in-flight request from overwriting that refreshed cache.
- Progress rows are ordered by the existing exercise catalogue and nested by catalogue category, catalogue subcategory (exercise type), then rhythm variant. Entries without a rhythm stay under their type without a rhythm heading.
- The cache lives in page memory only; it is rebuilt when the page is reloaded. No database schema or Edge Function changes were needed.
- Published source update on `main`: `d8343407fedde8ffc6e92c2e9d0d103e03840f71` (`site/index.html`). Deployed student/admin page on `gh-pages`: `f5d0fe42b747d5b166b21ad18ecf3a310f172e51` (`index.html`).
- Verification: fetched both committed files and confirmed the preload hooks, refresh after save, nested type/rhythm grouping, and cache version guard are present. Runtime browser interaction was not exercised in this change.

## Progress-to-Log selection and category styling — 2026-10-22

- Selecting a student from the Progress list now selects that student in the Log form as well. Selecting the same student already in Log does not trigger a redundant selection.
- Main category headings in Progress use the existing brass/yellow theme color and a slightly larger size; type and rhythm headings remain at their existing sizes.
- No database or Edge Function changes were needed.
- Published source on `main`: follow-up commits `ca3acf7837324109f6f7480c4bc05c28bf2d929e` and `39febd60e2299edd718e7a39388511e3fc063ae9` (`site/index.html`). The latter corrects a duplicated async declaration caught during review.
- Deployed app on `gh-pages`: `3f9c55c951dac25dc493ad8508bac7faba2d94e3` (`index.html`). The blocked deployment attempt was corrected before publishing.
- Verification: source and deployed page were checked for one valid async progress loader, student selection synchronization, and the new category style. No browser interaction was performed.
