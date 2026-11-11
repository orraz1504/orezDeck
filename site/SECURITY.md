# Security audit: Kartisiyot Orez

**Date:** 11 Nov 2026 · **Scope:** everything in `site/`, the GitHub Actions workflow, git history, dependencies.
**App:** static React app (Vite) on GitHub Pages, Firebase Auth (Google only) and Cloud Firestore on the free Spark plan. No backend, no billing account, so every fix had to work without one.

**How it was audited:**
- I read all of the source and searched for injection points (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`).
- I scanned the entire git history for secrets (private keys and GitHub, AWS, OpenAI and Slack tokens).
- I ran `npm audit` and inspected the production bundle (which external origins it loads, whether it uses `eval`).
- I timed the parsers against hostile input (ReDoS), and loaded the production build in headless Chrome to check for Content-Security-Policy violations.

**What I could not check:**
- The Firebase / Google Cloud consoles (no access). Part C lists what to verify there.
- The rules currently *published* in the console.
- Google sign-in under the new CSP, which needs a real login.

---

## A. Findings

Sorted by severity. "Status" is the state after the fixes in this commit.

| # | Area | Problem | Severity | Who fixes | Status |
|---|---|---|---|---|---|
| 1 | Security Rules | Writes weren't validated: any field, type or size was accepted (only `mastery` was checked). The allow-list was by email, and the repo copy had a placeholder, so it's unknown what is actually published. | High | Both | ✅ New rules in repo · ⏳ **you must publish them (C1)** |
| 2 | ReDoS | The cloze regex ran in **cubic** time on unclosed `{{c1::`. Measured: 6,000 chars took 148 ms, 12,000 took 1.2 s, and ~100,000 froze the tab. One such card (from an import or AI output) froze the deck page on every load. | High | Claude Code | ✅ Fixed: linear scanner, 100,000 chars now take a few ms, regression test added |
| 3 | Availability | No export, no restore and no "delete all my data". Spark has no automatic backups, so deleting a deck was permanent. | High | Claude Code | ✅ Fixed: Settings → backup / restore / delete all |
| 4 | Firebase | The API key had no saved restrictions ("can be used with any application"). | Medium | You | ⏳ C3 |
| 5 | Browser | Sign-out left the Firestore offline cache (IndexedDB) and the image cache on the device. | Medium | Claude Code | ✅ Fixed: sign-out wipes both and reloads, and first warns about unsynced offline changes |
| 6 | Import | No limits on file size, card count or field length. A huge file could crash the tab or use up the daily write quota (20K) in one go. | Medium | Claude Code | ✅ Fixed: 5 MB / 5,000 cards / 20,000 chars per field / 20 tags; unknown fields are reported and dropped |
| 7 | Availability | Failed writes (quota exhausted, permission denied) were silent, logged only to the console. | Medium | Claude Code | ✅ Fixed: banner for failed saves, plus an offline notice |
| 8 | Browser | No Content-Security-Policy and no Referrer-Policy. | Medium | Claude Code + you | ✅ Added · ⏳ **you must test sign-in (C9)** |
| 9 | Security Rules | No rule unit tests. | Medium | Claude Code | ✅ `tests/rules.test.ts` (15 tests) runs in CI; locally it needs Java |
| 10 | Firebase | No App Check, so anyone can call Auth/Firestore with the public key, and denied requests still use up quota. | Medium | You | ⏳ C6 (optional) |
| 11 | Privacy | Your Gmail address is in the author field of every existing commit in the public repo. I set it that way and didn't notice the repo was public. | Low | Both | ✅ Future commits use `46423524+orraz1504@users.noreply.github.com` · history not rewritten (see D) |
| 12 | KaTeX | `maxSize`/`maxExpand` weren't set, so `\rule{99999em}{1em}` could break the layout. (`trust` was already off.) | Low | Claude Code | ✅ Fixed: `trust:false`, `maxSize:20`, `maxExpand:500`, formulas over 5,000 chars shown as text |
| 13 | Images | The picker accepted any `image/*`, including SVG and HEIC, with no size cap before decoding (decompression bomb risk). Re-encoding through a canvas already stripped EXIF/GPS. | Low | Claude Code | ✅ Fixed: PNG/JPEG/WebP/GIF only, ≤ 20 MB, ≤ 50 megapixels, height ≤ 8,000 px |
| 14 | Security Rules | The `users/{uid}` document itself was writable, and images and reviews weren't validated. | Low | (part of 1) | ✅ In new rules |
| 15 | CI | Write permissions applied to every job, actions were pinned to tags not SHAs, and there was no Dependabot. | Low | Claude Code | ✅ Fixed: per-job permissions, SHA pins, `persist-credentials: false`, `dependabot.yml` |
| 16 | Dependencies | `npm audit`: 4 "high" in `@grpc/grpc-js` (via `firebase`). This is a Node-only library that isn't in the browser bundle (verified), so the real risk was low. | Low | Claude Code | ✅ Fixed with an `overrides` entry → `npm audit`: 0 vulnerabilities |
| 17 | Repo | `.gitignore` lacked `.env*`, emulator data and debug logs. `@types/katex` was unused. | Low | Claude Code | ✅ Fixed |
| 18 | GitHub | Unknown whether 2FA, branch protection, Dependabot alerts and push protection are on. | Low | You | ⏳ C7 |

**Checked and fine:**
- **Rendering:** no `eval`, `new Function` or `innerHTML`. The only `dangerouslySetInnerHTML` renders KaTeX output, and KaTeX escapes its input. The Markdown renderer builds React elements and supports no raw HTML and no links, so `javascript:` URLs are impossible.
- **Local storage:** `localStorage` holds only the theme preference.
- **Queries:** collection-group queries are denied (no `{path=**}` rule).
- **Secrets:** the only one in git history is the Firebase web API key, which is public by design.
- **Lockfile:** committed.
- **CSV:** there's no CSV export, so no formula-injection risk.
- **CSP:** no library needs `unsafe-eval`. The only `eval(` in the bundle is a Firestore method name, not global eval.

---

## B. What was changed (Claude Code)

1. **`site/firestore.rules`:** UID allow-list (placeholder in the repo), `hasOnly` field lists, types, string lengths (20,000), array sizes (20 tags, 200 masks, 30 variants), `mastery` int 0–5, all enums. Images are WebP/JPEG data URLs under 950 KB, with valid dimensions, and can't be updated. The user root document is closed. Images can't be listed.
   - **Deviation from the brief:** timestamps are *not* required to equal `request.time`. Ratings made offline sync later, so that rule would reject them. Instead: an int, after 2020, and at most 10 minutes in the future.
2. **`site/tests/rules.test.ts` + `vitest.rules.config.ts` + `npm run test:rules`:** emulator tests covering signed out, another user (including on their own path), me, unknown fields, wrong types, out-of-range values, missing fields, oversized docs, future timestamps, SVG and `javascript:` images, immutable images, the append-only review log, and collection-group queries.
3. **`src/lib/cloze.ts`:** a linear cloze scanner. `RichText.tsx` and `fit.ts` use it, and `cloze.test.ts` includes a ReDoS regression test.
4. **`src/components/RichText.tsx`:** KaTeX `trust:false`, `maxSize`, `maxExpand`; a 5,000-character cap per formula; a 50,000-character cap per rendered text.
5. **`src/lib/importer.ts`, `ImportPage.tsx`:** import limits and the unknown-field notice, with tests. Editor text fields are capped at 20,000 characters to match the rules.
6. **`src/lib/image.ts`, `OcclusionEditorPage.tsx`:** allowed formats, file size, megapixel and height caps, with tests.
7. **`vite.config.ts`, `index.html`:** the CSP `<meta>`, added to production builds only, and `Referrer-Policy: strict-origin-when-cross-origin`.
   - Not `no-referrer`, because the API key's website restriction needs the origin.
   - The CSP allows scripts only from `self` and `apis.google.com`, frames from `orezdeck.firebaseapp.com` / `accounts.google.com`, and connections to `*.googleapis.com`. It sets `object-src 'none'`, `base-uri 'self'` and `form-action 'none'`, with no `unsafe-eval` and no inline scripts.
   - `'unsafe-inline'` is allowed for *styles* only, because React style attributes and MathLive need it.
8. **`src/data/store.ts`, `lib/imageCache.ts`:** secure sign-out: wait for pending writes (and ask if offline), then `terminate` + `clearIndexedDbPersistence`, delete the image cache, and reload.
9. **`src/components/SyncBanner.tsx`:** a banner for failed saves (quota, rules, invalid data) and an offline notice.
10. **`src/lib/backup.ts`, `data/backupOps.ts`, `pages/SettingsPage.tsx`:**
    - **Full export:** decks, cards with progress, and images.
    - **Restore:** strict validation, added as *new* decks, never overwriting.
    - **Delete all my data:** you must type "מחק" to confirm.
    - Tests for the backup validation.
11. **`.github/workflows/deploy.yml`, `.github/dependabot.yml`, `.gitignore`, `package.json`:** per-job least-privilege permissions, SHA-pinned actions, a rules-test job, Dependabot, ignore rules, the `@grpc/grpc-js` override, and `@types/katex` removed.
12. **git config (local):** future commits use the GitHub noreply address.

---

## C. Manual steps (you)

### C1. Publish the new Security Rules (do this first)
1. Find your UID (C2).
2. Open `site/firestore.rules` on GitHub (or locally), **Raw**, then select all and copy.
3. Open [console.firebase.google.com](https://console.firebase.google.com) → project **orezdeck** → **Firestore Database** → **Rules** tab.
4. Select everything in the editor (Cmd+A), delete it, and paste.
5. Replace `REPLACE_WITH_YOUR_UID` with your UID, keeping the quotes. Do this only in the console, never in the repo.
6. Click **Publish**. If there's a syntax error, the editor highlights the line and won't publish.

**Test in the Rules Playground** (same screen, **Rules Playground** button):
- **Should be allowed:** Simulation type `get`, Location `/users/<your UID>/decks/test`, Authenticated ✓, Provider `google.com`, Firebase UID = your UID → **Run** → ✅ allowed.
- **Should be denied:** the same request with Firebase UID `someone-else` → ❌ denied.
- **Invalid write, should be denied:** type `create`, location `/users/<your UID>/decks/d1/cards/c1`, document `{"type":"basic","tags":[],"createdAt":1767225600000,"mastery":9,"lapses":0,"seenInRound":0}` → ❌ denied (mastery 9).
- **In the app:** sign in, open a deck, study three cards, then reload. The progress should still be there. Create a card, import a small JSON file, and add an image card. If a red "השרת דחה שמירה" banner appears, tell me what you were doing.

### C2. Find your UID
Firebase console → **Authentication** → **Users** tab → the row with your email → **User UID** column → hover and click the copy icon. It's about 28 characters. If the list is empty, sign in to the app once first.

### C3. Restrict the API key
1. Firebase → ⚙️ **Project settings** → **Service accounts** → **Manage service account permissions**. This opens Google Cloud in the right project and account.
2. ☰ → **APIs & Services** → **Credentials** → under **API keys**, open **Browser key (auto created by Firebase)**.
3. **Application restrictions** → **Websites** → add each of these:
   - `https://orraz1504.github.io/*`
   - `https://orezdeck.firebaseapp.com/*` ← required, because the Google sign-in page runs there
   - `http://localhost:5173/*` (dev)
   - `http://localhost:4173/*` (`npm run preview`)

   (Wildcard ports like `http://localhost:*` aren't reliably accepted, so the ports are listed explicitly.)
4. **API restrictions** → **Restrict key** → tick only:
   - **Identity Toolkit API** (sign-in)
   - **Token Service API** (session refresh)
   - **Cloud Firestore API** (data)
   - **Firebase App Check API** (only if you do C6)
5. **Save**. It takes effect within about 5 minutes.
6. **Check it worked:** after 5 minutes, open a private window → the site → sign in → open a deck → study one card.
   - `API_KEY_HTTP_REFERRER_BLOCKED` means a website is missing from the list.
   - `API_KEY_SERVICE_BLOCKED` means an API is missing from the list.
   - If anything breaks, set API restrictions back to **Don't restrict key**, save, and tell me.

### C4. Authorized domains
Firebase → **Authentication** → **Settings** → **Authorized domains**.
- **Keep:** `localhost`, `orezdeck.firebaseapp.com` (required for Google sign-in), `orraz1504.github.io`.
- **Remove:** `orezdeck.web.app` (Firebase Hosting, unused). Use ⋮ → **Delete**.
- **Check:** signing in on the site still works.

### C5. Auth providers
Firebase → **Authentication** → **Sign-in method**. Only **Google** should show as *Enabled*. If Email/Password, Anonymous or Phone are enabled, open each one → turn off **Enable** → **Save**.

### C6. App Check (optional)
**Does it work on Spark?**
- App Check itself is free and supported on Spark, including enforcement for Firestore.
- The web provider, reCAPTCHA v3, is free up to 10,000 assessments a month. That's plenty for one person, roughly one assessment per hour of use.
- **Honest caveat:** Google now manages reCAPTCHA keys through Google Cloud, and I'm not 100% sure creating a key won't ask for a billing account. **If it asks, skip App Check.** It's a nice-to-have (see D).

If you want it:
1. Go to [google.com/recaptcha/admin/create](https://www.google.com/recaptcha/admin/create) → label `orezDeck` → **Score based (v3)** → domains `orraz1504.github.io`, `localhost` → Submit. Copy the **site key** (public) and the **secret key**.
2. Firebase → **App Check** → **Apps** → your web app → **reCAPTCHA** → paste the **secret key** → **Save**.
3. Send me the **site key** only (never the secret). I'll add `initializeAppCheck` and update the CSP.
4. After deploying, wait a day. In App Check → **APIs** → **Cloud Firestore**, check that most requests are "Verified", and only then click **Enforce**. Enforcing too early locks you out.

### C7. GitHub
1. **2FA:** profile picture → **Settings** → **Password and authentication** → **Enable two-factor authentication** (authenticator app or passkey). Save the recovery codes.
2. **Branch protection:** repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
   - Name `protect-main`, Enforcement **Active**.
   - Target branches → **Add target** → **Include default branch**.
   - Tick **Restrict deletions** and **Block force pushes** → **Create**.
   - Don't tick "Require a pull request", because that would block my direct pushes to `main`.
3. **Dependabot and secret scanning:** repo → **Settings** → **Code security** (or **Advanced Security**).
   - **Enable** Dependabot alerts and Dependabot security updates.
   - **Enable** Secret scanning and **Push protection**.
4. **Close the API-key alert:** repo → **Security** → **Secret scanning** → the Google API Key alert → **Close as** → **False positive** ("Firebase web API key, public by design, protected by Firestore rules").
5. **Keep your email private:** **Settings** → **Emails** → tick **Keep my email addresses private** and **Block command line pushes that expose my email**.
6. **Check:** the repo's **Security** tab shows Dependabot alerts and Secret scanning as enabled.

### C8. Quota monitoring
- **Firestore:** Firebase → **Firestore Database** → **Usage** tab shows reads, writes and deletes per day.
- **Auth:** Firebase → **Authentication** → **Usage**.
- **Detail:** Google Cloud → **APIs & Services** → **Cloud Firestore API** → **Metrics** (requests by method, 403/429 errors).
- **Normal:** a study day is a few thousand reads (each deck opened reads its cards) and 100–600 writes (2 per rating). Imports add one write per card.
- **Worry when:** more than 20,000 reads or 5,000 writes on a day you didn't import, or a spike of 403 errors in Metrics (someone probing).
- **At the limit:** at 50,000 reads or 20,000 writes, Firestore stops until midnight Pacific time (**10:00 Israel time**). There's no charge, only downtime, and the app shows a red banner.
- **Alerts:** Spark has no budget alerts, so check Usage once a week.

### C9. Test sign-in under the new CSP
After this deploy:
1. Open the site in a private window and sign in with Google.
2. Open a deck and study a card.
3. Open an image card.
4. Open the card editor and use the formula editor.

If anything fails, open the browser console (Cmd+Option+J) and send me any line containing **"Content Security Policy"**. The fix is usually one domain in `vite.config.ts`.

### C10. Make a first backup
Settings → **ייצוא גיבוי מלא**. Store the file outside the device, for example in Google Drive.

---

## D. Remaining risks

| Risk | Why it can't be closed without a backend / billing | Real size for a personal app |
|---|---|---|
| **Anyone can complete a Google sign-in** | Blocking sign-up before the account is created needs Blocking Functions (Blaze plan). | **Small.** An Auth record is created, but the rules deny every read and write, and the app shows "not allowed". You can delete such users manually. |
| **Quota abuse with the public key** | Requests denied by the rules still count against quota, and there's no server-side rate limiting. App Check reduces this but doesn't eliminate it. | **Small to medium.** The worst case is that the app stops until 10:00 the next day. No money is at stake and no data leaks. Unlikely anyone bothers with a personal app. |
| **No automatic backups** | Scheduled exports and point-in-time recovery need Blaze. | **Medium**, depending on habit. Export weekly and before exams (Settings). |
| **Code and config are public** | It's a static site, so all code ships to the browser anyway. | **None.** Security is in the rules, by design. |
| **Validation lives only in the rules** | No server. The rules language has no loops, so items inside `masks` and `variants` can't be checked one by one. | **Small.** Only you can write, so the realistic scenario is a bug, not an attacker. Firestore caps each document at 1 MiB. |
| **CSP needs `'unsafe-inline'` for styles, and meta-tag CSP can't set `frame-ancestors`** | GitHub Pages can't send headers. | **Small.** Scripts are locked down. Style injection alone can't run code, and there's no sensitive UI worth clickjacking. |
| **Data isn't end-to-end encrypted** | Google holds it, encrypted at rest. Client-side encryption would break search and convenience. | **Small** for study cards. Don't put medical or personal secrets in cards. |
| **A stolen or compromised device while signed in** | The Google session lives in the browser. | **Small to medium.** Sign-out now wipes local data. Use a screen lock and 2FA on Google. |
| **Your Gmail is in old commits** | Removing it means rewriting history and force-pushing, which is irreversible and breaks clones. | **Small.** It was already public there, and spam is the main risk. I can rewrite history if you explicitly ask. |
