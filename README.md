# Article Tracker v2 (React + Node + MSSQL)

An admin creates articles, gets **one share link per article**, copies or shares it, and sees
**who opened it, how many times, how long it stayed open, how long they actually read**, how far
they scrolled, and their answers to the article's **questions** (1 to 20, every Google Forms / Microsoft Forms type).

## What's new in v6
- **A4 page view removed** — the reader has the normal view and Full screen only.
- **Heading and subheading styling** — heading: background colour, font colour (Auto = readable white/dark), font size 18–72 px.
  Optional subheading (e.g. the edition line): text, background colour (Auto = same band as the heading), font colour, font size 12–40 px.
  On phones the sizes shrink so long titles fit. A new article starts with the look of your last article (not the subheading text).
- **1 to 20 questions** per article (`MAX_QUESTIONS`): add, move up/down, duplicate, delete.
- **Every question type from Google Forms and Microsoft Forms**: Short answer, Paragraph, Multiple choice (with “Other”),
  Checkboxes (with “Other”), Dropdown, Ranking, Linear scale, Rating (star / heart / thumbs / number), Net Promoter Score,
  Likert, Multiple choice grid, Checkbox grid, Date (optionally with time), Time, File upload.
  Each question: Required on/off, optional description, shuffle option order (choice types).
- **Scoring**: multiple choice / dropdown (one correct option), checkboxes (all correct options must be picked) and short answer
  (accepted answers, not case-sensitive) are scored when you mark the correct answer. Leave it unmarked for an opinion question.
  Other types are collected for you to review. The report shows “x/y correct” or “Submitted” when nothing is scored.
- **Quiz heading and note** per article (default “Check your understanding”). They stay editable after people have answered.
- **File upload answers** are stored in the database (`ResponseFiles`); allowed types per question (PDF, image, document,
  spreadsheet, presentation), 1/5/10 files, 1/5/10 MB (server limit 10 MB). The file's first bytes must match its extension.
  Download them from the reader's row in the report.

## What's new in v2
- **Admin login** (username + password, JWT). Each admin sees only their own articles.
- **Share link per article** — `PUBLIC_APP_URL/r/<share-token>`. Copy, Email, Teams, or the phone's Share sheet.
  The reader enters name and email once (remembered on that device), then reads. The link can be closed for new readers.
- **Two ways to write content**
  - **Word document** — Word-style editor (headings, bold, lists, alignment, links, tables, images), plus **Import Word file (.docx)**:
    text, headings, tables and pictures come in and stay editable.
  - **HTML code** — code + live preview, with **Insert image**.
- **Images** in both modes — uploaded to the database (`ArticleAssets`), served from `/api/files/<id>`. PNG, JPG, GIF, WebP up to 5 MB.
- **Header**: colour picker (presets, any colour, hex) and **logo on the right**. Title text switches dark/white automatically for readability.
  A new article starts with the colour and logo of your last article.
- Personal invite links from v1 still work (optional section on the report page).

## Setup
### New database
Run `database/schema.sql`.
### Existing database
From v1: run `database/migrations/002_admin_share_branding.sql` once (in SSMS — it uses `GO`).
Then (v1 or v2): run `database/migrations/003_away_tracking.sql` once.
Then: run `database/migrations/004_header_styles_question_types.sql` once (heading styles, quiz heading, question types, file uploads).
Old articles, questions and answers keep working.

### API
```bash
cd backend
cp .env.example .env        # fill DB_*, JWT_SECRET, PUBLIC_APP_URL
npm install
npm run create-admin -- dhvani "Dhvani" "YourStrongPassword"
npm run dev                 # http://localhost:5000
```
`create-admin` with an existing username resets that password. The first admin also takes over articles made in v1.

### Web
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :5000)
```
Open `http://localhost:5173/admin` and sign in.

## How tracking works
- Each reader has a personal token (created when they join through the share link, or when invited).
- Page load → `open` (one `ArticleViewSessions` row). Every 15 s while on the page → `heartbeat`. Every leave and return → immediate `heartbeat`. Tab closed → `close`.
- The reader is **on page** only when the article tab is in front **and** the browser window is active.
  Another tab, another app or window (Alt-Tab), minimising, or the phone home screen all count as **away**.
- **On page** = seconds on the article. **Away** = seconds open but elsewhere. **Left page** = number of times they went away.
  **Total open** (in the row detail) = opened → closed (or last heartbeat).

## Reader views
- **Normal** — screen reading column.
- **Full screen** — whole page full screen; tracking and scrolling work the same.
- Report refreshes every 30 s while open; CSV export opens in Excel (Gujarati/Hindi names safe).

## Production notes
- Serve `frontend/dist` and reverse-proxy `/api` to Node **on the same origin**, and leave `VITE_API_URL` empty.
  Article images use `/api/files/...` paths, so they need `/api` on the same host as the page.
- `PUBLIC_APP_URL` must be the URL people actually open, or copied links will be wrong.
- Optional `ALLOWED_EMAIL_DOMAINS=rubamin.com` — only company emails can join through the share link.

## Known gaps
- Away tracking counts window focus, not eyes: a reader who leaves the article in front and walks away is still "on page".
  If the browser is killed while the reader is away (common on phones), away time since the last beat is lost
  (the leave itself is already recorded). Sessions recorded before migration 003 show no away data.
- Files a reader uploads but removes, or uploads and never submits, stay in `ResponseFiles` until the reader is deleted
  (files not in the final answers are removed when they submit).
- No section breaks / branching ("go to section based on answer") and no response validation rules (number, regex) yet.
- Ranking: the reader orders items with arrow buttons (no drag and drop). An untouched ranking is saved in the shown order.
- Full screen is not available on iPhone (Safari allows it only for videos); the button is hidden there.
- Readers who joined through the share link cannot switch to another person on the same device/browser.
- **Identity is self-declared**: on the share link the reader types their email; nothing verifies it (no OTP/SSO).
  `ALLOWED_EMAIL_DOMAINS` limits the domain only.
- No screen to add admins or change password — use `npm run create-admin`.
- Login lockout (8 wrong tries / 15 min) is in memory; it resets when the API restarts.
- Word import: EMF/WMF pictures (some charts, SmartArt, old clip-art) are skipped with a warning. Fonts, colours and
  page layout from Word are not kept — the article uses the app's reading style.
- Switching an article from HTML to Word editor may drop custom HTML styling (you are asked first).
- Uploaded images that are later removed from an article stay in the database (no cleanup yet).
- No delete for articles/readers yet.
