# Installing Marks Music

Marks Music is a website, so nothing is installed from an app store. You open it in Safari and add it to the iPhone home screen or the Mac Dock, where it then works like an app.

There are two parts:

- **Using the app** (sections 1 to 4): for Aaron, on his iPhone and MacBook.
- **Running your own copy** (section 5): only needed if the server or database is ever set up again from scratch.

---

## 1. Put the site online (one time, repo owner)

1. Open the repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**.
3. Pick the **gh-pages** branch and the **/ (root)** folder, then tap **Save**.
4. About a minute later the site is live at:

   **https://marksmusicschool.github.io/Marks-Music/**

To publish a new version later, push the updated files from `site/` to the `gh-pages` branch.

## 2. Install on iPhone

1. Open **Safari**. It has to be Safari, because Chrome on iPhone can't add web apps to the home screen.
2. Go to **https://marksmusicschool.github.io/Marks-Music/**.
3. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
4. Open **Marks Music** from the home screen and enter the password. It stays signed in on that phone.

## 3. Install on MacBook

1. Open **Safari** and go to **https://marksmusicschool.github.io/Marks-Music/**.
2. In the menu bar, choose **File → Add to Dock**, then click **Add**. This needs macOS Sonoma or later.
3. Open **Marks Music** from the Dock and enter the password.

On an older macOS, bookmark the page or drag the address bar link onto the Dock instead.

Chrome on the Mac works too. Open the ⋮ menu, then **Cast, save and share → Install page as app**.

## 4. Connect the class calendars (one time)

The app reads today's classes from the **Personal**, **Offline** and **Swaralaya** calendars in Apple Calendar. Each event's title must be the student's name.

On the iPhone, for each of the three calendars:

1. Open the **Calendar** app and tap **Calendars** at the bottom.
2. Tap **ⓘ** next to the calendar (for example, Personal).
3. Turn on **Public Calendar**, then tap **Share Link… → Copy**.
4. Open Marks Music, tap **Calendars** at the top, paste the link into the matching row, and tap **Connect**.

When all three show as connected, today's classes appear as buttons at the top of the app. Each button shows the time, the student and a Personal, Offline or Swaralaya tag.

A class only appears once its start time has passed; until then the app shows which class is next. The class list refreshes by itself every 2 minutes and whenever the app is reopened, so an event that is deleted or moved in Calendar drops off the list. Tap **↻ Refresh** to check right away. Apple can take a few minutes to publish a calendar change, so a deleted class may linger briefly.

> Anyone who has one of these links can see class names and times. Don't post them anywhere. To stop sharing, turn **Public Calendar** off. Then paste the new link into the app after turning it back on, or tap **Remove**.

## Using it day to day

1. Tap the class at the top, or type the student's name. A name the app doesn't know is added as a new student.
2. Type an exercise in shorthand and press Enter, then type the BPM. Press ↓ to start the next exercise row, or Enter to save the class.
   Examples: `FPE9`, `G Scale`, `Exc 1&2 Waltz`, `6SBC`, `HBD Ch`, `T`.
3. Each row shows the student's current best, and marks a **New best** when the BPM beats it.
4. Tap **Save class** (or press Enter in a BPM box). Below the button the app lists every exercise saved for that student on the selected date.

Once a student is picked, **View progress** opens their page on the Dashboard. Tapping **Marks Music** at the top left reloads the app and returns to the Log page.

**Paste notes** takes lines in the old Apple Notes format (`FPE9 120`, one per line) and fills in the rows for you.

If the same exercise is saved twice on one day, only the higher BPM is kept. **Lock** signs the app out on that device.

## Dashboard and Log History

The tabs at the top switch between **Log**, **Dashboard** and **Log History**.

- **Dashboard** shows today's classes at the top; tap one to open that student's progress. Below is every student, most recent class first, with how many different exercises they have done. Type a few letters in the search box, then press ↓ and Enter to open the top match. A student's page shows each exercise they have done, grouped by category in the same order as the exercise list, with their best BPM, how much it has gone up since the first time, and a small line showing the trend.
- **Log History** lists every saved score, newest first, grouped by student and day. Pick a student at the top to see only theirs. Tap **Delete** on a line, then **Delete it** to remove that score for good, or **Keep** to cancel.

---

## 5. Running your own copy (developers)

You only need this to rebuild the backend in a new Supabase project.

### Database

1. Run `supabase/migrations/20261011_mm_logging_app.sql` in the Supabase SQL editor. It creates a private `mm` schema that the public API can't reach.
2. Set the app password. Run this in the SQL editor, never commit it:

   ```sql
   insert into mm.settings (key, value)
   values ('password_hash', extensions.crypt('YOUR-PASSWORD', extensions.gen_salt('bf')))
   on conflict (key) do update set value = excluded.value;
   ```

   Run the same statement again with a new password to change it.

The app expects the existing tables `students`, `items`, `subcategories`, `categories` and `student_logs`. New students get `teacher_id = 1`.

### Server

Deploy the edge function with JWT verification turned off. The function checks the app password itself.

```sh
supabase functions deploy marks-api --no-verify-jwt --project-ref <your-project-ref>
```

### Site

In `site/index.html`, change the `API` constant to `https://<your-project-ref>.supabase.co/functions/v1/marks-api`. Then publish the `site/` folder on any static host, such as GitHub Pages, Netlify or Vercel.

## Troubleshooting

| What you see | What to do |
|---|---|
| "That password isn't right." | Check the password. If it was changed, sign in again with the new one. |
| "Can't reach the server." | Check the internet connection. |
| "That link didn't return a calendar." | Copy the Share Link again from the Calendar app, and make sure Public Calendar is on. |
| "Couldn't read Swaralaya" (or another calendar) | Public sharing was turned off or the link changed. Paste the new link under **Calendars**. |
| A class shows as **new** | The event title doesn't match a student's name. Rename the event, or save it to add the student. |
| The page shows "404" | GitHub Pages isn't on yet. See section 1. |
