# כרטיסיות אורז

אפליקציית כרטיסיות לימוד למבחנים, בעברית. Vite + React + TypeScript, ‏Firebase (Auth + Firestore בתוכנית Spark החינמית), ופריסה ל-GitHub Pages.

## הקמת Firebase (פעם אחת)

1. **יצירת פרויקט:** נכנסים ל-[console.firebase.google.com](https://console.firebase.google.com) ‏→ Add project. אין צורך ב-Google Analytics. נשארים בתוכנית **Spark** (חינם, בלי כרטיס אשראי). לא מפעילים Storage, ‏Functions או Hosting.
2. **הפעלת Firestore:** ‏Build → Firestore Database → Create database. בוחרים מיקום (למשל `eur3`) ומתחילים ב-**production mode**.
3. **Security Rules:** ב-Firestore → לשונית **Rules** מוחקים את כל מה שיש שם, מדביקים את כל התוכן של [`firestore.rules`](firestore.rules) ולוחצים **Publish**. בכל פעם שהקובץ משתנה מדביקים אותו מחדש.
4. **הפעלת Google Auth:** ‏Build → Authentication → Get started → Sign-in method → Google → Enable. בוחרים מייל תמיכה ושומרים.
5. **Authorized domains:** ‏Authentication → Settings → Authorized domains → Add domain, ומוסיפים `<username>.github.io` (שם המשתמש שלך ב-GitHub). ‏`localhost` כבר מופיע שם.
6. **ה-config:** גלגל השיניים → Project settings → General → Your apps → סמל `</>` (Web). נותנים שם, **בלי** Firebase Hosting. מעתיקים רק את הבלוק `const firebaseConfig = { … }` ומחליפים בו את הבלוק שב-[`src/firebase.ts`](src/firebase.ts). את שורות ה-`import` של Firebase לא מעתיקים.

**רק החשבון שלך:** ב-`firestore.rules` יש רשימת מיילים מורשים (`ALLOWED_EMAILS`). ה-repo ציבורי, ולכן בקובץ שבו יש placeholder (`you@example.com`). מחליפים אותו במייל שלך **רק בעותק שמדביקים בקונסול**. חשבונות אחרים יכולים להשלים כניסה עם Google, אבל לא לקרוא או לכתוב כלום, ויראו מסך "החשבון הזה לא מורשה". אם בעתיד משתפים את האפליקציה עם עוד מישהו, מוסיפים את המייל שלו לרשימה: `['a@gmail.com', 'b@gmail.com']`.

ה-config של Firebase ציבורי מטבעו, ואפשר לשמור אותו בקוד. מה שמגן על הנתונים הוא ה-Security Rules: כל משתמש קורא וכותב רק תחת `users/{uid}` שלו.

## פריסה ל-GitHub Pages

1. יוצרים repo ב-GitHub. השם צריך להתאים ל-`REPO_NAME` ב-[`vite.config.ts`](vite.config.ts), כרגע `orezDeck`.
2. דוחפים את כל התיקייה `orezDeck` (כולל `.github/workflows/deploy.yml` שנמצא בשורש, מחוץ ל-`site`) לענף `main`.
3. ב-repo: ‏**Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. כל push ל-`main` מריץ בדיקות, בונה ומפרסם. הכתובת: `https://<username>.github.io/orezDeck/`.

## פיתוח מקומי

```bash
cd site
npm install
npm run dev      # שרת פיתוח
npm test         # בדיקות (Vitest): אלגוריתם, ייבוא, תמונות
npm run build    # בנייה ל-dist/
```

אחרי הכניסה הראשונה אפשר ללחוץ "טעינת חפיסות לדוגמה" (במסך הבית כשאין חפיסות, או בהגדרות).

## איך לומדים

אין תאריכי חזרה, אין תזכורות ואין רצפים. לומדים כשרוצים.

- **סבב:** כל כרטיס בחפיסה נראה לפחות פעם אחת. אם עוצרים באמצע, "המשך סבב" ממשיך מאותה נקודה. כשכל הכרטיסים נראו, מתחיל סבב חדש.
- **סדר הכרטיסים:** כרטיסים שקיבלו "שוב" בפעם האחרונה קודמים לכל השאר. אחריהם כרטיסים מוכרים, משליטה נמוכה לגבוהה ומהישן לחדש. כרטיס חדש משולב אחרי כל שלושה מוכרים.
- **דירוג:**
  - **שוב:** הכרטיס חוזר אחרי 3–5 כרטיסים ושליטה מתאפסת.
  - **קשה:** חוזר אחרי כ-10 כרטיסים.
  - **טוב / קל:** יוצא מהסשן, עם שליטה +1 או +2 (עד 5).
- **מצבים:** "המשך סבב", "רק חלשים" (שליטה 0–2, או "שוב" בפעם האחרונה), ו"עבור על הכל" (סבב חדש עכשיו, החלשים קודם).
- **עלוקה:** כרטיס שקיבל "שוב" 3 פעמים ומעלה. כדאי לשכתב אותו. אפשר לסנן לפיהן בעמוד החפיסה.
- **כרטיסי בעיה:** בכל הצגה מופיעה וריאציה אחרת. הם לא חוזרים באותו סשן. "שוב" נותן להם עדיפות בסשן הבא.

האלגוריתם נמצא ב-[`src/lib/scheduler.ts`](src/lib/scheduler.ts) (פונקציות טהורות), והבדיקות שלו ב-`scheduler.test.ts`.

## ייבוא

- **מ-Claude:** במסך הייבוא לוחצים "העתקת הפרומפט ל-Claude", מדביקים אותו ל-Claude יחד עם חומר הלימוד, ומדביקים בחזרה את ה-JSON שהוא מחזיר. הפרומפט נמצא ב-[`docs/claude-import-prompt.md`](docs/claude-import-prompt.md).
- **CSV / TSV:** ייצוא מ-NotebookLM, או מ-Anki ‏(File → Export → Notes in Plain Text). המפריד מזוהה אוטומטית, ממפים עמודות לשאלה, תשובה ותגיות, ו-HTML ונוסחאות MathJax מומרים.
- **כפילויות:** מזוהות לפי טקסט צד השאלה, מול הכרטיסים הקיימים ובתוך הייבוא עצמו.

## כתיבת תוכן

- נוסחאות: `$...$` בתוך שורה, `$$...$$` בשורה נפרדת (KaTeX). לכימיה: `$\ce{CO2 + H2O <=> H2CO3}$`.
- השלמה: `{{c1::טקסט}}`. כל מספר c יוצר כרטיס נפרד, ורמז אופציונלי נכתב `{{c1::טקסט::רמז}}`.
- עיצוב קל: `**מודגש**`, `*נטוי*`, רשימות עם `- ` או `1. `, וטבלאות `| a | b |`.

## נתונים ומכסות

```
users/{uid}/decks/{deckId}                 name, examDate, roundNumber, stats
users/{uid}/decks/{deckId}/cards/{cardId}  type, front/back/text, tags, mastery, lapses, lastSeen, seenInRound, lastRating …
users/{uid}/images/{imageId}               data (WebP base64), width, height
users/{uid}/reviews/{id}                   cardId, deckId, rating, at
```

- **תמונות:** נדחסות בדפדפן ל-WebP ברוחב של עד 1400px, ביעד של כ-300KB. כל תמונה נשמרת במסמך נפרד, ונשמרת גם במטמון IndexedDB, כך שהיא יורדת פעם אחת לכל מכשיר.
- **אופליין:** Firestore שומר מטמון מקומי, כך שאפשר ללמוד בלי קליטה. הדירוגים מסתנכרנים כשהחיבור חוזר. התמונות של סשן יורדות כבר בתחילתו.
- **מכסות:** מסך הבית קורא רק את מסמכי החפיסות. פתיחת חפיסה קוראת את הכרטיסים שלה, וכל דירוג עולה 2 כתיבות. זה רחוק מהמכסה החינמית (50K קריאות ו-20K כתיבות ביום).
