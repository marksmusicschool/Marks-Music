# Marks Music

Class log for Aaron Mark's guitar students. Log each class's exercises and BPM from a Mac or iPhone, with today's classes pulled from Apple Calendar.

- `site/` is the web app. It is a single static page, published from the `gh-pages` branch.
- `supabase/functions/marks-api/` is the server it talks to (a Supabase Edge Function). It checks the app password, reads and writes the database, and reads the class calendars.
- `supabase/migrations/` holds the private `mm` schema the function uses.

## Using it

Full setup steps for iPhone and Mac are in [INSTALL.md](INSTALL.md).


1. Open the site and enter the password. It stays signed in on that device.
2. iPhone: Share, then Add to Home Screen. Mac (Safari): File, then Add to Dock.
3. Tap Calendars and paste the Public Calendar link for Personal, Offline and Swaralaya. In the iPhone Calendar app: Calendars, ⓘ next to each one, Public Calendar on, Share Link, Copy.
4. Tap a class, type exercises in shorthand (`FPE9`, `G Scale`, `Exc 1&2 Waltz`, `HBD Ch`) with the BPM, and save.

Event titles are matched to student names. If the same exercise is logged twice on one day, the higher score is kept.
