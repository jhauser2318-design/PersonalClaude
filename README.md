# Life Control Center

A personal dashboard that runs on your own computer and opens in your web browser.

**Phase 1 (this version): Goals & Tasks.**

- Four life areas, each with its own color: **Work**, **Health**, **Social**, **Education**.
- **Goals** with a status, a progress %, an optional target date, and a timestamped history of updates.
- **Tasks**: small action steps with a priority and an optional due date. A task can belong to a goal.
- **Dashboard**: progress for each area, what's due today and this week, overdue items, and recent updates.
- **Live command bar**: type normal sentences and Claude (Anthropic's AI) makes the changes for you. Every change can be undone.

The sidebar already has spots for **Calendar, Finances, Email and Follow-ups**. They say "Coming soon" and will be built in later phases.

---

## Setup, step by step (Windows)

You only do steps 1–3 once.

### Step 1: Install Python

Python is the programming language the app's "backend" (the part that runs behind the scenes) is written in.

1. Go to **https://www.python.org/downloads/** and click the big yellow **Download Python 3.x** button.
2. Open the downloaded file.
3. ⚠️ **Important:** on the first screen, tick the box **"Add python.exe to PATH"** at the bottom. Then click **Install Now**.
4. When it says "Setup was successful", click **Close**.

**Check that it worked.** Press the **Windows key**, type `powershell`, and press **Enter**. In the blue or black window that opens, type the following and press **Enter**:

```
py --version
```

You should see something like `Python 3.13.1`. Any version from **3.10** upward is fine.

> **Mac:** install from the same website (or run `brew install python`), then use `python3 --version` to check.

### Step 2: Download this project

- **Easiest:** on this project's GitHub page, click the green **Code** button, then **Download ZIP**. Right-click the downloaded ZIP, choose **Extract All…**, and pick a place you'll remember, such as `Documents\LifeControlCenter`.
- **If you use Git:** `git clone <this repository's URL>`

### Step 3: Get an Anthropic API key and put it in a `.env` file

The command bar uses Claude through Anthropic's API. An **API key** is like a password that lets the app use your Anthropic account.

1. Go to **https://console.anthropic.com** and sign up or log in.
2. Open **Billing** (under Settings) and add a small amount of credit. The API is pay-as-you-go, and each command-bar sentence is one small request.
3. Open **API Keys** and click **Create Key**. Give it a name such as `life-control-center`.
4. **Copy the key right away.** It starts with `sk-ant-` and is shown only once.

Now put the key where the app can find it:

1. Open the project folder in File Explorer.
2. Find the file **`.env.example`**. Make a copy of it, and rename the copy to exactly **`.env`** (a dot, then `env`, with nothing before or after).
   - Tip: if you can't see file endings, click **View → Show → File name extensions** in File Explorer.
   - Windows may warn about changing the file name extension. Click **Yes**.
   - Or skip this: `start.bat` (step 4) creates the `.env` file for you the first time you run it.
3. Right-click **`.env`** → **Open with** → **Notepad**.
4. Replace `sk-ant-your-key-goes-here` with your real key, so the line looks like:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-abc123...
   ```
   No quotes and no spaces. Save the file (**Ctrl+S**).

> 🔒 **Your key stays private.** The `.env` file is listed in `.gitignore`, so Git will never upload it to GitHub. The key is used only by the backend on your computer, and your browser never sees it. Never paste your key into `.env.example`, into chat messages, or anywhere public.

### Step 4: Start the app

**Double-click `start.bat`** in the project folder.

- The first time, it spends a minute or two setting up a private Python environment (a folder called `.venv`) and installing the packages the app needs. Later starts take a few seconds.
- If Windows shows **"Windows protected your PC"**, click **More info** → **Run anyway**. This appears because the file was downloaded from the internet.
- A black window stays open while the app runs. **Keep it open.** Closing it stops the app.

<details>
<summary>Prefer typing the commands yourself? (Windows PowerShell)</summary>

```powershell
cd $HOME\Documents\LifeControlCenter      # wherever you put the project
py -m venv .venv                           # one time only
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt            # one time only (and after updates)
python -m uvicorn backend.main:app --port 8000
```

If PowerShell says running scripts is disabled, run this once and try again:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
</details>

<details>
<summary>Mac / Linux</summary>

Open Terminal in the project folder and run `./start.sh`, then open the address below.
</details>

### Step 5: Open it in your browser

The browser should open automatically. If it doesn't, open Chrome, Edge, Firefox, or Safari and go to:

### 👉 http://localhost:8000

(`localhost` means "this computer". The app isn't on the internet, and no one else can see it.)

**To stop the app:** click the black window and press **Ctrl+C**, or just close the window.
**To start it again later:** double-click `start.bat` again.

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

- Everything is saved in one file on your computer: **`data/life.db`** (a SQLite database).
  **To back it up**, stop the app and copy that file somewhere safe.
- `data/*.db` is in `.gitignore`, so your personal data won't be uploaded to GitHub either.
- When you use the **command bar**, the backend sends Anthropic your sentence plus a short list of your goals and tasks (titles, areas, dates, progress), so Claude can work out what you mean. Clicking around the app doesn't send anything anywhere.
- You can check your API usage and spending at https://console.anthropic.com.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `'py' is not recognized` / `Python was not found` | Python isn't installed, or "Add to PATH" wasn't ticked. Re-run the Python installer, choose **Modify**, and make sure it's added to PATH. Then close and reopen PowerShell. |
| Yellow banner: *"The command bar needs an Anthropic API key"* | Check that the file is named exactly `.env` (not `.env.txt`), the key is on the `ANTHROPIC_API_KEY=` line, and then **restart the app**. |
| *"Anthropic rejected the API key"* | The key was mistyped or deleted. Create a new one in the Console and paste it again. |
| *"Too many requests… or your credit ran out"* | Wait a minute, or add credit under **Billing** in the Anthropic Console. |
| `address already in use` / port 8000 busy | The app is probably already running in another window. Close that window, or change `8000` to `8001` in `start.bat` and open http://localhost:8001. |
| The page says it can't reach the backend | The black window was closed. Start the app again. |

---

## For later phases: how the project is organized

```
LifeControlCenter/
├── start.bat / start.sh     ← double-click / run to start the app
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
