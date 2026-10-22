# Marks Music app notes

Last reviewed: 2026-10-22 (Asia/Kolkata)

These notes are the working map for future changes. Update this file in the same change as each app change: record the behavior changed, source/database locations, migration or deployment implications, and what was verified. Keep credentials, passwords, calendar subscription URLs, student records, and secrets out of this file.

## Project and live services

- Repository: `marksmusicschool/Marks-Music`; default branch is `main`. GitHub Pages is documented as serving `site/` from `gh-pages`; app URL: `https://marksmusicschool.github.io/Marks-Music/`.
- Supabase project: `jfylfmdzkfaprqmcoxwx` (active, region `ap-southeast-2`), API host `https://jfylfmdzkfaprqmcoxwx.supabase.co`.
- Main app endpoint: `/functions/v1/marks-api`. Live Edge Function is active (version 6, JWT verification disabled); requests use the app's own password check.
- A second live Edge Function, `student-portal` (active version 1, JWT verification disabled), exists in Supabase but is not present in the repository tree. Treat its live implementation as a separate, currently untracked app component until it is brought into source control.
- GitHub connection reports `push` permission. The Supabase SQL connection runs as `postgres` and reports database schema/object creation privileges. This establishes technical write capability; it does not mean production writes or deploys should be made casually.

## Source map

- `site/index.html`: the entire static single-page web app (HTML, CSS, JavaScript). API constant points at the live project above. It supports Log, Dashboard, and Log History views.
- `site/manifest.webmanifest` and `site/icon-*.png`: installable web app metadata and icons.
- `supabase/functions/marks-api/index.ts`: Deno Edge Function; validates the shared app password, routes app actions, accesses Postgres, and fetches calendar feeds.
- `supabase/functions/marks-api/calendar.js`: iCalendar parsing helpers, including floating-time conversion, recurrence expansion/exceptions, cancellation filtering, deduplication, and event sorting.
- `supabase/migrations/20261011_mm_logging_app.sql` and `20261012_mm_dashboard_history.sql`: only two migration files currently in the GitHub tree on `main`.
- `README.md` and `INSTALL.md`: operator setup and user workflow documentation.

## App behavior and request flow

1. The browser sends POST JSON to the Marks API. Every request includes the app password; the backend validates it against a bcrypt hash via `mm.check_password`. The app stores its signed-in state locally on that device; Lock clears the local session.
2. `bootstrap` loads the exercise catalogue, student list/bests and calendar connection status. The catalogue is based on public `categories`, `subcategories`, and `items`.
3. The Log view selects or creates a student, accepts exercise shorthand/BPM rows (or pasted notes), and sends `log`. The database routine creates unknown students with `teacher_id = 1`; for a repeated student/exercise/date, it retains the higher score. Positive BPM is required.
4. `bests`, `students`, and `student_history` back student progress and Dashboard summaries. `history` is paginated and `delete_log` removes a selected history row. `day_logs` reloads a student's entries for a selected day.
5. Calendar settings store three Apple public iCalendar feed URLs under `Personal`, `Offline`, and `Swaralaya`. The API validates a feed when saved; `today` fetches and parses it. The browser refreshes class lists and matches event titles to student names. Calendar links reveal class names/times to anyone possessing them.
6. Other main API actions: `login`, `set_calendar`, and `today`. The browser's API helper is in `site/index.html`; action routing is in `marks-api/index.ts`.
7. The live `student-portal` function supports student login/refresh/logout, forced password change, student-only bootstrap and history, plus password-gated admin listing/reset of student accounts. It uses Supabase Auth and `private.student_portal_accounts`. Its matching frontend/source and migration are absent from the current repository tree; inspect and reconcile before modifying this feature.

## Data model and live/source drift

- Public app tables observed live: `students`, `teachers`, `admins`, `categories`, `subcategories`, `items`, and `student_logs`. RLS is enabled on all seven. Key links: students to teachers; items to categories/subcategories; student_logs to students/items.
- Exercises are ordered by `items.exc_order`; `student_logs.score` is a positive integer in the live database. `student_logs.created_at` records class time/date.
- The private `mm` schema contains password-gated database routines and settings. Settings include the app password hash and calendar feed URLs. Do not read or expose secret values.
- Live migration history has nine entries, through `20261015125538 student_portal_auth`. It includes additional dashboard/student summary, curriculum order/class times, score constraints, and student portal work not represented by migration files in `main` (which currently contains only the two files above). The live `mm.log_class` also has a six-argument overload with explicit timestamp, beyond the five-argument function in the checked-in initial migration.
- Because source migrations are behind live migration history and the student portal is missing from source, reconcile schema/function history before deploying migrations or Edge Functions. Do not assume the checked-in migrations alone reproduce production.

## Change log

- 2026-10-22: Initial source/live-system review. Confirmed repository and project identity, read app/install docs and the complete static app/backend/calendar source, inspected live project metadata, public table structure, migration history, and live Edge Function inventory. No production data or configuration was changed. Created this baseline map.
