# Life Control Center

A personal dashboard that runs on your own computer and opens in your web browser.

**Phase 1 (this version): Goals & Tasks.**

- Four life areas, each with its own color: **Work**, **Health**, **Social**, **Education**.
- **Goals** with a status, a progress %, an optional target date, and a timestamped history of updates.
- **Tasks**: small action steps with a priority and an optional due date. A task can belong to a goal.
- **Dashboard**: progress for each area, what's due today and this week, overdue items, and recent updates.
- **Live command bar**: type normal sentences and Claude (Anthropic's AI) makes the changes for you. Every change can be undone.

The sidebar already has spots for **Calendar, Finances, Email, Follow-ups and Shopping list**. They say "Coming soon" and will be built in later phases.

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

- **Closing the window closes the app.** Nothing keeps running in the background.
- **Pin it** so it's one click away: right-click the Desktop icon, choose **Show more options → Pin to taskbar** (or **Pin to Start**).
- Behind the scenes, the window shows the page at http://localhost:8000. (`localhost` means "this computer": the app isn't on the internet, and nobody else can see it.)
- The window uses Microsoft Edge, which comes with Windows (or Google Chrome if Edge is missing). It keeps its own settings, separate from your normal browser.

### Updates install automatically

Every time you open the app from its Desktop icon, it first checks GitHub for a newer version. While it checks, you'll see a short **"Checking for updates…"** screen.

- If there's a new version, it downloads and installs it (usually a few seconds), then opens. A small banner tells you what changed.
- If you're offline, it skips the check and opens normally.
- **Your goals, tasks, notes and API key are never touched** by an update. Only the app's code changes.
- **Settings → Version & updates** shows which version you have.

So when Claude (or you) changes the code on GitHub, you'll get it the next time you open the app. If the app is open when the change is made, close it and open it again.

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

After each command you'll see a short confirmation of exactly what changed, with an **Undo** button.
If Claude isn't sure what you mean (for example, two goals could match), it **asks you a question instead of guessing**. Type your answer in the bar and it will remember what you were talking about.

### Clicking instead of typing

- **Goals** page: **New goal**, or click any goal card to open it. There you can drag the progress slider, add notes, add or tick off its tasks, **Edit**, or **Delete**.
- **Tasks** page: tick a checkbox to complete a task, or click a task to edit it. The pencil and bin icons edit and delete.
- **Life areas** in the sidebar (Work, Health, …) show one area's progress, goals and tasks on a single page.
- **Settings**: switch between light, dark and system themes, and manage the example data.

### Example data

The first time you start the app, it adds one example goal per life area plus a few tasks, so you can try things out. When you're ready for your own data, go to **Settings → Clear example data**. This removes only the examples, never anything you created. **Load examples again** brings them back.

---

## Your data and privacy

- Everything is saved in one file on your computer: **`C:\Users\<you>\LifeControlCenter\data\life.db`** (a SQLite database).
  **To back it up**, stop the app and copy that file somewhere safe.
- `data/*.db` is in `.gitignore`, so your personal data won't be uploaded to GitHub either.
- When you use the **command bar**, the backend sends Anthropic your sentence plus a short list of your goals and tasks (titles, areas, dates, progress), so Claude can work out what you mean. Clicking around the app doesn't send anything anywhere.
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
| Double-clicking the icon does nothing, or an error box appears | Look in `C:\Users\<you>\LifeControlCenter\data\app.log` for details, or double-click `start.bat` in that folder to see the app's messages as it starts. |

---

## For later phases: how the project is organized

```
LifeControlCenter/
├── INSTALL.bat              ← one-time Windows setup (runs scripts/install.ps1)
├── launcher.pyw             ← what the Desktop icon runs: updates, then starts the app in its own window
├── updater.py               ← downloads the newest version from GitHub (keeps data/ and .env)
├── start.bat / start.sh     ← starts the app with a visible log window (handy for troubleshooting)
├── requirements.txt         ← Python packages the app needs
├── .env.example             ← template for your settings (copy to .env)
├── data/                    ← your database lives here (not uploaded to GitHub)
├── backend/                 ← Python (FastAPI) server
│   ├── main.py              ← starts the web server and loads every module
│   ├── config.py            ← reads .env
│   ├── database.py          ← SQLite helpers; each module registers its own tables
│   ├── areas.py             ← the 4 life areas and their colors
│   └── modules/
│       ├── __init__.py      ← the list of backend modules
│       ├── goals/           ← Phase 1: goals, tasks, notes, dashboard, examples
│       └── assistant/       ← command bar: Claude prompt, JSON schema, apply + undo
└── frontend/                ← what you see in the browser (plain HTML/CSS/JS, no build step)
    ├── index.html, styles.css
    └── js/
        ├── app.js           ← sidebar, page navigation, command bar
        ├── modules.js       ← the list of sidebar modules ("Coming soon" ones too)
        ├── components.js    ← goal cards, task rows, edit dialogs
        └── views/           ← one file per page
```

**Adding a new module later (e.g. Calendar):**
1. Backend: create `backend/modules/calendar/` with a `router` (its API endpoints) and optional `on_startup`, then add it to the `MODULES` list in `backend/modules/__init__.py`.
2. Frontend: add `frontend/js/views/calendar.js` with a `render(view)` function, then in `frontend/js/modules.js` import it and replace `comingSoon: true` with `view: calendar`.
3. To let the command bar control it: add new action types to the schema and prompt in `backend/modules/assistant/claude_client.py`, and handle them in `actions.py`.

**How the command bar works under the hood:** the backend sends Claude your sentence, today's date and a compact list of your goals and tasks with their ID numbers. The request uses *structured outputs*, which forces Claude's reply to be JSON matching a fixed schema (`intent`, `reply`, `actions`). The backend checks every action and applies them all together in one step: if any action is invalid, nothing changes. Before changing anything it saves the old version of each item, which is what **Undo** puts back.

The model is set by `CLAUDE_MODEL` in `.env` (default `claude-opus-5`). With the default model, the request also turns on Anthropic's automatic *fallback*: if a safety check declines a request, Anthropic retries it on another Claude model instead of returning an error.
