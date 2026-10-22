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

## Progress category hierarchy refinement — 2026-10-22

- Prevented duplicate subcategory labels when an exercise subcategory matches its main category (for example, “Melodies” under “Melodies”).
- Songs are now grouped as main category → scale/key subcategory → chord style (“Open Chords” or “Bar Chords”), inferred from the item name suffix. Existing song key subcategories remain intact.
- Main category titles use brass/yellow; scale/key subcategory titles are lighter gray; chord-style titles use the normal gray heading style. Other exercise categories retain their rhythm grouping.
- Read-only catalogue inspection confirmed song item names end in “open chords” or “bar chords” and are stored under their key subcategories.
- Published source on `main`: `2d3a506dd0e32bad10eb556e7723989b2d7aaf1a` (`site/index.html`). Deployed app on `gh-pages`: `a382b79124f7ab1c75b71323599dfb67ad9812da` (`index.html`).
- Verification: checked both committed files for duplicate-category suppression, song chord-style grouping, and the three heading styles. No browser interaction was performed.

## Heading contrast adjustment — 2026-10-22

- Reduced opacity on the Songs scale/key headings (such as G Major and C Major) and kept Open/Bar Chords headings at full opacity, making the key headings lighter than the chord-style headings.
- Published source on `main`: `4a754da0504e6609dff6685b7809dc8190a85701`. Deployed app on `gh-pages`: `a15ecc8bc4c2e66114756fbcd7280ef6b265e383`.
- Verification: confirmed both files use the lighter key heading and full-strength chord heading styles.

## Solid scale-heading color — 2026-10-22

- Replaced transparency on Songs scale/key headings with a fully opaque light color: `--soft-ink` is `#b6b4ae` in light mode and `#dedbd4` in dark mode. Open/Bar Chords headings retain the regular muted gray.
- Published source on `main`: `6764b5b6ec3f49b3bfffe21a4228ed4e68b57ea5`. Deployed app on `gh-pages`: `cec850ece0f67d894d897cd0628213c636ada18e`.
- Verification: confirmed the scale heading uses full opacity and the solid theme variable in both files.

## Student Progress UI parity — 2026-10-22

- The student portal is a separate page, `student.html`; changes to admin `index.html` do not propagate to it automatically. Keep Progress UI behavior and presentation aligned across admin `index.html` and student `student.html`.
- Applied the current Progress hierarchy to the student page: category → subtype (including song scale/key) → rhythm or song chord style. Matching category/subcategory names do not render twice.
- Student page heading colors now match admin: brass main categories; fully opaque, lighter `--soft-ink` scale/key headings; muted gray Open/Bar Chords and rhythm headings. Soft ink values match both light and dark admin themes.
- Published student page on `gh-pages`: `5d15238f1b513d7cf4c723dc066b35ca07695977`. Updated student source on `feature/student-portal-auth`: `8dc63edd849b4b6f4f819459b0897eef68986548`.
- Verification: confirmed both student page copies contain category deduplication, song Open/Bar grouping, rhythm grouping, and the solid scale/key theme colors. No student account browser session was used for runtime visual verification.
- Going forward, every Progress UI change should be applied to the admin page and student page, then checked on both deployed copies before reporting completion.

## Admin student management — 2026-10-23

- Student Access is now the Admin hub. It supports adding a student, creating/resetting their portal login, and deactivating/reactivating their account.
- Added `public.students.active boolean not null default true`; existing students remain active after migration. Deactivation changes only this flag. Logs, accounts, and student records remain stored.
- Active-only roster summary keeps inactive students out of the Log/Progress student pickers. The student portal rejects login, refresh, and authenticated actions for inactive students. Admin can reactivate them, preserving their prior account and data.
- Student portal admin API actions require the existing admin password check. New students are added active, then use the existing “Create login” action to issue a temporary password.
- Database migration: `add_student_active_status`; roster function migration: `filter_inactive_students_from_summary`.
- Student portal Edge Function deployed as version 2.
- Admin UI deployed on `gh-pages`: `815b14e9ab3dffcc87099cd26b3ce3e5ee654afa`.
- Verification: read-only schema query confirmed the active column; updated `mm.students_summary` filters inactive records; deployed Edge Function and UI source contain create/toggle actions and inactive-login checks. Existing student data was not moved or deleted.

## Reselecting Log or Progress clears student — 2026-10-23

- Clicking Log or Progress while already on that tab clears the selected student from the shared Log/Progress state. Reselecting Progress returns from the student detail to the full progress list.
- Switching between Log and Progress remains unchanged; the selection is cleared only when clicking the tab already open.
- Applied to admin source `site/index.html` and deployed page `gh-pages/index.html`.
- Commits: main `488770dfebab394f7155d72ded242730201a1a6a`; gh-pages `2a31691154cf6e45787d055be183f26bc1aff301`.
- Verification: confirmed the same-tab click handler is present in both files. No browser interaction was performed.

## Cross-page student data readiness — 2026-10-23

- Selecting a student in Log continues to preload Progress history while loading Log best scores.
- Selecting a student in Progress now awaits the Log best-score request while Progress history loads, so the Progress view is not considered ready until both views' data is available. Requests run concurrently through the existing selection flow.
- Applied to admin source `site/index.html` and deployed admin page `gh-pages/index.html`.
- Commits: main `1a209a1199697fe542f9bc83c1a8eabee800b663`; gh-pages `ff7c23ca800069ed3c93f2d948a23b96a9cefcfb`.
- Verification: confirmed Progress selection awaits Log data loading; the Log selection path still starts Progress history preload.

## Log History moved into Admin — 2026-10-23

- Removed Log History from the top-level tabs and placed its filter, entries, pagination, and status inside Admin below student access management.
- Opening Admin loads both student account controls and Log History.
- Deployed on `gh-pages`: `1ceb1a5f11a7dbe1eb273ca384f6f59c97d75a55`.
- Verification: confirmed no standalone history view/tab remains in the deployed admin page and the history controls are inside Admin.

## Compact Admin previews and dedicated lists — 2026-10-23

- Renamed the student-management area to “Active Students” and limited the Admin overview to a four-row preview.
- Added dedicated Active Students and Log History pages with Back to Admin buttons. Clicking Admin again from either page returns to the overview.
- The full student page has active controls plus a separate expandable Inactive Students list for reactivation. Create/reset login actions remain available for active students.
- Log History preview is height-limited; the full page retains filtering and pagination.
- Deployed on `gh-pages`: `f38dd19646a185e7dc1329240b82bd20fb413ced`.
- Verification: confirmed preview and full-list containers, dedicated page navigation, Admin return handler, inactive reactivation list, and history controls are present.


## Scrollable Admin previews — 2026-10-23

- Made the Active Students overview and Log History overview internally scrollable. The student preview still shows a compact four-row-height window, and scrolling reveals the entire loaded active roster.
- The history preview now fetches additional 200-row pages in the background until it reaches entries at least seven days old or exhausts available history. The history API was checked to return newest-first rows; the preview itself scrolls within a 220px viewport.
- Deployed admin page on gh-pages: 64e1b12cc7ed1eb928220716ff50d8f54e5aebca (index.html).
- Verification: fetched the deployed page and confirmed both internal scroll containers and the seven-day pagination condition. No database changes were needed.


## Active Students roster, categories, and sorting — 2026-10-23

- The Admin Active Students preview now renders every active student inside its scrollable container; it no longer limits the rendered list to four rows. The button now reads “Show all Students”.
- The dedicated page is titled “All Students” and shows Active Students first, followed by Deactivated Students. Deactivated records retain the Activate action and existing data.
- Added a sorting panel for active students: Name (A–Z) or Performance. Performance loads each active student's full log history, ranks by total exercise log entries, then by the sum of logged scores, with name as a final tie-breaker. It uses up to four concurrent history requests and shows the totals with each active student after loading.
- Published to gh-pages/index.html in commits 77c79cbb95dad69ad0ce94339b6c4c5b4d3479a0 and 0e18abd27b937f2c7a80d91a7792f8ae7a8ef23e.
- Verification: fetched the deployed page and confirmed all active rows are rendered into the scrollable preview, the updated label and categories, sort selector and history-based ranking, plus the Activate action. No database or student data changes were made.


## Admin sort and history preview refinement — 2026-10-23

- Removed performance sorting and its per-student history requests. The All Students page now has a compact “Sort by” dropdown with only A–Z, and active students remain alphabetized.
- The Back to Admin controls on All Students and Log History now sit above their page titles with smaller type and a left indent.
- The Admin Log History preview renders only entries dated within the past seven days. The Show all Log History page renders the full currently loaded history and retains its Load more pagination; switching pages redraws history for the correct view.
- Published admin page to gh-pages/index.html in commits 04eeff055a7cfef54db1a834a62b567561921982 and 6ee12ce0f41a1640d932f8f55e9c437304ea87ab.
- Verification: fetched the deployed file and confirmed the single A–Z option, no performance sort code, compact shared Back to Admin styling, seven-day preview filter, unfiltered full-history rendering, and Show all Log History control. No database changes were needed.
