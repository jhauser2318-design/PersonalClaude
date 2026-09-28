# Life Control Center

A personal dashboard that runs on your own computer and opens in your web browser.

**Phase 1 (this version): Goals & Tasks.**

- Four life areas, each with its own color: **Work**, **Health**, **Social**, **Education**.
- **Goals** with a status, a progress %, an optional target date, and a timestamped history of updates.
- **Tasks**: small action steps with a priority and an optional due date. A task can belong to a goal.
- **Routines**: recurring tasks such as the gym, skincare or CPA study. Each one runs every day, on chosen days, or N times a week, with an optional daily target (e.g. 2 hours). The app tracks streaks, best streaks, 30-day completion and a 12-week history grid.
- **Calendar**: your **Google Calendar** inside the app. A week view of your events next to the tasks due each day; add, edit or delete events, and changes show up on your phone.
- **Email**: ask the AI about your **Gmail** ("What did Sarah say about the budget?", "Any bills due?") and have it draft emails and replies. You always review a draft and click **Send** yourself.
- **Shopping list**: things you **need** and **want**, each with what it is, its price and a link to the store. Totals for each, a "Bought" list, and paste-a-link to fill in the name and price.
- **Finances**: your bank accounts and credit cards (through **SimpleFIN Bridge**, read-only). Cash flow per month, spending by category, monthly budgets with pace tracking, recurring charges and subscriptions, a searchable transaction list, and AI reports and answers ("How much did I spend on dining last month?"). Transactions are sorted into categories by AI; your corrections stick.
- **Follow-ups & notifications**: a list of things you need to follow up on or are waiting on from others, and **reminders** on tasks, routines and follow-ups that pop up as **Windows notifications**, even when the app is closed. Optional morning briefing and budget alerts.
- **On your iPhone**: the same app and data on your phone as a home-screen app, linked privately to your PC through Tailscale, updating live on both.
- **Dashboard**: a "command center" with a progress ring for each area, today's schedule, today's routines, what's due today and this week, overdue items, and an activity feed.
- **Live command bar**: type normal sentences and Claude (Anthropic's AI) makes the changes for you. Every change can be undone.


---

## Quick start (Windows)

You do this **once**. After that you just double-click the **Life Control Center** icon on your Desktop.

### 1. Get your Anthropic API key (so it's ready to paste)

The command bar uses Claude through Anthropic's API. An **API key** is like a password that lets the app use your Anthropic account.

1. Go to **https://console.anthropic.com** and sign up or log in.
2. Open **Settings → Billing** and add a small amount of credit. The API is pay-as-you-go, and each command-bar sentence is one small request.
3. Open **Settings → API Keys** and click **Create Key**. Name it `life-control-center`.
4. **Copy the key** (it starts with `sk-ant-`). It's shown only once, so keep the page open until step 3 below.

### 2. Download the app

Click this link:

### 👉 [Download Life Control Center (ZIP)](https://github.com/jhauser2318-design/PersonalClaude/archive/refs/heads/main.zip)

When it has downloaded, open your **Downloads** folder, right-click the ZIP, and choose **Extract All… → Extract**.

### 3. Double-click `INSTALL.bat`

It's in the folder you just extracted. The installer:

- finds Python on your computer, and **installs it for you if it's missing**
- copies the app to **`C:\Users\<your name>\LifeControlCenter`**
- installs everything the app needs (the first time takes a minute or two)
- asks you to **paste your API key**: right-click in the window (or press Ctrl+V), then press **Enter**
- puts a **Life Control Center** icon on your **Desktop** and in the **Start menu**
- opens the app in your browser

If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. This appears because the file came from the internet.

After this, you can delete the ZIP and the extracted folder. The app lives in `C:\Users\<your name>\LifeControlCenter`.

### Every day after that

**Double-click the Life Control Center icon on your Desktop** (or find it in the Start menu). The app opens in **its own window**, like any other program: no browser tabs, no address bar.

- **Closing the window closes the app.** It shuts itself down within a few minutes of the window closing, so nothing keeps running in the background.
- **Pin it** so it's one click away: right-click the Desktop icon, choose **Show more options → Pin to taskbar** (or **Pin to Start**).
- Behind the scenes, the window shows the page at http://localhost:8000. (`localhost` means "this computer": the app isn't on the internet, and nobody else can see it.)
- The window uses Microsoft Edge, which comes with Windows (or Google Chrome if Edge is missing). It keeps its own settings, separate from your normal browser.

### Updates install automatically

**Every time you click the Desktop icon**, the app checks GitHub for a newer version first, even if it's already open. While it checks, you'll see a short **"Checking for updates…"** screen.

- If there's a new version, it installs it (usually a few seconds), restarts itself, and opens. A small banner tells you what changed.
- You can also click **Check for updates** at the bottom of the sidebar (or in **Settings**) at any time. Open windows refresh themselves once the new version is running.
- If you're offline, it skips the check and opens normally.
- **Your goals, tasks, routines, calendar connection and API key are never touched** by an update. Only the app's code changes.
- **Settings → Version & updates** shows which version you have.

> If you change the app's code files directly in `C:\Users\<you>\LifeControlCenter`, the next automatic update will overwrite them. Make changes on GitHub instead (or ask Claude to).

> **Reinstalling:** you can always download the ZIP again and run `INSTALL.bat`. It also keeps your data and key.

<details>
<summary>Setting it up by hand instead (Windows PowerShell)</summary>

1. Install Python from https://www.python.org/downloads/. On the first screen, tick **"Add python.exe to PATH"**.
2. Copy `.env.example` to a new file named `.env`, open it in Notepad, and paste your key after `ANTHROPIC_API_KEY=`.
3. In PowerShell, in the project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn backend.main:app --port 8000
```

Then open http://localhost:8000. If PowerShell says running scripts is disabled, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
</details>

<details>
<summary>Mac / Linux</summary>

Install Python 3.10 or newer, copy `.env.example` to `.env` and add your key, then open Terminal in the project folder, run `./start.sh`, and open http://localhost:8000.
</details>

> 🔒 **Your key stays private.** It's saved only in the `.env` file on your computer. `.env` is listed in `.gitignore`, so it's never uploaded to GitHub, and your browser never sees it.

---

## Using the app

### The command bar

The bar at the top is always visible. Press **/** anywhere to jump to it. Type a sentence and press **Enter**:

| You type | What happens |
|---|---|
| `New health goal: run a 5K by March` | Creates a Health goal with a target date at the end of March |
| `Went to the gym today, update my fitness goal` | Finds your fitness goal and adds a timestamped note (and may bump progress) |
| `Add a work task to email Sarah about the budget by Friday` | Creates a Work task due this Friday |
| `Mark the Spanish lesson task as done` | Ticks off the matching task |
| `What should I focus on this week?` | Gives you a short, prioritized answer (no changes made) |
| `I'm 60% done with the Q4 plan` | Sets that goal's progress to 60% |
| `Went to the gym and did my skincare` | Checks off both routines for today |
| `Studied CPA for 2.5 hours` | Logs 2.5 hours on the CPA study routine |
| `I did my skincare yesterday too` | Logs the routine for yesterday |
| `Set up a routine to do FAR practice questions Mon, Wed and Fri` | Creates a new routine on those days |
| `Pause the gym routine` | Pauses it (streaks aren't counted while paused) |
| `Schedule CPA study tomorrow 7–9pm at the library` | Adds an event to your Google Calendar |
| `Move my dentist appointment to Thursday at 3pm` | Moves the event (it keeps its length) |
| `Cancel the team standup on Friday` | Removes that event from your calendar |
| `When am I free this week for a 2-hour study block?` | Lists free slots from your calendar (no changes made) |
| `Block Saturday morning for FAR practice and log 1 hour of CPA study` | Does both in one go |
| `Add AirPods Pro to my wants, $249, for the gym` | Adds it under Wants with the price and a short description |
| `Add this to my needs: https://store.com/desk-lamp` | Adds it from the link, reading the name and price from the page when the store allows it |
| `Move the headphones to needs and change the price to $299` | Updates the item |
| `I bought the running shoes` | Marks it bought (it moves to the Bought list) |
| `How much are my wants in total?` | Answers from your list (no changes made) |
| `What did Sarah say about the budget?` | Searches your Gmail, reads the relevant emails and answers (with links to them) |
| `Do I have any bills due this month?` | Finds bill emails and lists amounts and due dates |
| `Reply to Sarah that $48,500 works` | Drafts the reply and opens it for you to check. **Nothing is sent until you click Send.** |
| `Email Alex asking if Saturday dinner still works` | Drafts a new email for you to review and send |
| `How much did I spend on dining last month?` | Looks through your synced transactions and answers with totals |
| `Am I on track with my budget this month?` | Compares spending so far with your budgets and the day of the month |
| `What subscriptions am I paying for?` | Lists recurring charges with amounts |
| `Set my dining budget to $300` | Sets that monthly budget |
| `How did yesterday go money-wise?` | Income, spending and net for yesterday, compared with a normal day |
| `Always put Zelle payments to Mike in Housing` | Saves it as a finance rule and re-sorts your transactions with it |
| `Remind me to call Mom at 6pm` | Adds a task due today with a 6 PM reminder |
| `Remind me every day at 7am to do my skincare` | Adds a daily reminder to that routine (only pops up if it isn't done yet) |
| `Follow up with Sarah about the contract Friday at 10am` | Adds a follow-up with a reminder |
| `Waiting on Mike for the invoice` | Adds it under "Waiting on…" |
| `Sarah sent the contract` | Closes that follow-up |

After each command you'll see a short confirmation of exactly what changed, with an **Undo** button.
If Claude isn't sure what you mean (for example, two goals could match), it **asks you a question instead of guessing**. Type your answer in the bar and it will remember what you were talking about.

### Clicking instead of typing

- **Goals** page: **New goal**, or click any goal card to open it. There you can drag the progress slider, add notes, add or tick off its tasks, **Edit**, or **Delete**.
- **Tasks** page: tick a checkbox to complete a task, or click a task to edit it. The pencil and bin icons edit and delete. Today's routines are listed at the top.
- **Routines** page: click the big circle to check a routine off for today (click again to undo). Routines with a daily target have a box to log amounts (e.g. 1.5 hours now, 1 more hour later). The ⏸ button pauses a routine and the pencil edits or deletes it. The grid shows the last 12 weeks: bright = done, faded = partly done, red = missed.
- **Calendar** page: a week at a time (‹ Today › to move between weeks). Click an event to edit or delete it, **+** on a day to add one, or **New event**. Tasks due that day are listed under the events.
- **Shopping list** page: **Add item** (or **+** on Needs or Wants). Paste a store link and click **Fetch details** to fill in the name, description and price when the store allows it; some big stores such as Amazon block this, so type those yourself. Tick the box when you've bought something; click an item to edit it.
- **Life areas** in the sidebar (Work, Health, …) show one area's progress, goals and tasks on a single page.
- **Settings**: switch between light, dark and system themes, and manage the example data.

### Connecting Google Calendar (one time, about 10 minutes)

Google requires every app that uses Google Calendar to be registered. Because this app runs only on your computer, you register it in **your own** free Google Cloud account. The **Calendar** page in the app walks you through the same steps.

1. Go to **https://console.cloud.google.com** and sign in with the Google account whose calendar you want (e.g. jhauser2318@gmail.com). Accept the terms if asked.
2. At the top, click the project picker → **New project**. Name it `Life Control Center` → **Create**, then make sure it's selected.
3. In the search bar, type **Google Calendar API**, open it, and click **Enable**.
4. Open **Google Auth Platform** (in older versions it's **APIs & Services → OAuth consent screen**) → **Get started**:
   - App name: `Life Control Center`; user support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree and **Create**.
5. Go to **Audience** and click **Publish app** → **Confirm**. If Google says you must first complete the **Branding** page, open **Branding**, fill in only the app name, user support email and developer contact email (no logo), save, and try again.
   - **If Google still won't let you publish**, add your email under **Audience → Test users** instead. Everything works the same, except that Google disconnects the app every 7 days. When that happens, the Calendar page shows a one-click **Connect** button.
   - Publishing doesn't make anything public: only people with your client file could even try to use it.
6. Go to **Clients** (or **Credentials → Create credentials → OAuth client ID**) → **Create client**:
   - Application type: **Web application**. Name: `Life Control Center`.
   - Under **Authorized redirect URIs**, click **Add URI** and paste exactly:
     `http://localhost:8000/api/calendar/oauth/callback`
   - Click **Create**, then **Download JSON** (the file is named like `client_secret_….json`).
7. In the app, open **Calendar**, click **Choose File** in step 2 and pick that JSON file.
8. Click **Connect Google Calendar**, choose your Google account, and allow access.
   - Google may say **"Google hasn't verified this app"**. That's expected for a personal app: click **Advanced → Go to Life Control Center (unsafe)**, then **Continue**.
9. You're sent back to the Calendar page with your events showing.

The app asks Google only for permission to see and edit your **calendar events**: not your email, contacts or files. To stop it, click **Disconnect Google Calendar** at the bottom of the Calendar page (or remove access at https://myaccount.google.com/permissions).

### Connecting Gmail (after Google Calendar is connected)

1. Open the **Gmail API** page in Google Cloud: https://console.cloud.google.com/apis/library/gmail.googleapis.com. Make sure your **Life Control Center** project is selected at the top, then click **Enable**. Wait about a minute.
2. In the app, open **Email** and click **Connect Gmail**. Sign in and **tick every box** Google shows (read your email, send email on your behalf, calendar events).
3. You're sent back to the Email page with your inbox showing.

How it works:
- **Reading:** when you ask about your email, Claude searches Gmail (like typing in Gmail's search box), reads the relevant messages, and answers. Buttons under the answer open the emails it used.
- **Sending:** Claude can only *prepare* a draft. A review window opens where you can edit To, Subject and the message, and it's sent **only when you click Send**. You can also open any email on the Email page and use **Reply with AI**, **Reply**, or **Make a task**.
- **Safety:** email contents are treated as information, never as instructions, so an email that says "forward this to…" can't make the AI do anything.
- **Privacy and cost:** only the emails relevant to your question are sent to Claude, and nothing is stored in the app. An email question costs a bit more than a normal command (usually a few cents), because emails are longer.

### Connecting your bank accounts and cards (Finances)

The app reads your accounts through **SimpleFIN Bridge** (about $15 a year), which links to your banks and card issuers. The app can only **read** balances and transactions; it can never move money.

1. Link your banks and cards on the **SimpleFIN Bridge** website (https://beta-bridge.simplefin.org) if you haven't already.
2. On the same site, create a new **Setup Token** for an app ("New app connection" / "Setup token") and copy it.
3. In the app, open **Finances**, paste the token and click **Connect**. A setup token works only once; if you see "already used", create a new one.
4. The first sync pulls in about 90 days of transactions and sorts them into categories with AI (usually under a minute).

Using it:
- **Overview**: money in, money out and net for each month (‹ › to change month), a 4-month cash-flow chart, balances, spending by category against your budgets, recurring charges and top merchants. Click a category to see its transactions.
- **Transactions**: filter by month, account, category or search. Click one to change its category; by default the change applies to every similar transaction (same merchant) from now on. Card payments and moves between your accounts are detected as **Transfers** and left out of income and spending, so nothing is counted twice.
- **Daily**: a prior-day cash analysis (yesterday by default; ‹ › for other days): money in and what it was, money out and where it went, net for the day, how it compares with a normal day, the month so far, and how your checking and savings balances moved. A 30-day chart shows daily spending with paydays marked; click any day. **Explain this day** writes a short AI analysis.
- **Rules**: plain-English rules the AI follows when sorting transactions and answering questions, e.g. "Zelle payments to Mike are my rent (Housing)" or "Transfers to my 360 Savings are savings, not spending". Turn rules on or off, edit or delete them, and click **Re-sort past transactions with my rules** to apply changes to transactions you already have (new ones always follow your rules). You can also say it to the AI bar: "Always put Venmo to Mike in Housing". In a transaction, **Make a rule…** starts one for you. Your own fixes on the Transactions tab always win.
- **Budgets**: a monthly amount per category. **Fill in from my average spending** gives you a starting point. Bars turn yellow when you're ahead of pace and red when you're over.
- **Reports & questions**: one-click AI reports (this month, last month, last 90 days), or ask anything about your money.
- The app syncs when it starts and when you open Finances (if the last sync is a few hours old), and with **Sync now**. SimpleFIN itself refreshes from your banks about once a day. If a bank needs you to sign in again, a notice appears; fix it on the SimpleFIN website.
- To edit an account (nickname, type, or hide it from totals), click the pencil next to it in **Balances**. **Connection…** disconnects.

### Notifications and follow-ups

1. Open **Follow-ups** and click **Turn on notifications**. A test notification appears in the bottom-right corner of your screen.
2. Add reminders:
   - **Tasks**: "Remind me" date and time in the task editor.
   - **Routines**: "Daily reminder" time in the routine editor. It only pops up if you haven't checked the routine off yet that day.
   - **Follow-ups**: "Remind me" in the follow-up editor.
   - Or just tell the AI bar ("Remind me to…", "Follow up with… on Friday").
3. Optional: pick a **Morning briefing** time (tasks due, routines to do, follow-ups due, and yesterday's spending) and keep **Budget alerts** on.

How it works: turning notifications on adds a small Windows scheduled task, "Life Control Center reminders", that checks once a minute whether anything is due. It runs while you're signed in to Windows, **even when the app window is closed**, and uses almost no power. Click a notification to open the app on the right page. If the computer was off at reminder time, the reminder shows up as soon as you sign in again (up to a day late). Each morning the check also syncs your bank accounts, so budget alerts don't wait for you to open the app. **Turn off** removes the scheduled task.

The **Follow-ups** page lists "I need to…" and "Waiting on…" items, every upcoming reminder, and recent notifications.

### Using the app on your iPhone (Tailscale)

Your PC stays the "home base": the app and all your data live there, and your phone opens it through **Tailscale**, a free, private, encrypted link between your own devices. Nothing is opened to the internet. Everything you do on either device shows up on the other within a few seconds.

**On the PC** (open the app → **Settings → Phone & devices** and follow the numbered steps):
1. **Turn on background mode.** The app then starts quietly when you sign in to Windows, keeps running after you close its window, and installs updates by itself every hour.
2. **Keep the PC awake**: Windows **Settings → System → Power & battery → Screen and sleep**: set "When plugged in, put my device to sleep after" to **Never** (the screen can still turn off). Laptop: **Control Panel → Power Options → Choose what closing the lid does → When I close the lid (Plugged in): Do nothing**.
3. **Install Tailscale**: https://tailscale.com/download/windows. Sign in with your Google account.
4. In the Tailscale admin page (https://login.tailscale.com/admin/dns) turn on **MagicDNS** and **HTTPS Certificates**.
5. Back in the app, **set a passcode** (6+ characters), then click **Turn on phone access**. If Tailscale opens a page asking you to allow it, approve it and click the button again. A QR code appears.

**On the iPhone:**
1. Install **Tailscale** from the App Store, sign in with the **same** Google account, allow the VPN configuration, and leave it connected.
2. Point the **Camera** at the QR code on the PC and open the link in Safari (or type the address shown under the QR code).
3. Enter your passcode.
4. Tap **Share → Add to Home Screen → Add**. Open the app from the new icon and enter the passcode once more (the home-screen app keeps its own sign-in, separate from Safari).

Good to know: the phone can reach the app whenever the PC is on, awake and signed in to Windows. Connecting Google (Calendar/Gmail) is done on the PC. Signed-in phones are listed under **Settings → Phone & devices**, where you can sign them out; setting a new passcode signs out every phone.

### Example data

The first time you start the app, it adds one example goal per life area plus a few tasks, so you can try things out. When you're ready for your own data, go to **Settings → Clear example data**. This removes only the examples, never anything you created. **Load examples again** brings them back.

---

## Your data and privacy

- Everything is saved in one file on your computer: **`C:\Users\<you>\LifeControlCenter\data\life.db`** (a SQLite database).
  **To back it up**, stop the app and copy that file somewhere safe.
- `data/*.db` is in `.gitignore`, so your personal data won't be uploaded to GitHub either.
- When you use the **command bar**, the backend sends Anthropic your sentence plus a short list of your goals, tasks, routines and (if connected) calendar events for the next two weeks (titles, dates, locations), so Claude can work out what you mean. Clicking around the app doesn't send anything to Anthropic.
- **Google Calendar**: your Google client file and access token are saved in `data\google_client.json` and `data\google_token.json` on your computer, never uploaded anywhere. Calendar changes go straight from your computer to Google.
- **Finances**: the SimpleFIN access link is saved in `data\simplefin.json` and your transactions in `life.db`, both only on your computer. For AI features, Claude sees merchant descriptions (to sort them into categories) and, when you ask a question or request a report, the totals and transactions it looks up to answer. Account numbers are never sent.
- You can check your API usage and spending at https://console.anthropic.com.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Installer says Python can't be found | Restart your computer and double-click `INSTALL.bat` again. If that fails, install Python from python.org (tick **"Add python.exe to PATH"**) and run `INSTALL.bat` again. |
| Yellow banner: *"The command bar needs an Anthropic API key"* | Run `INSTALL.bat` again and paste your key, or open `C:\Users\<you>\LifeControlCenter\.env` in Notepad and put it after `ANTHROPIC_API_KEY=`. Then close the app's window and start it again. |
| *"Anthropic rejected the API key"* | The key was mistyped or deleted. Create a new one in the Console and paste it again. |
| *"Too many requests… or your credit ran out"* | Wait a minute, or add credit under **Billing** in the Anthropic Console. |
| `address already in use` / port 8000 busy | Another program is using port 8000. Change `8000` to `8001` (in two places) in `start.bat`, then open http://localhost:8001. |
| The page says it can't reach the backend, or http://localhost:8000 won't load | The app isn't running. Double-click the Desktop icon. |
| Some pages say *"Something went wrong loading this page: Not Found"* | An older copy of the app was still running in the background. Restart your computer, then open the app from the Desktop icon. (Newer versions detect and replace an old running copy automatically.) |
| Calendar says *"redirect_uri_mismatch"* when connecting | In Google Cloud → Clients → your client, the redirect URI must be exactly `http://localhost:8000/api/calendar/oauth/callback`. Fix it, save, download the JSON again and upload it on the Calendar page. |
| Calendar says *"access_denied"* / *"app is being tested"* | Publish the app (step 5 above), or add your email under **Audience → Test users**. |
| Calendar keeps asking to reconnect every week | The app is still in "Testing" in Google Cloud. Publish it (step 5 above) and connect once more. |
| Email says *"The Gmail API isn't turned on"* | Do step 1 of "Connecting Gmail" (enable the Gmail API in the right project), wait a minute, and try again. |
| Email says *"Gmail access wasn't fully granted"* | Click **Connect Gmail** again and tick every box on Google's permission screen. |
| Finances says the Setup Token *"was already used or is invalid"* | Each token works once. Create a new one on the SimpleFIN Bridge website and paste it. |
| Finances says SimpleFIN *"no longer accepts this app's access"* | Access was removed on the SimpleFIN side. Click **Connection… → Disconnect**, then connect again with a new token. |
| A transaction is in the wrong category | Click it on the **Transactions** tab and pick the right one (tick "all similar" so it sticks). |
| Phone says *"Can't reach your PC right now"* | Check the PC is on and awake (not asleep), and that Tailscale shows **Connected** on the iPhone. |
| Phone access button says Tailscale needs something switched on | Approve the page Tailscale opened (or turn on **HTTPS Certificates** at https://login.tailscale.com/admin/dns), then click **Turn on phone access** again. |
| No notifications appear | On Follow-ups, click **Send a test**. If nothing shows, check Windows **Settings → System → Notifications**: notifications must be on, **Do not disturb** / Focus off, and "Life Control Center" (or "Windows PowerShell") allowed. Problems are logged in `data\notifier.log`. |
| Double-clicking the icon does nothing, or an error box appears | Look in `C:\Users\<you>\LifeControlCenter\data\app.log` for details, or double-click `start.bat` in that folder to see the app's messages as it starts. |

---

## For later phases: how the project is organized

```
LifeControlCenter/
├── INSTALL.bat              ← one-time Windows setup (runs scripts/install.ps1)
├── launcher.pyw             ← what the Desktop icon runs: updates, then starts the app in its own window
├── updater.py               ← downloads the newest version from GitHub (keeps data/ and .env)
├── notifier.pyw             ← the once-a-minute reminder check (run by Windows Task Scheduler)
├── start.bat / start.sh     ← starts the app with a visible log window (handy for troubleshooting)
├── requirements.txt         ← Python packages the app needs
├── .env.example             ← template for your settings (copy to .env)
├── data/                    ← your database lives here (not uploaded to GitHub)
├── backend/                 ← Python (FastAPI) server
│   ├── main.py              ← starts the web server and loads every module
│   ├── config.py            ← reads .env
│   ├── database.py          ← SQLite helpers; each module registers its own tables
│   ├── areas.py             ← the 4 life areas and their colors
│   ├── notify.py            ← finds due reminders and shows Windows notifications
│   └── modules/
│       ├── __init__.py      ← the list of backend modules
│       ├── goals/           ← Phase 1: goals, tasks, notes, dashboard, examples
│       ├── habits/          ← routines: schedules, logs, streaks
│       ├── calendar/        ← Google sign-in (OAuth) and Calendar events
│       ├── email/           ← Gmail: search, read, send; the email AI assistant
│       ├── shopping/        ← shopping list (needs/wants) and reading product links
│       ├── finances/        ← SimpleFIN sync, categories, budgets, cash flow; the finance AI assistant
│       ├── followups/       ← follow-ups, reminders, notification history and settings
│       ├── remote/          ← phone access: passcode sign-in, devices, background mode, Tailscale setup
│       └── assistant/       ← command bar: Claude prompt, JSON schema, apply + undo
└── frontend/                ← what you see in the browser (plain HTML/CSS/JS, no build step)
    ├── index.html, styles.css
    └── js/
        ├── app.js           ← sidebar, page navigation, command bar
        ├── modules.js       ← the list of sidebar modules ("Coming soon" ones too)
        ├── components.js    ← goal cards, task rows, edit dialogs
        └── views/           ← one file per page
```

**Adding a new module later (e.g. "Travel"):**
1. Backend: create `backend/modules/travel/` with a `router` (its API endpoints) and optional `on_startup`, then add it to the `MODULES` list in `backend/modules/__init__.py`. (`backend/modules/shopping/` is a good example.)
2. Frontend: add `frontend/js/views/travel.js` with a `render(view)` function, then add it to the list in `frontend/js/modules.js`.
3. To let the command bar control it: add new action types to the schema and prompt in `backend/modules/assistant/claude_client.py`, and handle them in `actions.py`.

**How the command bar works under the hood:** the backend sends Claude your sentence, today's date and a compact list of your goals and tasks with their ID numbers. The request uses *structured outputs*, which forces Claude's reply to be JSON matching a fixed schema (`intent`, `reply`, `actions`). The backend checks every action and applies them all together in one step: if any action is invalid, nothing changes. Before changing anything it saves the old version of each item, which is what **Undo** puts back.

**Choosing models:** each AI feature (AI bar, email assistant, finance assistant, transaction sorting) can use a different Claude model: **Settings → AI models**. Defaults: Claude Sonnet 5 for the three assistants and Claude Haiku 4.5 for sorting transactions. Claude Opus 5 is the most capable and the most expensive. When a feature uses Opus 5, requests also turn on Anthropic's automatic *fallback*: if a safety check declines a request, Anthropic retries it on another Claude model instead of returning an error.
