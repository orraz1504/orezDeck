# Mobile UX audit — Kartisiyot Orez

_Audit date: 2026-11-13. Nothing in the app was changed; this report proposes fixes and needs approval first._

## How the audit was done

- **Screenshots:** Playwright 1.63 captured every screen on:
  - iPhone SE 3rd gen (375×667) and iPhone 15 (393×659), both in WebKit;
  - Pixel 7 (412×839) in Chromium;
  - portrait and landscape, light and dark: **12 combinations × 26 screens, ~380 images**.
- **Test data:** a local build with an in-memory mock replaced the Firebase data layer. It used the demo decks plus a "stress" deck with a very wide formula and a very long answer. Your real Firebase project was never touched.
- **On-screen keyboard:** Playwright can't open a real one, so a grey block with the real height was drawn instead (SE 260px, iPhone 15 336px, Pixel 300px; 190–209px in landscape). This matches how iOS Safari and Android Chrome behave by default: the keyboard covers the bottom of the page without resizing the layout. Every screen with a text field was captured with it open.
- **Automatic checks per screen:** horizontal overflow, tap targets under 44px, input fonts under 16px, text under 12px.
- **Lighthouse 12.8 (mobile, slow 4G, 4× CPU)** on the live site: https://orraz1504.github.io/orezDeck/.
- **Code review:** all CSS files and every page and component that has to do with input, layout, study or the image editor.
- **What screenshots can't show:** notch/safe-area insets, real pinch gestures, and the iOS auto-zoom when a field is focused. These are judged from the code.

**Measured results:**
- **Horizontal overflow:** none on any of the 26 screens in any of the 12 combinations.
- **New deck sheet with the keyboard open:** the name field was under the keyboard in all 12 combinations.
- **Keyboard captures:** across all 60, the focused field was hidden in 10 and the Save button was off-screen in 32.
- **Capture gaps:** 4 Pixel captures of the long-answer card didn't complete (a test-script timing issue, not an app bug). The same screen was captured on both iPhones.

**Screenshots:**
- The main issues are in `docs/mobile-audit/before/`.
- The audit harness (mock data layer, Vite config, Playwright script) lives outside the repo, so the "after" set is captured with exactly the same setup.

---

## 1. Current state

- The **browsing screens look good** on every phone size, in both themes:
  - home, deck, session-done, settings and the import preview;
  - no horizontal scrolling on 375px, no cut-off text, `100dvh` is used.
- The **problems start when a keyboard opens:**
  - the formula editor's math keyboard **covers the formula box and the "Add" button**;
  - bottom sheets hide their own fields;
  - the editor's **Save button scrolls off the screen**;
  - text boxes have a **fixed height**, so longer answers are hidden behind an internal scroll.
- **Mixed Hebrew/LaTeX text is shown in the wrong direction** inside text boxes. This is a big part of why formulas feel hard to edit.
- **Study screen:**
  - the buttons sit mid-screen rather than in the thumb zone;
  - on long cards they move below the fold.
- **Image editor:** usable, but not touch-friendly: tiny handles, no zoom, no undo, and no way to paste on a phone.
- **No service worker:** the app **can't open at all without reception**, even though the data itself is cached offline.

---

## 2. Findings

Sorted by severity. Effort: **S** = under an hour, **M** = a few hours, **L** = a day or more.

| # | Screen | Issue | Severity | Effort |
|---|---|---|---|---|
| 1 | Formula editor | MathLive's on-screen keyboard (≈265px) opens over the bottom sheet. On iPhone SE the formula box, the "display" checkbox and the **Add** button are all hidden under it. In landscape only the sheet title is visible. You can't see what you type. | High | M |
| 2 | Formula editor | Two separate symbol systems compete: our palette (4 tabs, 40×38 keys) and MathLive's own keyboard (different layouts, generic symbols like ∀ ∃). Common biology/stats symbols take 2–3 taps or aren't there at all. | High | M |
| 3 | Card editor | Text boxes use `dir="auto"`, which picks **one direction for the whole box** from its first letter. An answer that starts with `$$CO…` becomes left-to-right, so every Hebrew line below it has its punctuation and numbers in the wrong place (`פי 4–6,` shows as `–4 פי`). The caret jumps around. | High | S |
| 4 | Card editor | Text boxes have a fixed height (2–4 rows) and scroll internally. A typical answer with a formula is cut off mid-sentence, and you can't see the whole card while editing. | High | S |
| 5 | Card editor, image editor | The **Save** button is only in the top bar, and the top bar isn't sticky. Once you scroll to the answer field (which happens automatically when the keyboard opens), Save is off-screen. | High | S |
| 6 | Bottom sheets (new/edit deck, formula) | The sheet is pinned to the bottom of the layout, so the keyboard covers the name field and the **Create deck** button (SE: field top at 442px, visible area ends at 407px). | High | M |
| 7 | App-wide | **No service worker / app shell.** Without reception the page doesn't load at all (only Firestore data is cached). Opening the app on the bus with no signal fails. | High | M |
| 8 | Search, tags, image labels, import | Fonts under 16px make **iOS zoom in** on focus, and the page stays zoomed: search 15px, tag input 14px, image-label input 15px, import JSON box 13px. | Medium | S |
| 9 | Study | Reveal and rating buttons sit right under the card, in the **middle** of the screen (about 470–520px of 667 on SE), not in the bottom thumb zone. On long answers they're **below the fold**, so you scroll after every card to rate it. | Medium | M |
| 10 | Study (problem) | Each "next step" adds a step below the fold, and the next-step button isn't visible either. You scroll for every step. | Medium | S |
| 11 | Study | A formula wider than the screen scrolls sideways correctly, but **nothing shows that it continues**: it just looks cut off after `xᵢ`. | Medium | S |
| 12 | Study (image) | **No pinch-zoom on images.** `.occ-stage` has `touch-action: none` (meant for the editor) and is reused in study. A tap on the image also flips the card. Small labels on diagrams are hard to read. | Medium | M |
| 13 | Image editor | One finger on the image always draws, so you **can't scroll the page** while touching the image (it fills most of an SE screen), and stray rectangles are easy to make. No zoom for small structures. Resize handles are 14×14px. | Medium | L |
| 14 | Image editor | **No undo.** Paste works only through a desktop `Ctrl+V` listener: there's no paste button, and the hint says "Ctrl+V" even on phones. "גרור כדי לצייר מלבן" looks like a button but does nothing. | Medium | S |
| 15 | All inputs | No `enterkeyhint`, `autocapitalize`, `autocorrect` or `inputmode` anywhere. The raw-LaTeX box gets autocorrected and auto-capitalised. In the tag input, Enter commits the tag but the key says "return". | Medium | S |
| 16 | App-wide | **Tap targets under 44px:** filter chips 32px, "ייבוא" and "+ כרטיס" 32px, formula/cloze toolbar 32px, **tag "×" 8×14px**, "עריכה בעורך" 71×20, checkboxes 21px tall, "הצג: הכל" 52×20, avatar 36×36. | Medium | S |
| 17 | App-wide (landscape) | `viewport-fit=cover` is set, but only the top and bottom safe areas are padded. In landscape on iPhone 15 the left/right edge (≈47–59px notch/Dynamic Island) covers content and the exit/back buttons. | Medium | S |
| 18 | First load | Lighthouse mobile **Performance 68**: FCP 3.8s, LCP 6.8s.<br>• Google Fonts CSS blocks rendering for about 1s.<br>• Firebase, KaTeX and mhchem are all in the first download (≈390KB gzipped JS, 248KB of it unused on the login screen).<br>• Firebase's sign-in iframe (≈130KB) loads before anyone taps sign-in. | Medium | M |
| 19 | App-wide | **No web-app manifest.** "Add to Home Screen" opens inside the browser with its UI, the icon is a single 720px PNG, and there's no standalone mode or splash screen. | Medium | S |
| 20 | App-wide | There's an offline banner, but **no "changes waiting to sync"** indicator. You can't tell whether ratings made offline have reached the server before you close the app. | Medium | S |
| 21 | Study | No `touch-action: manipulation`. Two quick taps (rating fast, or flip and rate) can trigger **double-tap zoom** in iOS Safari. | Low | S |
| 22 | Study | Rating sub-labels are flipped by RTL: "+1" shows as "1+" and "~4" as "4~". | Low | S |
| 23 | Card editor | "שמירה והוספת עוד" (save and add another) is desktop-only. On the phone every new card means save, go back, tap "+ כרטיס" again. | Low | S |
| 24 | Editors | The ✕ and ‹ buttons use `navigate(-1)`. If the editor was opened directly (after a reload, from a link, or as the first screen of a home-screen app), they leave the app or do nothing. | Low | S |
| 25 | Study | No swipe gestures (swipe to reveal or rate). | Low | M |
| 26 | Accessibility | Sizes are fixed px, so the iOS system text size (Dynamic Type) is ignored (Safari page zoom still works). Deck stats and card-head text are 11.5–12.5px. Contrast and icon-button `aria-label`s are fine (Lighthouse a11y 100 on the login page). | Low | M |
| 27 | Import | The mobile preview already uses cards instead of a table (good), but shows only the question side. "העתקת הפרומפט" is 32px high. | Low | S |

**Already fine:**
- no horizontal page scroll on any screen at 375px;
- `100dvh` instead of `100vh`;
- top and bottom safe areas;
- the flip animation uses only `transform` (cheap on weak phones) and respects reduced motion;
- tap anywhere on the card flips it;
- browser back works (HashRouter);
- dark mode has no contrast problems;
- the import preview is readable on a phone.

---

## 3. Equation input

The core problem is not a missing feature: the current editor already has a visual MathLive field and a palette. The problems are:
- the keyboard covers it (finding 1);
- there are two competing symbol systems (finding 2);
- the plain text box shows mixed text in the wrong direction (finding 3).

| Option | Pros | Cons | Bundle | Thumb comfort |
|---|---|---|---|---|
| **A. Toolbar above the native keyboard** inserting LaTeX snippets (fraction, power, subscript, √, Σ, ∫, α β μ σ Δ λ, ≤ ≥ ≠ ± ·, → ⇌) | Tiny. Stays in the normal text box. Fast for single symbols. | You still see raw LaTeX (`\frac{}{}`) and must place the caret inside braces. The Hebrew keyboard has no `\ { } ^ _` (3 taps each). Doesn't fix the caret jumping in mixed text. | ~3 KB | OK for symbols, poor for structures (fractions inside roots) |
| **B. MathLive `<math-field>`** with its virtual keyboard (current approach, fixed) | WYSIWYG: you see the formula as it will look, with empty boxes for each number, and need no LaTeX. Big, thumb-sized keys. **Keyboard layouts can be fully customised** (our own keys for stats, chemistry, Greek, templates). Already integrated and lazy-loaded. | Largest library. Needs care so its keyboard doesn't cover the field (fixable with its `geometrychange` event). | 222 KB gz JS + ~150 KB fonts, **only when the editor first opens**; cached after that (and offline with a service worker) | Best: big keys, no system keyboard, no language switching |
| **C. Live KaTeX preview under the field** | Already exists (shows when the caret is inside `$…$`). Catches typos instantly. | Only a check, not an input method. | 0 (KaTeX already loaded) | n/a |
| **D. Ready-made templates** (mean, SD, SE, z, t, CI, χ², Nernst, Henderson–Hasselbalch, Poiseuille, MAP, CO…) | One tap for the formulas you use most. Templates leave empty boxes to fill in. | A fixed list (easy to extend). | < 2 KB | Excellent |
| **E. Text shortcuts** (`\a` → α) | Fast for people who remember them. | Hard to discover. On a Hebrew phone keyboard `\` alone is 3 taps, so a shortcut is slower than a button. MathLive already has inline shortcuts (`alpha`, `sqrt`, `>=`, `+-`). | < 1 KB | Poor |
| **F. Fix direction (bidi)** | `unicode-bidi: plaintext` gives **each line its own direction** in the text box: Hebrew lines right-to-left, LaTeX lines left-to-right. Editing formulas only in the LTR editor also stops the caret jumping inside them. | Doesn't help a formula in the middle of a Hebrew sentence (the editor solves that). | 0 | n/a |

### Recommendation: B + D + F, plus a small part of A

Keep MathLive and rebuild the mobile formula editor around it.

1. **Full-screen editor on phones** instead of a bottom sheet:
   - the top bar holds **Cancel** and **Insert** (always visible);
   - the formula field sits right under it, then the live preview;
   - the keyboard takes the bottom half, and nothing can be hidden behind it.
2. **One keyboard: MathLive's, with our own layouts.** Remove the separate palette on touch devices. Tabs:
   - **123** (digits, + − × ÷ =, fraction, power, subscript, √, parentheses, ←/→, ⌫);
   - **סטטיסטיקה** (x̄, μ, σ, s², Σ, ±, ≤ ≥ ≠ ≈, √, z, t, α, p̂, n, ∫);
   - **αβγ** (the Greek letters you actually use: α β γ δ Δ λ μ π ρ σ θ χ ω);
   - **כימיה** (→ ⇌ ⁺ ⁻, subscript, [ ], Δ, ↑ ↓);
   - **תבניות**: the templates from D.
3. **Templates (D)** as their own tab, each a key showing the rendered formula with empty boxes.
4. **Per-line direction (F)** in every text box, so Hebrew and LaTeX lines no longer scramble each other.
5. From option A, only a **short symbol row** in the regular text box (α β μ σ Δ ± ≤ ≥ → ⇌):
   - inserts the Unicode character in plain text, or the LaTeX command when the caret is inside `$…$`;
   - covers the common case "I just need a σ" without opening the editor.

Why not drop MathLive for a toolbar (A)? It would save 222 KB, but only on the first formula edit, and you'd go back to typing LaTeX on a Hebrew phone keyboard: the exact thing that's hard today. The size doesn't affect normal use: it loads only when the editor opens and is cached after that.

---

## 4. Proposed fixes

### Quick wins (about an hour each or less)

1. **16px minimum in every field** (no more iOS zoom).
   - Search, tag input, image labels and the import box.
   - Files: `src/styles/components.css`, `src/styles/study.css`, `src/pages/OcclusionEditorPage.tsx` (inline 15px).
   - _Findings 8._
2. **Per-line text direction** in text boxes (`unicode-bidi: plaintext`), and `<bdi dir="ltr">` on the rating sub-labels.
   - Files: `src/styles/components.css`, `src/components/RatingButtons.tsx`.
   - _Findings 3, 22._
3. **Auto-growing text boxes:**
   - start at 2–3 lines and grow with the content, up to about 50% of the screen, then scroll;
   - uses CSS `field-sizing: content` with a small JS fallback for older Safari.
   - Files: `src/components/RichField.tsx`, `src/styles/study.css`.
   - _Finding 4._
4. **Sticky top bar** (with Save) in the card and image editors.
   - Files: `src/styles/layout.css` (`.topbar`).
   - _Finding 5._
5. **Correct keyboard attributes:**
   - `enterkeyhint` ("done" for tags, "search" for search, "next"/"done" in sheets);
   - `autocapitalize`, `autocorrect` and `spellcheck` off for LaTeX and JSON;
   - `inputmode` where it helps.
   - Files: `src/components/ui.tsx`, `src/components/RichField.tsx`, `src/components/MathEditor.tsx`, `src/components/DeckFormSheet.tsx`, `src/pages/ImportPage.tsx`, `src/pages/CardEditorPage.tsx`.
   - _Finding 15._
6. **`touch-action: manipulation`** on buttons, links and the card.
   - Files: `src/styles/base.css`.
   - _Finding 21._
7. **44px tap targets on touch screens**, scoped to `@media (pointer: coarse)` so desktop is unchanged:
   - chips, small buttons, toolbar, tag ✕, checkboxes, avatar, "עריכה בעורך".
   - Files: `src/styles/components.css`, `src/styles/study.css`.
   - _Finding 16._
8. **Left/right safe areas in landscape:** `max(16px, env(safe-area-inset-left/right))` on page, top bar, study bar and bottom bars.
   - Files: `src/styles/layout.css`, `src/styles/study.css`, `src/styles/tokens.css`.
   - _Finding 17._
9. **Scroll each new problem step into view** (respects reduced motion).
   - Files: `src/pages/StudyPage.tsx`.
   - _Finding 10._
10. **"Scrolls sideways" cue on wide formulas:** a soft edge shadow that appears only when there's more to scroll (pure CSS).
    - Files: `src/styles/study.css`.
    - _Finding 11._
11. **Web-app manifest and icons:**
    - name, `display: standalone`, theme and background colours, 192/512 and maskable icons generated from `app-icon.png`;
    - iOS meta tags.
    - Files: `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `index.html`.
    - _Finding 19._
12. **Image editor small fixes:**
    - undo (button plus Ctrl+Z, last 30 steps);
    - a **"Paste image"** button using `navigator.clipboard.read()` (shown only where supported);
    - hide "Ctrl+V" on touch screens;
    - turn the fake "drag to draw" button into a hint.
    - Files: `src/pages/OcclusionEditorPage.tsx`.
    - _Finding 14._
13. **Safe back/close:** if there's no in-app history, go to the deck instead of leaving the app.
    - Files: `src/pages/CardEditorPage.tsx`, `src/pages/OcclusionEditorPage.tsx`.
    - _Finding 24._
14. **"Save and add another" on mobile** (second button at the bottom of the form).
    - Files: `src/pages/CardEditorPage.tsx`.
    - _Finding 23._
15. **"N changes waiting to sync" indicator:**
    - count unconfirmed writes in `settle()`;
    - show a neutral grey chip in the sync banner, only while offline or slow.
    - Files: `src/data/store.ts`, `src/components/SyncBanner.tsx`, `src/styles/components.css`.
    - _Finding 20._

### Bigger changes

16. **New mobile formula editor** (the recommendation in section 3):
    - full-screen on phones, Insert and Cancel in the top bar, field pinned above the keyboard (MathLive `geometrychange`);
    - custom keyboard layouts (123 / stats / Greek / chemistry / templates) replacing the separate palette on touch;
    - templates file;
    - short symbol row in the plain text box.
    - Desktop keeps today's dialog.
    - Files: `src/components/MathEditor.tsx`, `src/components/RichField.tsx`, new `src/lib/mathTemplates.ts`, `src/styles/study.css`.
    - _Findings 1, 2._
17. **Keyboard-aware layout everywhere:**
    - `interactive-widget=resizes-content` in the viewport meta (Android);
    - a small `useKeyboardInset` hook using `visualViewport` (iOS) that sets `--kb` so sheets and bottom bars sit above the keyboard;
    - the focused field scrolls into view.
    - Files: `index.html`, new `src/lib/useKeyboardInset.ts`, `src/components/ui.tsx` (Sheet), `src/styles/components.css`, `src/styles/layout.css`.
    - _Finding 6, and helps 5 and 1._
18. **Study layout for the thumb:**
    - the card area scrolls, and the reveal/rating bar is **pinned to the bottom**;
    - short cards sit right above the bar, so buttons stay close to the card as you asked before;
    - long cards scroll under the bar, so rating never needs scrolling.
    - Files: `src/styles/study.css`, `src/pages/StudyPage.tsx`.
    - _Finding 9._
19. **Pinch-zoom for images while studying:**
    - a small "magnify" button (or long-press) opens the image full-screen with pinch and pan;
    - normal taps still flip the card;
    - the editor-only `touch-action: none` moves to the editor.
    - Files: new `src/components/ZoomViewer.tsx`, `src/components/OcclusionImage.tsx`, `src/components/CardFace.tsx`, `src/styles/study.css`.
    - _Finding 12._
20. **Touch-friendly image editor:**
    - "Draw" / "Move" mode toggle (Move mode scrolls the page);
    - two-finger pinch/pan zoom of the image;
    - 28px visible handles with 44px hit areas;
    - the selected rectangle's label field opens next to the image rather than far below.
    - Files: `src/components/OcclusionCanvas.tsx`, `src/pages/OcclusionEditorPage.tsx`, `src/styles/study.css`.
    - _Finding 13._
21. **Offline app shell (service worker):**
    - precaches the built app, KaTeX and MathLive fonts, so the app opens with no reception;
    - shows an "update available – reload" chip when a new version is deployed.
    - Uses `vite-plugin-pwa` (Workbox, dev dependency only). The CSP already allows it (`'self'`).
    - Files: `vite.config.ts`, `package.json`, `src/main.tsx`, small `src/components/UpdateChip.tsx`.
    - _Finding 7._
22. **Faster first load:**
    - self-host the Hebrew font subsets (removes the render-blocking Google Fonts request and two CSP entries);
    - load KaTeX and mhchem only when a formula is first rendered;
    - initialise Firebase Auth without the popup helper until the sign-in button is tapped.
    - Target: LCP under 3s on slow 4G.
    - Files: `index.html`, `public/fonts/*`, `src/styles/tokens.css`, `src/components/RichText.tsx`, `src/firebase.ts`, `src/data/store.ts`, `vite.config.ts` (CSP).
    - _Finding 18._
23. **Swipe in study (optional, off by default):**
    - swipe up to reveal;
    - after reveal, swipe ← for "שוב" and → for "טוב", with a visual hint;
    - setting in Settings.
    - Files: new `src/lib/useSwipe.ts`, `src/pages/StudyPage.tsx`, `src/pages/SettingsPage.tsx`.
    - _Finding 25._
24. **System text size:**
    - move body text sizes to `rem`, and on iOS opt into `-apple-system-body` scaling, so the phone's text-size setting applies;
    - raise 11.5px labels to 12.5–13px.
    - Files: `src/styles/tokens.css`, `src/styles/base.css`, plus a CSS sweep.
    - _Finding 26._

Not proposed: fix for finding 27 (minor). Showing the answer side in the mobile import preview can be added with fix 14 if you want it.

---

## 5. "Before" screenshots (`docs/mobile-audit/before/`)

| File | Shows |
|---|---|
| `01-formula-editor-keyboard-covers-field.png` | iPhone SE: MathLive keyboard hides the formula box and the Add button (findings 1, 2) |
| `02-formula-editor-landscape.png` | iPhone 15 landscape: only the sheet title is visible (finding 1) |
| `03-editor-keyboard-save-gone-bidi.png` | iPhone SE, keyboard open: Save scrolled away, fixed-height box cuts the answer, Hebrew lines in LTR (findings 3, 4, 5) |
| `04-editor-landscape-bidi.png` | iPhone 15 landscape: Hebrew sentence forced LTR (`.HR-ב` at the end, finding 3) |
| `05-new-deck-sheet-keyboard.png` | iPhone SE: the name field and Create button are under the keyboard (finding 6) |
| `06-study-buttons-mid-screen.png` | iPhone SE: rating buttons mid-screen, "1+" / "4~" (findings 9, 22) |
| `07-study-long-answer.png` | iPhone SE: long answer, rating buttons below the fold (finding 9) |
| `08-study-problem-step-below-fold.png` | iPhone SE: new step and next-step button off-screen (finding 10) |
| `09-study-wide-formula-no-cue.png` | iPhone SE: formula silently cut after `xᵢ` (finding 11) |
| `10-occlusion-editor.png` | iPhone SE: image fills the screen, draw-only touch, fake "drag" button (findings 13, 14) |
| `11-occlusion-label-keyboard-dark.png` | Pixel 7 dark: 14px handles, Save under the keyboard (findings 5, 13) |

After the fixes are applied, the same script will capture `docs/mobile-audit/after/` with the same file names, for side-by-side comparison.

---

**Which fixes should I apply? (all / numbers / quick wins only)**

_Answer: all. See section 6._

---

## 6. After the fixes (2026-11-13)

All 24 proposed fixes were applied, with one deliberate exception (see the table).

**Checks:**
- **Tests:** type-check clean, all 71 unit tests pass, the production build passes, and lint shows only the 6 warnings that existed before.
- **Screenshots:** the same 26 screens × 12 combinations were captured again into `docs/mobile-audit/after/`, using the same file names as `before/`.
- **Interaction tests (Playwright), all passing:**
  - the zoom viewer opens and closes without flipping the card;
  - drawing a rectangle adds it and undo removes it;
  - the "scroll" tool lets the page scroll;
  - swiping reveals the answer, then rates it;
  - closing an editor opened directly goes to the deck;
  - the symbol row inserts `σ` in text and `\mu` inside `$…$`.
- **Automatic checks, before → after (all 12 combinations):**
  - focused field hidden by the keyboard: 10 → **0** (of 60 keyboard captures);
  - Save button off-screen with the keyboard open: 32 → **0**;
  - tap targets under 44px: 884 → **130** (what's left is mostly elements whose visible box is small but has an invisible 44px hit area, which the check can't see, plus desktop-only items);
  - fields under 16px: 324 → **0**;
  - horizontal overflow: 0 → 0.
- **Landscape formula editor:** compact layout for short screens, so the field stays above the math keyboard.
- **Offline (production build, Chromium):** loaded once online, then reloaded with the network off. The app opens, shows the offline banner, and fonts come from the cache. No CSP violations.

| # | Fix | Result |
|---|---|---|
| 1 | 16px fields | Done. No field under 16px on touch screens, at any system text size. |
| 2 | Per-line direction, rating labels | Done. Hebrew lines are RTL and LaTeX lines LTR in the same box. The labels read "+1" and "~4". |
| 3 | Auto-growing text boxes | Done (`field-sizing: content` with a JS fallback). They grow up to half the screen, then scroll. |
| 4 | Sticky top bar | Done. Save stays visible while scrolling and with the keyboard open (`--vv-top` handles iOS panning). |
| 5 | Keyboard attributes | Done for every field. |
| 6 | No double-tap zoom | Done. |
| 7 | 44px tap targets | Done on touch screens. Desktop is unchanged. |
| 8 | Landscape safe areas | Done on `#root` and on the full-screen formula editor and zoom viewer. |
| 9 | Scroll to new problem step | Done. |
| 10 | Wide-formula cue | Done (CSS scroll shadows). |
| 11 | Manifest and icons | Done. Full-bleed icons cropped from `app-icon.png`, plus a maskable icon. |
| 12 | Image editor: undo, paste, hints | Done. Undo keeps 30 steps (button and Ctrl/⌘+Z). "הדבקת תמונה" appears where the Clipboard API exists. The fake button is gone. |
| 13 | Safe back | Done (`src/lib/nav.ts`). |
| 14 | Save and add another on mobile | Done. |
| 15 | "Waiting to sync" indicator | Done. Shown when offline, or when saves take more than 4 s. |
| 16 | New formula editor | Done:<br>• full screen on phones, with Cancel and Insert in the top bar;<br>• one keyboard with 123 / stats / αβγ / chemistry / templates / abc tabs;<br>• 15 templates (also in the desktop palette);<br>• a symbol row in every text box. |
| 17 | Keyboard-aware layout | Done:<br>• `interactive-widget=resizes-content` (Android);<br>• `useKeyboardInset` (iOS `visualViewport`), so sheets sit above the keyboard;<br>• the bottom bar hides while typing. |
| 18 | Thumb-zone study layout | Done. The card sits right above the buttons, the buttons are pinned to the bottom, and long cards scroll under them. |
| 19 | Pinch-zoom on study images | Done. Magnifier button, full-screen pinch/pan, double-tap zoom. Taps on the card still flip it. |
| 20 | Touch image editor | Done:<br>• "ציור / גלילה" tool switch;<br>• two-finger pinch/pan (a second finger cancels a half-drawn box);<br>• Ctrl+wheel zoom on desktop;<br>• 24px handles with 44px hit areas;<br>• the label field for the selected box sits right under the image. |
| 21 | Offline app shell | Done, with a small hand-written service worker instead of `vite-plugin-pwa`, which doesn't declare Vite 8 support. 80 files (~3 MB) are precached. Page loads are network-first with a 3 s timeout. An update chip offers the new version. |
| 22 | Faster first load | Mostly done:<br>• self-hosted fonts (Fontsource 5.3.0) removed the render-blocking Google Fonts request and two CSP entries;<br>• KaTeX and mhchem now load in parallel after boot (first JS download 386 KB → 301 KB gz).<br>**Not done: deferring Firebase's sign-in iframe.** Firebase preloads it on purpose so the Google popup opens directly from the tap. Deferring it can make Safari block the popup and fall back to the redirect flow, which is unreliable on iOS. Saving ~130 KB isn't worth that risk.<br>**Lighthouse mobile:** Performance 68 → **79**, FCP 3.8 s → 3.0 s, LCP 6.8 s → 4.5 s, page weight 774 → 579 KB (local build, same simulated slow 4G). |
| 23 | Swipe | Done. Off by default (Settings → לימוד). Either direction reveals the answer, then → is "טוב" and ← is "שוב". Vertical drags still scroll. |
| 24 | System text size | Done:<br>• all stylesheet font sizes are in rem;<br>• iOS follows Dynamic Type (`-apple-system-body`, iOS only). At the default iPhone text size this makes text about 6% larger than before (17px base instead of 16px);<br>• the smallest labels went from 11–11.5px to 12–12.5px.<br>Inline `fontSize` values in components are still px. |

**Still to check on a real phone** (emulation can't show these):
- Google sign-in from the installed home-screen app on iPhone (it has its own storage, so you'll sign in once there);
- the real on-screen keyboard with sheets and editors (the audit used a simulated one);
- notch padding in landscape;
- pinch gestures.

---

## 7. Follow-up after testing on the phone (2026-11-13)

- **Image editor:** drawing a box no longer opens the keyboard on phones, which used to shift the image mid-drawing. The label field is right under the image, ready to tap. A label keyboard left open closes once the next box is finished.
- **Formula keyboard simplified** to four tabs: **123 · abc · מתמטיקה · כימיה**. The statistics, Greek and templates tabs are gone; the common Greek letters moved into מתמטיקה.
- **Typing below or above the line:**
  - while the caret is in a subscript, superscript or fraction, an amber banner says "↓ כותבים עכשיו למטה" or "↑ כותבים עכשיו למעלה", with a large **"חזרה לשורה ↩"** button;
  - every tab also has a "↩ לשורה" key;
  - the chemistry keys say "X₂ למטה" and "X⁺ למעלה", and element symbols are upright.
- **Study screen:** card and buttons are centred again. Only when a card is too long for the screen do the buttons stay pinned to the bottom.
- **Same keyboard size on every tab:** all four tabs (including a custom letters tab replacing MathLive's) are 4 rows × 10 equal keys, so the keyboard and key size never change when switching.
- **Chemistry without switching:** the כימיה tab has the elements *and* digits. Digits there go straight to the lower position while the caret stays on the line, and ⁺ / ⁻ go up. CH₂COOH⁺ is typed in one tab with no level changes; two digits in a row merge (C₁₂). Normal-height digits (coefficients like 2H₂O) are in 123.
- **Keyboard redesign:**
  - the app's own colours, one type size, and every row exactly ten equal keys;
  - the tabs are a plain segmented control;
  - chemistry digits are **normal by default** (so 2H₂O works), and a **"למטה"** key (Shift) lowers the next digit (double-tap locks it, for C₁₂);
  - while it's on, the digits show lowered in colour, and no other key changes meaning.
