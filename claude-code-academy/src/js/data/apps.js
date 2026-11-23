/* Claude apps track: Claude chat (claude.ai, desktop, mobile) and Cowork.
   Based on claude.com, claude.com/pricing and the Claude Help Center as of
   November 2026. Plans and features change often: link-outs say so.     */
window.CCA = window.CCA || {};
CCA.APPS = [
  // ================================================================ CHAT
  {
    id: 'chat-start', group: 'Claude chat', icon: '💬', title: 'Getting started with Claude chat', mins: 10,
    body: `
**Claude chat** is Claude in a conversation: on the web at **claude.ai**, in the **Claude desktop app** (Windows, macOS, Linux beta) and in the **mobile apps**. It's where most people start, and it's far more than Q&A: it can search the web, read your files, create documents and spreadsheets, run code, use your connected apps, and hand bigger jobs to **Cowork**.

## Plans (check claude.com/pricing for current details)
| Plan | Who it's for | Highlights |
|---|---|---|
| **Free** | Trying Claude | Chat, web search, files & code, memory, connectors, artifacts, skills, voice; limited usage; up to 5 projects |
| **Pro** | Individuals | More usage, Opus models, Research, unlimited projects, Claude Code, Cowork, Claude in Chrome & Microsoft 365 |
| **Max** | Heavy users | 5× Pro usage, early features, priority at peak times, API credits |
| **Ultra** | Power users | 10× Pro weekly usage, no 5-hour limit for verified accounts, API credits |
| **Team** | 2–150 people | Shared projects, central billing, SSO, admin controls; Claude Code & Cowork |
| **Enterprise** | Organizations | RBAC, SCIM, audit logs, Compliance API, custom retention, HIPAA-ready option |
Usage limits reset on a rolling basis; Cowork tasks and Research use more than quick chats.

## The interface in 60 seconds
- **Message box**: type, attach files with **+** or drag-and-drop, paste screenshots, or use **voice**.
- **Model picker**: choose the model (Opus for hard work, Sonnet/Haiku for speed) and whether Claude should think longer.
- **Tools / +**: turn on web search, Research, connectors, and start Cowork for bigger tasks.
- **Sidebar**: chats, **Projects**, artifacts, scheduled tasks.

## Prompting in chat: what actually works
1. **Give context**: who you are, what it's for, who will read it.
2. **Show, don't describe**: paste an example of the style or format you want.
3. **Attach the source**: upload the PDF/spreadsheet instead of summarizing it yourself.
4. **Ask for a plan first** for big tasks, then approve it.
5. **Iterate**: "shorter", "more formal", "turn this into a table". Edit your message to branch instead of piling on corrections.
6. **Ask it to check itself**: "List any assumptions you made" / "What's missing?"

> [!TIP] The same prompting skills from the Lessons tab apply here. Chat is a great place to practise them.
`,
    check: [
      { q: 'You want Claude to write in your company\'s house style. Most effective approach in chat?', options: ['Say "use our house style"', 'Attach or paste a real example of the style and ask Claude to match it', 'Use a bigger model', 'Turn on voice mode'], a: 1, why: 'Concrete examples beat descriptions; better still, store them in a Project.' },
    ],
  },
  {
    id: 'projects', group: 'Claude chat', icon: '📂', title: 'Projects: store context once, reuse it always', mins: 10, domain: 'D5',
    body: `
A **Project** ([[claude-project]]) is a workspace with its own **knowledge** (uploaded files) and **instructions**. Every chat inside the project starts with that context, so you never re-upload the same documents or repeat yourself. It's the chat app's version of CLAUDE.md.

## Set one up
1. Sidebar → **Projects → New project**. Name it ("Claude Architect study", "Shop app docs", "Job search").
2. **Instructions**: how Claude should behave in this project. Example:
\`\`\`text
I'm studying for the Claude Certified Architect exam. Explain like I'm new to
coding, use small examples, and end each answer with one practice question.
Point out which exam domain (D1–D5) a topic belongs to.
\`\`\`
3. **Knowledge**: upload the files Claude should know: notes, PDFs, style guides, specs, transcripts.
4. Start chats inside the project.

## How large knowledge works
When a project's knowledge grows large, Claude **retrieves** the relevant parts for each question instead of reading everything every time (retrieval-augmented generation, [[rag]]). Keep files clean and well named so the right parts are found.

## Ideas that work well
| Project | Knowledge | Instructions |
|---|---|---|
| Exam study | Exam guide notes, your mistakes list | Tutor style, quiz at the end |
| Writing | Your best past pieces, style guide | Match voice, flag clichés |
| Codebase Q&A | README, architecture docs, API spec | Cite file names, say when unsure |
| Personal admin | Budget, plans, preferences | Be concise, give options |

## Projects vs other context tools
| Tool | Scope | Use for |
|---|---|---|
| **Project instructions + knowledge** | One project | Topic- or team-specific context |
| **Memory** | All your chats | Lasting facts about you and your preferences |
| **Styles / preferences** | All your chats | How Claude writes for you |
| **CLAUDE.md** | A code repository | Claude Code's project context |

On **Team/Enterprise**, projects can be **shared** with colleagues, which is perfect for team knowledge bases. Cowork can also group tasks into projects with their own files, instructions and memory.
`,
    check: [
      { q: 'You keep re-uploading the same three style-guide PDFs to new chats. Better approach?', options: ['Paste them into every message', 'Create a Project with the PDFs as knowledge and your rules as instructions', 'Use incognito chats', 'Switch to Haiku'], a: 1, why: 'Projects store reusable context so every chat in them starts informed.' },
    ],
  },
  {
    id: 'artifacts', group: 'Claude chat', icon: '🧩', title: 'Artifacts, files & code execution', mins: 10,
    body: `
## Artifacts
When Claude makes something substantial (a document, a web page, an interactive app, a diagram, code), it appears as an **artifact** in a panel beside the chat. You can iterate on it ("make the buttons orange"), view versions, copy or download it, and **share** or **publish** it. Interactive artifacts can be small apps: calculators, quizzes, dashboards.

## Creating real files
Claude can **create and edit files**: Word documents, PDFs, Excel spreadsheets with working formulas, PowerPoint decks, CSVs, images and charts. Ask for the format explicitly:
\`\`\`text
Turn this table of expenses into an Excel file with a monthly summary sheet,
SUM formulas, and a bar chart of spending by category.
\`\`\`

## Code execution: analysis for everyone
Claude runs code in a secure sandbox to **analyse data**, make charts, convert files and check its maths. Upload a CSV and ask: *"What are the three biggest trends? Show a chart."* You don't need to know Python; Claude writes and runs it.

## Uploading files
Attach PDFs, documents, spreadsheets, images, code and more with **+** or drag-and-drop. Claude reads text and images (screenshots, photos of whiteboards, charts). For big recurring material, use a **Project** instead.

> [!TIP] Ask for **"a downloadable file"** when you want a real .docx/.xlsx/.pptx, and **"an interactive artifact"** when you want something to click.
`,
    check: [
      { q: 'You need a spreadsheet with working SUM formulas from data in a chat. What do you ask for?', options: ['A screenshot of a table', 'An Excel file with formulas (file creation)', 'A poem about spreadsheets', 'A Project'], a: 1, why: 'Claude can create real .xlsx files with working formulas when you ask for the file.' },
    ],
  },
  {
    id: 'memory', group: 'Claude chat', icon: '🧠', title: 'Memory, chat search & incognito', mins: 8, domain: 'D5',
    body: `
## Memory
With **memory** on, Claude remembers useful context from your conversations (your role, ongoing projects, preferences) and uses it in new chats, so you repeat yourself less. You can view and edit what it remembers in **Settings**, ask it to forget things, or turn memory off. Projects keep their own separate memory, so work and personal topics don't mix.

## Searching past chats
Claude can also **search and reference earlier conversations** when relevant: *"What did we decide about the database schema last week?"*

## Incognito chats
Start an **incognito chat** for a conversation that shouldn't be saved to history or memory. Good for one-off sensitive questions or testing prompts without influencing memory.

## Habits that keep memory useful
- Tell Claude explicitly: *"Remember that I prefer British spelling and short answers."*
- Review memory occasionally and remove outdated facts.
- Use **Projects** for topic-specific context and **memory** for facts about *you*.
- Don't store secrets (passwords, card numbers) in chats or memory.

> [!NOTE] Exact memory controls differ by plan and settings. See the Help Center's memory article for current details.
`,
    check: [
      { q: 'You want to try a sensitive prompt without it being saved or remembered. What do you use?', options: ['A Project', 'An incognito chat', 'Research mode', 'A connector'], a: 1, why: 'Incognito chats aren\'t saved to history or used for memory.' },
    ],
  },
  {
    id: 'research', group: 'Claude chat', icon: '🔎', title: 'Web search & Research', mins: 8,
    body: `
## Web search
Turn on **web search** for current information (news, prices, docs, recent releases). Claude searches, reads sources and answers with **citations** you can click. Check them for anything important.

## Research (Pro and above)
**Research** is a deeper, multi-step investigation: Claude plans the research, runs many searches, reads sources (and, if connected, your own documents and apps), and returns a structured report with citations. It takes minutes, not seconds, and uses more of your plan's capacity.

## Which one when?
| Need | Use |
|---|---|
| A quick fact or recent news | Web search |
| A comparison or overview from many sources | Research |
| Reasoning over things you already gave it | Neither: just ask (with extended thinking for hard problems) |
| Your company's docs/email | Connectors (+ Research) |

## Good research prompts
\`\`\`text
Research the main options for hosting a small Python web app in 2026
(free tiers, pricing above that, ease of setup, cold starts). Compare in a
table and recommend one for a beginner. Cite sources and note anything
that may be out of date.
\`\`\`
`,
    check: [
      { q: 'You need a cited comparison of five tools from many sources. Which feature fits best?', options: ['Incognito chat', 'Research', 'Voice mode', 'Styles'], a: 1, why: 'Research runs a multi-step investigation and returns a cited report.' },
    ],
  },
  {
    id: 'connectors', group: 'Claude chat', icon: '🔌', title: 'Connectors, skills & extensions', mins: 10, domain: 'D2',
    body: `
## Connectors: your apps inside Claude
**Connectors** give Claude secure access to your tools: Google Drive, Gmail, Calendar, Slack, Notion, GitHub, Microsoft 365 and many more. Under the hood they're **MCP servers** ([[mcp]]).
1. **Settings → Connectors** (or the **+** menu in the message box) → pick a connector → sign in.
2. Ask: *"Find the latest budget spreadsheet in Drive and summarize changes since last month."*
3. Remote **custom connectors**: add any remote MCP server by URL (where your plan or admin allows).
Claude asks before taking actions such as sending or editing, and you can set per-tool permissions.

## Skills in the apps
**Skills** ([[skill]]) are packaged know-how (instructions + scripts) that Claude loads when relevant: built-in ones for documents, spreadsheets and presentations, plus **your own**. Create a custom skill for your house style, a reporting template or a process, upload it in Settings, and Claude uses it automatically when the task matches. The same skill format works in Claude Code and the API.

## Plugins
**Plugins** bundle skills, connectors and sub-agents for a role or workflow (sales, legal, finance, engineering). Teams can share them from a catalog.

## Desktop app extras
- **Desktop extensions**: one-click local MCP servers (files, local apps).
- The desktop app is needed for Cowork's **local file access, browser and computer use**.

## Claude in other places
- **Claude in Chrome** (Pro+): Claude works in your browser tabs: reads pages, fills forms, clicks through tasks.
- **Claude for Microsoft 365 / Excel / PowerPoint** and **Google Docs, Sheets, Slides** integrations.
- **Claude in Slack**: ask Claude in channels and threads.

> [!WARN] Every connector is a door. Connect only what you need, review permission prompts, and remember that content from emails and web pages can contain instructions aimed at Claude ([[prompt-injection]]).
`,
    check: [
      { q: 'What technology are Claude connectors built on?', options: ['Email forwarding', 'MCP (Model Context Protocol) servers', 'Screen scraping', 'Browser cookies'], a: 1, why: 'Connectors are MCP servers, the same protocol you learned in Connect & Automate.' },
    ],
  },
  {
    id: 'chat-pro', group: 'Claude chat', icon: '⭐', title: 'Power tips for daily chat use', mins: 8,
    body: `
## Ten habits of power users
1. **One Project per ongoing area** of your life or work, with real files as knowledge.
2. **Start big tasks with "plan first"**, approve, then execute.
3. **Upload, don't paraphrase**: give Claude the original document, screenshot or data.
4. **Branch by editing** your earlier message instead of arguing in follow-ups.
5. **Ask for structure**: tables, checklists, "TL;DR first".
6. **Use extended thinking** for hard reasoning (maths, strategy, tricky code); quick mode for simple things.
7. **Make reusable things into skills** (templates, processes) and **artifacts** (tools you'll use again).
8. **Connect the apps you live in** (Drive, Gmail, Calendar) so Claude can fetch context itself.
9. **Hand off long work to Cowork** and keep chatting while it runs; check in from your phone.
10. **Verify** anything consequential: citations, numbers, legal and medical claims.

## Useful prompt starters
\`\`\`text
Interview me with 5 questions before you start.
Give me 3 options with trade-offs, then recommend one.
Rewrite this for a 10-year-old / a CFO / a developer.
What would an expert critic say about this? Then fix those issues.
Turn our conversation into a checklist I can reuse.
\`\`\`

## Sharing & collaboration
Share artifacts and chat snapshots via links; on Team/Enterprise, share Projects with colleagues so everyone gets the same context.
`,
    check: [
      { q: 'Claude went in the wrong direction three messages ago. Fastest fix?', options: ['Keep correcting in new messages', 'Edit your earlier message to branch the conversation', 'Start a new account', 'Switch models repeatedly'], a: 1, why: 'Editing creates a clean branch without the wrong turn in context.' },
    ],
  },

  // ============================================================== COWORK
  {
    id: 'cowork-what', group: 'Cowork', icon: '🤝', title: 'What Cowork is (and isn\'t)', mins: 10,
    body: `
**Cowork** ([[cowork]]) is Claude doing **multi-step knowledge work for you**: researching, organizing files, building spreadsheets and decks, drafting documents. It uses the same agentic approach as Claude Code (plan → act with tools → check → report), **without a terminal or code**.

## Chat and Cowork are now one Claude
Anthropic has been merging Cowork into the main Claude experience. Every conversation starts as chat; when a task needs files and tools, Claude brings in Cowork's capabilities. Depending on your rollout you either pick **Cowork** in the message box or simply describe a bigger task.

## Where it runs
- Cowork sessions run **in the cloud**, in an isolated environment that is removed when the session ends and can't reach your home or company network.
- Start tasks from **claude.ai, the desktop app or your phone**; they keep running even if you close the app, and you can check in from another device.
- The **desktop app** (Windows, macOS, Linux beta) is needed for **local folders, the browser and computer use**; keep it open for tasks that use them.
- Available on **paid plans** (Pro, Max, Ultra, Team, Enterprise).

## What it's good at
| Task | Example |
|---|---|
| File organization | "Sort my Downloads into folders by type and date" |
| Spreadsheets | "Build a budget workbook from these receipts with working formulas" |
| Documents & decks | "Turn these meeting notes into a 6-slide PowerPoint" |
| Research | "Compare 5 project-management tools and write a recommendation" |
| Recurring work | "Every Monday, summarize last week's sales files" |

## Cowork vs chat vs Claude Code
| | Chat | Cowork | Claude Code |
|---|---|---|---|
| For | Questions, drafting, thinking | Multi-step knowledge work with files & apps | Software development |
| Acts on files | Uploads & created files | Your chosen folders, connected apps, browser | Your code repository |
| Runs | While you chat | In the cloud, in the background | Terminal, IDE, desktop, web |
| You need | Nothing | A paid plan (desktop app for local files) | A paid plan or API |

> [!TIP] Rule of thumb: if you'd normally open several apps and spend an hour clicking, it's a Cowork task. If it's code, it's Claude Code.
`,
    check: [
      { q: 'You need Cowork to reorganize files in a folder on your laptop. What do you need?', options: ['Nothing, the web is enough', 'The Claude desktop app with that folder connected (and open while the task uses it)', 'Claude Code', 'An API key'], a: 1, why: 'Cloud sessions can\'t reach your computer; the desktop app provides local folder access.' },
    ],
  },
  {
    id: 'cowork-start', group: 'Cowork', icon: '▶️', title: 'Your first Cowork task, step by step', mins: 12,
    body: `
## 1. Open Claude and choose Cowork
In the desktop app (or claude.ai), select **Cowork** in the message box, or just describe a task that needs files and tools.

## 2. Give it access to just what it needs
- **Connect a folder** (desktop): pick a **dedicated working folder**, not your whole home directory.
- Turn on any **connectors** the task needs (Drive, Gmail, Microsoft 365…).
- Optional: **folder instructions** and **global instructions** (Settings → Cowork) give standing context, like CLAUDE.md for your files.

## 3. Choose a permission mode
| Mode | Behaviour | Use for |
|---|---|---|
| **Manual** | Asks before actions | Sensitive files, new tools, first tries |
| **Auto** | Runs, but an automatic check stops risky actions | Routine tasks you trust |
| **Skip** | Nothing checks actions automatically (except connector tools set to "Always ask") | Only low-risk, well-understood tasks |
**Deleting files always asks** for your explicit "Allow".

## 4. Describe the outcome, not the clicks
\`\`\`text
In my "Receipts 2026" folder, read every PDF and photo, extract date,
vendor, amount and category, and build an Excel workbook with one row
per receipt, a monthly summary sheet with SUM formulas, and a chart.
Ask me before deleting anything.
\`\`\`

## 5. Review the plan, then let it run
Cowork proposes a **plan**: approve or adjust it. It splits big jobs into parallel sub-tasks, shows progress, and asks for permission when your mode requires it. You can **steer mid-task** ("skip the photos, PDFs only") or leave and check in later from your phone.

## 6. Check the results
Open the files it created (Excel workbooks keep working formulas; Markdown drafts can be edited in place). Spot-check numbers against the originals before you rely on them.

## 7. Make it recurring (optional)
Type **\`/schedule\`** in a task or use the **Scheduled** sidebar: *"Every Monday at 9 am, add new receipts to the workbook."* Scheduled tasks run in the cloud; no device needed (unless they use local folders).
`,
    check: [
      { q: 'You\'re trying Cowork on your tax documents for the first time. Which permission mode?', options: ['Skip', 'Manual', 'Auto with no review', 'It doesn\'t matter'], a: 1, why: 'Use Manual for sensitive files and first runs; you approve each action.' },
      { q: 'How do you make a Cowork task repeat every week?', options: ['Copy-paste it every week', 'Use /schedule in the task or the Scheduled sidebar', 'Pin the chat', 'Create a Project'], a: 1, why: 'Scheduled tasks run on a recurring schedule in the cloud.' },
    ],
  },
  {
    id: 'cowork-power', group: 'Cowork', icon: '🚀', title: 'Cowork power features', mins: 10,
    body: `
## Browser & computer use
- Cowork can **browse the web** with a built-in browser in the desktop app, or use **Claude in Chrome** if you already have it (choose in Settings → Cowork).
- **Computer use** (research preview) lets Claude operate desktop apps on your screen, asking permission **per application**. There's no sandbox between Claude and what's on your screen, so close sensitive apps first.

## Connectors, skills, plugins, sub-agents
- **Connectors** bring in your apps' data and actions; set each tool to Always allow / Needs approval / Always ask / Blocked.
- **Skills** teach Cowork your formats and processes (house report style, invoice workflow).
- **Plugins** bundle skills, connectors and sub-agents for a role.
- **Sub-agents** split large jobs into parallel workstreams automatically.

## Projects & memory
Group related tasks into **projects** with their own files, instructions and memory. Cloud sessions start from your chat memory (you can turn memory off for a task before the first message).

## Scheduled tasks
Recurring work on autopilot: weekly reports, folder tidying, monitoring a website for changes, compiling news on a topic. Start simple, avoid sensitive data and consequential actions, and **review each run**.

## Teams & enterprises
Admins control availability, connectors and plugins; Team/Enterprise can stream activity to their security tools (OpenTelemetry) and use the Compliance API for web and mobile sessions.

## Usage
Multi-step tasks use your plan's limits **faster than chat**. Batch related work into one well-described task rather than many tiny ones.
`,
    check: [
      { q: 'Before using Cowork\'s computer use, what is the most important precaution?', options: ['Increase screen brightness', 'Close or block sensitive apps (banking, health portals), since there is no sandbox between Claude and your screen', 'Use Skip mode', 'Disable memory'], a: 1, why: 'Computer use sees and controls what\'s on screen; limit exposure first.' },
    ],
  },
  {
    id: 'cowork-safety', group: 'Cowork', icon: '🛡️', title: 'Using Cowork safely', mins: 8, domain: 'D5',
    body: `
Anthropic's guidance boils down to: **limit what Claude can reach, and stay in the loop for anything hard to undo.** You remain responsible for actions Claude takes on your behalf.

## The main risk: prompt injection
Cowork reads content you didn't write (web pages, emails, shared documents). That content can hide instructions. An attack needs **both** untrusted input **and** the ability to act, so reduce each ([[prompt-injection]]).

## Checklist
- [ ] Use a **dedicated working folder**; keep **backups** of anything important.
- [ ] Avoid giving access to sensitive files (financial documents, credentials, IDs) unless the task needs them.
- [ ] Use **Manual** approval for sensitive accounts, new tools, and anything hard to undo: sending messages, purchases, deletions.
- [ ] Only install **trusted** connectors, plugins and MCP servers (local MCP servers run with your computer's permissions).
- [ ] For **computer use**, close or block sensitive apps.
- [ ] For **scheduled tasks**, start simple, skip sensitive data and consequential actions, and review each run.
- [ ] Spot-check outputs (numbers, names, dates) before sending them to anyone.

> [!EXAM] The same principles the Architect exam tests for agents you *build* (least privilege, human approval for consequential actions, distrust of external content) apply to agents you *use*.
`,
    check: [
      { q: 'A Cowork task will read customer emails and can send replies. What reduces prompt-injection risk most?', options: ['Using Skip mode for speed', 'Requiring manual approval before sending, and limiting the connectors and folders it can use', 'A longer task description', 'Turning off memory'], a: 1, why: 'Limit what it can do and keep a human approving consequential actions.' },
    ],
  },
  {
    id: 'which-tool', group: 'Choosing', icon: '🧭', title: 'Which Claude for which job?', mins: 6,
    body: `
| You want to… | Use |
|---|---|
| Ask, brainstorm, draft, learn | **Claude chat** |
| Keep context for a topic or team | **Projects** (chat) |
| Get a cited deep-dive | **Research** (chat) |
| Have Claude *do* multi-step work with files, apps, browser | **Cowork** |
| Automate your own recurring knowledge work | **Cowork scheduled tasks** |
| Write, fix and ship code | **Claude Code** (terminal, IDE, desktop, web) |
| Let Claude act in GitHub issues & PRs | **Claude Code GitHub Action** |
| Act inside your browser tabs | **Claude in Chrome** |
| Build Claude into your own product | **Claude API** (Messages API / Agent SDK) |
| Run agents for others without servers | **Claude Managed Agents** |

## A typical week, combining them
- **Monday**: a Cowork scheduled task compiles last week's numbers into a spreadsheet.
- **Tuesday**: you discuss the results in a chat inside your "Business" Project.
- **Wednesday**: Claude Code builds a small dashboard; @claude reviews the PR on GitHub.
- **Thursday**: a Research report compares vendors for your next step.
- **Friday**: a Managed Agents deployment (built by your team) sends customers their weekly summary.
`,
    check: [
      { q: 'You want Claude to build and test a small web dashboard in your repository. Which product?', options: ['Cowork', 'Claude Code', 'Claude chat Research', 'Claude in Chrome'], a: 1, why: 'Software development belongs in Claude Code; Cowork is for non-coding knowledge work.' },
    ],
  },
];
