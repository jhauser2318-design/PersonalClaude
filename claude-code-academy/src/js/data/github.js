/* GitHub & Claude track: git basics through GitHub Actions, the GitHub MCP
   server, Claude Code on the web, security, portfolio, trainings & reads.
   Claude-specific commands checked against code.claude.com docs and the
   github/github-mcp-server install guide (November 2026).                */
window.CCA = window.CCA || {};
CCA.GITHUB = [
  // ============================================================ FOUNDATIONS
  {
    id: 'why', group: 'Foundations', icon: '🐙', title: 'Git, GitHub & why builders need them', mins: 10, domain: 'D3',
    body: `
**Git** is a program on your computer that records snapshots of your project. **GitHub** is a website that hosts git projects online so you can back them up, collaborate, review changes and run automation. Git is the *tool*; GitHub is the *place*.

## Why this matters even more when you build with Claude
- **Safety net.** Claude can change many files quickly. With git you can always see exactly what changed (\`git diff\`) and undo it. Claude Code's checkpoints are handy, but git is your real, permanent history.
- **Review.** Pull requests let you (or a teammate, or another Claude) review changes before they reach your main code.
- **Automation.** GitHub Actions runs tests on every change, and Claude can run *inside* GitHub to review PRs or fix issues when you write \`@claude\`.
- **Cloud sessions.** Claude Code on the web works from your GitHub repositories and hands back branches and pull requests.
- **Context.** Commit history, issues and PRs are a goldmine of "why was this built this way?" that Claude can read.

## The vocabulary (learn these 14 words)
| Word | Meaning |
|---|---|
| **Repository (repo)** | A project folder tracked by git ([[repo]]) |
| **Commit** | A saved snapshot with a message ([[commit]]) |
| **Branch** | A parallel line of work ([[branch]]) |
| **main** | The default branch: the "official" version |
| **Merge** | Combine one branch into another |
| **Remote / origin** | The copy of the repo on GitHub |
| **Clone** | Download a repo from GitHub to your computer |
| **Push / Pull** | Upload your commits / download others' commits |
| **Pull request (PR)** | A proposal to merge a branch, with review & discussion ([[pull-request]]) |
| **Issue** | A tracked task, bug or idea ([[gh-issue]]) |
| **Fork** | Your own copy of someone else's repo |
| **.gitignore** | A list of files git should never track (secrets, build output) |
| **README.md** | The front page of a repo |
| **Actions** | GitHub's automation that runs on events ([[github-actions-ci]]) |

## How the pieces fit
\`\`\`text
 your computer                                   github.com
┌─────────────────────────────────────┐        ┌─────────────────────────────┐
│ working folder ─git add─▶ staging   │        │  origin (remote repo)       │
│        ▲                     │      │ push ▶ │   branches, PRs, issues,    │
│        │                 git commit │        │   Actions, Releases         │
│        └──── git switch ──── local  │ ◀ pull │                             │
│                              history│        │                             │
└─────────────────────────────────────┘        └─────────────────────────────┘
\`\`\`

> [!TIP] The fastest way to *feel* git is the **Git Playground** in this section: type commands and watch the commit graph change.
`,
    check: [
      { q: 'What is the difference between git and GitHub?', options: ['They are the same thing', 'Git tracks versions on your computer; GitHub hosts git repositories online with collaboration and automation', 'GitHub runs on your computer; git is a website', 'Git is only for Python'], a: 1, why: 'Git is the version-control tool; GitHub is a hosting and collaboration platform built around it.' },
    ],
  },
  {
    id: 'setup', group: 'Foundations', icon: '⚙️', title: 'Set up Git & GitHub (Windows-friendly)', mins: 12,
    body: `
## 1. Create a GitHub account
Go to **github.com → Sign up**. Turn on **two-factor authentication** (Settings → Password and authentication). It's required for many features and protects your code.

## 2. Install the tools
\`\`\`powershell
winget install --id Git.Git -e            # Git for Windows (also gives Claude Code its bash)
winget install --id GitHub.cli -e         # the GitHub CLI: gh
\`\`\`
macOS: \`brew install git gh\`. Optional: **GitHub Desktop** (a friendly app) and **VS Code** (great git integration).

## 3. Tell git who you are (once per computer)
\`\`\`bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
\`\`\`
> [!TIP] Use GitHub's private "noreply" email (Settings → Emails) if you don't want your real email visible in public commits.

## 4. Sign in from the terminal (the easy way)
\`\`\`bash
gh auth login
\`\`\`
Choose **GitHub.com → HTTPS → Login with a web browser**. This also sets git up to push and pull without passwords. Check with \`gh auth status\`.

The alternatives: **SSH keys** (\`ssh-keygen -t ed25519\`, then add the public key in GitHub → Settings → SSH keys), or **personal access tokens** for tools and scripts (prefer **fine-grained** tokens limited to specific repos and permissions) ([[pat]]).

## 5. Your first repo, two ways
**Start on GitHub, then clone:**
\`\`\`bash
gh repo create my-first-app --private --clone --add-readme
cd my-first-app
\`\`\`
**Start from a folder you already have:**
\`\`\`bash
cd my-project
git init
git add .
git commit -m "First commit"
gh repo create my-project --private --source=. --push
\`\`\`

## 6. Connect Claude
- **Claude Code** already uses git and \`gh\` when they're installed. Run \`gh auth status\` once so Claude can open PRs and read issues.
- **GitHub Actions + @claude**: run \`/install-github-app\` inside Claude Code (next chapters).
- **Claude Code on the web**: connect GitHub when you first open claude.ai/code, or run \`/web-setup\` in your terminal to share your \`gh\` login.

> [!WARN] Never paste tokens into chat, code or commits. If a token ever lands in a public repo, **revoke it immediately** on GitHub; deleting the commit is not enough.
`,
    check: [
      { q: 'What does `gh auth login` give you beyond the gh tool itself?', options: ['Nothing else', 'It also sets up git so you can push and pull to GitHub without typing passwords', 'It installs Python', 'It creates a repository'], a: 1, why: 'gh can configure git\'s credentials over HTTPS during login, so pushes just work.' },
    ],
  },
  {
    id: 'daily', group: 'Foundations', icon: '🔁', title: 'The everyday git workflow', mins: 15, domain: 'D3',
    body: `
## The loop you'll do 1000 times
\`\`\`bash
git status                      # what changed?
git diff                        # show the exact line changes
git add src/cart.js             # stage one file   (git add . = everything)
git commit -m "Clamp discounts to 0-100%"
git push                        # send to GitHub
git pull                        # get teammates' changes
\`\`\`

## The three places your changes live
| Place | What it is | Move it with |
|---|---|---|
| **Working folder** | Files as you edit them | (just edit) |
| **Staging area** | Changes picked for the next commit | \`git add\` / \`git restore --staged\` |
| **History** | Saved commits | \`git commit\` |

## Good commit messages
- Short summary in the imperative: *"Fix cart crash when items is missing"*, not *"fixed stuff"*.
- One logical change per commit. Small commits are easy to review and to undo.
- Optional convention: [Conventional Commits](https://www.conventionalcommits.org/) (\`feat:\`, \`fix:\`, \`docs:\`), which works well with automated changelogs.
- Claude Code writes excellent messages from the actual diff: *"commit this with a good message"*.

## Seeing history
\`\`\`bash
git log --oneline --graph --all   # compact visual history
git show 4f2a9c1                  # one commit in detail
git blame src/cart.js             # who last changed each line, and in which commit
\`\`\`
Ask Claude: *"Look at the git history of src/cart.js and explain why the discount logic changed."* It will read \`git log\` and \`git blame\` for you.

## Undo cheat sheet ([[git-undo]])
| I want to… | Command |
|---|---|
| Throw away edits to a file | \`git restore src/cart.js\` |
| Unstage a file (keep the edits) | \`git restore --staged src/cart.js\` |
| Fix the last commit's message / add a forgotten file | \`git commit --amend\` (only if not pushed yet) |
| Undo a commit that's already pushed | \`git revert <commit>\` (makes a new "undo" commit: safe for shared branches) |
| Move back and keep the changes | \`git reset --soft HEAD~1\` |
| Recover "lost" commits | \`git reflog\` |

> [!WARN] Avoid \`git reset --hard\` and \`git push --force\` on shared branches: they rewrite history others may have. Claude Code asks before running commands like these; read the prompt carefully.

## .gitignore: keep junk and secrets out
\`\`\`text
node_modules/
.venv/
__pycache__/
dist/
.env
.claude/settings.local.json
\`\`\`
GitHub has ready-made templates per language when you create a repo.
`,
    check: [
      { q: 'You pushed a commit that broke something; teammates already pulled it. Safest undo?', options: ['git reset --hard and force push', 'git revert <commit> and push', 'Delete the repository', 'Edit the file and pretend'], a: 1, why: 'revert adds a new commit that undoes the change without rewriting shared history.' },
      { q: 'What does `git add` do?', options: ['Uploads to GitHub', 'Moves changes into the staging area for the next commit', 'Creates a branch', 'Deletes files'], a: 1, why: 'add stages changes; commit saves the staged snapshot; push uploads it.' },
    ],
  },
  {
    id: 'branches', group: 'Foundations', icon: '🌿', title: 'Branches, pull requests & merging', mins: 15, domain: 'D3',
    body: `
## GitHub flow: the standard way to work
1. \`main\` is always working and deployable.
2. For any change, create a **branch**: \`git switch -c fix/cart-discount\`.
3. Commit on the branch; push it: \`git push -u origin fix/cart-discount\`.
4. Open a **pull request** (PR): \`gh pr create\` or the GitHub website.
5. Automated checks run (tests, lint, Claude review); people review.
6. **Merge** the PR into main, delete the branch.

## Anatomy of a pull request
- **Title & description**: what and *why*, how to test, screenshots. Link issues with **"Fixes #38"** so the issue closes when the PR merges.
- **Files changed**: the diff; reviewers comment on specific lines.
- **Checks**: CI results (✅/❌). Branch rules can require them to pass.
- **Reviews**: Comment / Approve / Request changes.
- **Draft PRs**: work in progress, not ready for review.

## Merge options
| Option | Result | Use when |
|---|---|---|
| **Merge commit** | Keeps every commit + a merge commit | You want the full history |
| **Squash and merge** | All PR commits become one | Most teams: clean main history |
| **Rebase and merge** | Replays commits on top of main, no merge commit | Linear history fans |

## Merge conflicts, demystified ([[merge-conflict]])
A conflict happens when two branches changed **the same lines**. Git marks the spot:
\`\`\`text
<<<<<<< HEAD
const MAX_DISCOUNT = 100;
=======
const MAX_DISCOUNT = 90;
>>>>>>> feature/sale
\`\`\`
Choose (or combine) the right version, delete the markers, then \`git add\` + \`git commit\`. Or ask Claude: *"Resolve the merge conflicts in src/cart.js, keeping the sale feature but capping discounts at 100%. Explain each decision."* Always review its resolution and run the tests.

## Protect main ([[branch-protection]])
Repo **Settings → Rules → Rulesets** (or Branches → branch protection): require a PR, require approvals, require status checks to pass, block force pushes. A \`CODEOWNERS\` file auto-requests reviews from the right people. This matters more when AI writes code: nothing reaches main without checks and review.

## Parallel branches with Claude: worktrees
Run several Claude sessions at once, each on its own branch in its own folder:
\`\`\`bash
claude --worktree feature-auth      # isolated checkout + branch, Claude starts in it
claude --worktree fix-cart          # in a second terminal: another parallel session
\`\`\`
([[worktree]]) The repo needs at least one commit first. Plain git equivalent: \`git worktree add ../shop-feature -b feature\`.
`,
    check: [
      { q: 'Your PR description says "Fixes #38". What happens when the PR is merged into the default branch?', options: ['Nothing', 'Issue #38 is closed automatically and linked to the PR', 'Issue #38 is deleted', 'A new issue is created'], a: 1, why: 'Closing keywords (fixes/closes/resolves) link and auto-close issues on merge.' },
      { q: 'Best way to make sure AI-written code never lands on main without tests passing?', options: ['Trust the AI', 'Branch protection/rulesets requiring PRs and passing status checks', 'Only work on weekends', 'Turn off CI'], a: 1, why: 'Rules enforce the process for everyone, humans and Claude alike.' },
    ],
  },
  {
    id: 'issues', group: 'Foundations', icon: '📋', title: 'Issues, Projects & planning your work', mins: 10,
    body: `
## Issues: the to-do list of a repo
- Title + description (steps to reproduce, expected vs actual, screenshots).
- **Labels** (\`bug\`, \`enhancement\`, \`good first issue\`), **assignees**, **milestones**.
- **Sub-issues** break big work into smaller pieces; mention others with \`@username\`, reference with \`#38\`.
- **Issue templates** (\`.github/ISSUE_TEMPLATE/\`) ask reporters for the right info.

## Projects: boards and roadmaps
**GitHub Projects** turns issues and PRs into a kanban board, table or roadmap with custom fields (status, priority, size, sprint). Great for planning a personal app.

## Discussions
Q&A and ideas that aren't tasks yet. Turn on in repo Settings.

## Issues are great Claude prompts
A well-written issue is a well-written prompt. Claude can:
- **Read and fix**: *"Read issue #38 with gh, find the bug, fix it and open a PR that closes it."*
- **Triage**: *"List open issues, group them by area, and suggest labels and priorities."*
- **Write issues**: *"Turn these meeting notes into GitHub issues with clear acceptance criteria."*
- **Work from GitHub itself**: comment \`@claude please fix this\` on an issue (with the GitHub Action installed).

\`\`\`bash
gh issue list --label bug
gh issue view 38 --comments
gh issue create --title "Cart crashes on empty body" --body "Steps: …" --label bug
\`\`\`
`,
    check: [
      { q: 'Why do issue templates help when Claude works on issues?', options: ['They make issues longer', 'They collect steps, expected behaviour and context up front, which makes issues clear, actionable prompts', 'They are required by law', 'They hide the issue'], a: 1, why: 'Structured issues give Claude (and humans) the context needed to act correctly.' },
    ],
  },

  // ======================================================== CLAUDE + GITHUB
  {
    id: 'claude-git', group: 'Claude + GitHub', icon: '🤝', title: 'Claude Code as your git partner', mins: 14, domain: 'D3',
    body: `
Claude Code runs \`git\` and \`gh\` through its Bash tool, so you can drive version control in plain English.

## Things to ask
| Ask | Claude does |
|---|---|
| "What changed since yesterday?" | \`git log\`, \`git diff\`, summarizes |
| "Commit this with a good message" | reads the diff, writes a clear message, commits |
| "Create a branch for this fix" | \`git switch -c fix/...\` |
| "Push and open a PR that closes #38" | \`git push -u\`, \`gh pr create\` with a description |
| "Resolve the merge conflicts" | edits the conflicted files, explains choices, runs tests |
| "Why was this function written this way?" | \`git log -p\` / \`git blame\` research |
| "Review my branch before I open a PR" | diff vs main + review (\`/review\`, \`/security-review\`) |
| "Address the review comments on PR 44" | \`gh pr view 44 --comments\`, fixes, pushes |
| "Why did CI fail?" | \`gh run view --log-failed\`, diagnoses, fixes |

## A complete session
\`\`\`text
> Read issue #38 with gh. Create a branch, fix it, add a regression test,
  run the tests, commit, push, and open a PR that closes the issue.
\`\`\`
You'll approve each command (or pre-approve safe ones). Read the diff and the PR description before merging.

## Set the rules once
**In CLAUDE.md** (team conventions, committed):
\`\`\`md
## Git
- Branch names: feat/..., fix/..., chore/...
- Conventional Commit messages (feat:, fix:, docs:)
- Never commit directly to main; always open a PR
- Run npm test before every commit
\`\`\`
**In .claude/settings.json** (permissions, enforced):
\`\`\`json
{
  "permissions": {
    "allow": ["Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(gh pr view:*)", "Bash(gh issue view:*)"],
    "ask":   ["Bash(git push:*)", "Bash(gh pr create:*)", "Bash(gh pr merge:*)"],
    "deny":  ["Bash(git push --force:*)", "Bash(git reset --hard:*)"]
  }
}
\`\`\`
Read-only commands flow freely; anything that publishes asks; destructive ones are blocked.

## Commits vs checkpoints
Checkpoints (\`/rewind\`) undo Claude's file edits within a session. **Commits** are permanent, shareable history. Commit at every working state, and let Claude do it.

## Handy session features
- \`claude --from-pr 1234\` picks up the session that worked on PR 1234.
- \`git log --oneline -20 | claude -p "summarize these recent commits"\` for quick reports.
- \`claude --worktree <name>\` for parallel sessions on separate branches.
`,
    check: [
      { q: 'You want Claude to run git status/diff freely, ask before pushing, and never force-push. Where do you configure this?', options: ['Only in CLAUDE.md', 'Permission rules (allow/ask/deny) in .claude/settings.json', 'In the README', 'In .gitignore'], a: 1, why: 'Permission rules are enforced by Claude Code; CLAUDE.md is guidance.' },
    ],
  },
  {
    id: 'gh-cli', group: 'Claude + GitHub', icon: '⌨️', title: 'The GitHub CLI (gh): Claude\'s bridge to GitHub', mins: 12,
    body: `
\`gh\` ([[gh-cli]]) brings GitHub to your terminal, which means **Claude Code can use it too**. It's the simplest way for Claude to read issues, open PRs and check CI.

## Repos
\`\`\`bash
gh repo create my-app --private --clone      # new repo
gh repo clone owner/repo                     # download
gh repo view --web                           # open in the browser
gh repo fork owner/repo --clone              # contribute to open source
\`\`\`
## Issues
\`\`\`bash
gh issue list --assignee @me
gh issue view 38 --comments
gh issue create --title "..." --body "..." --label bug
gh issue comment 38 --body "Fixed in #44"
gh issue close 38
\`\`\`
## Pull requests
\`\`\`bash
gh pr create --fill                 # title/body from your commits
gh pr create --draft --title "WIP: discounts"
gh pr list
gh pr checkout 44                   # check out someone's PR locally
gh pr diff 44
gh pr checks 44                     # CI status
gh pr review 44 --approve           # or --request-changes --body "..."
gh pr merge 44 --squash --delete-branch
\`\`\`
## Actions / CI
\`\`\`bash
gh run list
gh run watch                        # live progress of the latest run
gh run view 9182 --log-failed       # only the failing steps' logs
gh workflow run nightly.yml         # trigger a workflow manually
\`\`\`
## Anything else: the API
\`\`\`bash
gh api repos/{owner}/{repo}/releases --jq '.[].tag_name'
\`\`\`

## Power combo: gh + Claude
\`\`\`bash
gh run view --log-failed | claude -p "Why did CI fail? Suggest the smallest fix."
gh pr diff 44 | claude -p "Review this diff for bugs and missing tests"
\`\`\`

## gh vs the GitHub MCP server
| | \`gh\` CLI | GitHub MCP server |
|---|---|---|
| Setup | install + \`gh auth login\` | \`claude mcp add\` + token or OAuth |
| Works in | Claude Code (via Bash), scripts, CI | any MCP host: Claude Code, Claude Desktop, claude.ai |
| Feels like | commands you can also run yourself | dedicated tools (\`create_pull_request\`, \`issue_read\`…) |
| Best for | developers in a terminal | chat apps & non-terminal workflows |
Many developers simply use \`gh\` in Claude Code and the MCP server in Claude Desktop.
`,
    check: [
      { q: 'Fastest way to have Claude explain a failing CI run from your terminal?', options: ['Screenshot the GitHub page', 'gh run view --log-failed | claude -p "why did CI fail?"', 'Email GitHub support', 'Re-run CI until it passes'], a: 1, why: 'gh fetches only the failing logs; piping them into claude -p gives a focused diagnosis.' },
    ],
  },
  {
    id: 'gh-mcp', group: 'Claude + GitHub', icon: '🔌', title: 'The GitHub MCP server', mins: 10, domain: 'D2',
    body: `
GitHub's official MCP server ([[github-mcp]]) gives any MCP host tools for repos, issues, pull requests, Actions, code security and more.

## Remote server (hosted by GitHub): recommended
Create a **fine-grained personal access token** (GitHub → Settings → Developer settings) limited to the repos you need, then:
\`\`\`bash
# Claude Code 2.1.1+ (from GitHub's install guide)
claude mcp add-json github '{"type":"http","url":"https://api.githubcopilot.com/mcp","headers":{"Authorization":"Bearer YOUR_GITHUB_PAT"}}'

# Older Claude Code, or if add-json says "Invalid input"
claude mcp add --transport http github https://api.githubcopilot.com/mcp -H "Authorization: Bearer YOUR_GITHUB_PAT"

claude mcp list            # verify
\`\`\`
Use \`--scope user\` to have it in every project. For a shared \`.mcp.json\`, use \`\${GITHUB_PAT}\`-style env expansion instead of a literal token, and keep \`.env\` git-ignored.

## Local server (Docker)
\`\`\`bash
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=YOUR_GITHUB_PAT -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
\`\`\`

## Toolsets: give Claude only what it needs
The server groups tools into **toolsets**: \`repos\`, \`issues\`, \`pull_requests\`, \`actions\`, \`code_security\`, \`dependabot\`, \`discussions\`, \`projects\`, \`notifications\`, \`users\` and more. The default is a small core set (context, repos, issues, pull_requests, users). Choose with \`--toolsets\` / \`GITHUB_TOOLSETS\`, and add **\`--read-only\`** (\`GITHUB_READ_ONLY=1\`) when Claude should only look, never change ([[least-privilege]]).

## Claude Desktop & claude.ai
Add GitHub from **Settings → Connectors** in claude.ai / Claude Desktop, or put the same server in \`claude_desktop_config.json\`. Then ask in chat: *"Summarize what changed in my shop-app repo this week and list open bugs."*

> [!NOTE] The old npm package \`@modelcontextprotocol/server-github\` is deprecated. Use GitHub's official server.

> [!WARN] Issue and PR text is written by other people. A malicious comment can contain instructions aimed at Claude ([[prompt-injection]]). Prefer read-only mode for exploration, and keep write actions behind approval.
`,
    check: [
      { q: 'You only want Claude Desktop to read your repos and issues, never modify them. What do you configure?', options: ['A stronger system prompt', 'The GitHub MCP server in read-only mode with a fine-grained token limited to those repos', 'Admin access for safety', 'The deprecated npm server'], a: 1, why: 'Read-only mode and narrowly scoped tokens enforce least privilege.' },
    ],
  },
  {
    id: 'actions-claude', group: 'Claude + GitHub', icon: '🤖', title: '@claude in GitHub: the Claude Code Action', mins: 18, domain: 'D3',
    body: `
The **Claude Code GitHub Action** ([[github-actions]]) runs Claude Code inside GitHub's servers: mention **@claude** in an issue or PR and it answers, reviews or implements a fix and opens a PR. Or run it automatically on events and schedules.

## Quick setup (recommended)
Inside Claude Code, in your repo:
\`\`\`text
/install-github-app
\`\`\`
It walks you through: installing the **Claude GitHub App** on the repo, choosing workflows (the @claude responder and/or automatic PR review), picking a credential, then it **opens a PR** adding the workflow files. Merge that PR and you're live.

Requirements: a github.com repo, **admin** access to it, and the GitHub CLI signed in (\`gh auth login\`).

## Credentials: two options
| Secret name | What it is | Notes |
|---|---|---|
| \`ANTHROPIC_API_KEY\` | A Console API key | Billed per token. Best for organizations |
| \`CLAUDE_CODE_OAUTH_TOKEN\` | From \`claude setup-token\` | Uses your Claude subscription (Pro/Max/Team…). Tied to the person who created it |

## The @claude workflow (from the official docs)
\`\`\`yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
\`\`\`
Then, on any issue or PR: *"@claude this crashes when the cart is empty. Please fix it and add a test."* Claude replies in the thread, pushes a branch and links a PR.

## Two modes
- **Interactive** (no \`prompt\`): responds to \`@claude\` in comments, review comments, or new issues. Change the word with \`trigger_phrase\`.
- **Automation** (with \`prompt\`): runs on any event or a schedule (cron), e.g. a nightly report or automatic review of every PR.

## Main inputs
| Input | Purpose |
|---|---|
| \`prompt\` | Instructions (or a skill/slash command) for automation mode |
| \`claude_args\` | CLI flags: \`--max-turns 5\`, \`--model …\`, \`--allowedTools "…"\`, \`--mcp-config …\` |
| \`anthropic_api_key\` / \`claude_code_oauth_token\` | Credentials (from repo secrets) |
| \`trigger_phrase\` | Default \`@claude\` |
| \`plugins\`, \`plugin_marketplaces\`, \`settings\` | Install plugins / pass settings |
| \`use_bedrock\`, \`use_vertex\`, \`use_foundry\` | Use a cloud provider instead |

## Automatic PR review
The setup can also add a review workflow that runs on \`pull_request\` events and posts findings as comments (it skips drafts and PRs it already reviewed). Review-only workflows need just **read** permissions plus \`id-token: write\`.

## Make it good
- **CLAUDE.md** in the repo root is read on every run: put coding standards and review criteria there (keep it concise).
- Limit cost and runaway runs: \`--max-turns\`, workflow \`timeout-minutes\`, and \`concurrency\` groups. You pay for **Actions minutes** plus **API tokens** (or subscription usage).
- Only users with **write access** can trigger it by default; bots are rejected unless allowed.
- **Review Claude's PRs** like any other contributor's. Keep branch protection on.
- Commits pushed with the default \`GITHUB_TOKEN\` don't trigger other workflows; that's expected.

## Upgrading old workflows
From \`@beta\`: switch to \`@v1\`, remove \`mode\`, rename \`direct_prompt\` → \`prompt\`, and move \`max_turns\` / \`model\` into \`claude_args\`.
`,
    check: [
      { q: 'You want @claude to use your Claude Max subscription rather than API billing. What do you store as a repo secret?', options: ['Your GitHub password', 'The token from `claude setup-token` as CLAUDE_CODE_OAUTH_TOKEN', 'Your claude.ai cookie', 'Nothing'], a: 1, why: 'claude setup-token creates a subscription token, referenced with claude_code_oauth_token.' },
      { q: 'A workflow has a `prompt:` and runs on a nightly cron. Which mode is that?', options: ['Interactive mode', 'Automation mode', 'Plan mode', 'Bypass mode'], a: 1, why: 'With a prompt the action runs in automation mode on any trigger, including schedules.' },
    ],
  },
  {
    id: 'cloud', group: 'Claude + GitHub', icon: '☁️', title: 'Claude Code on the web & your repos', mins: 10,
    body: `
**Claude Code on the web** (claude.ai/code, also in the desktop & mobile apps) runs Claude Code in an Anthropic cloud sandbox on a copy of your GitHub repo. Start several tasks in parallel, even from your phone, then review the resulting branches and PRs.

## Connect GitHub (two ways)
- **Claude GitHub App**: authorize it during onboarding; works for public repos and private repos where the app is installed. Needed for **Auto-fix**.
- **\`/web-setup\`** in your terminal: shares your local \`gh\` login with your Claude account; works for any repo your token can access.

## How a cloud task flows
1. Pick a repo and branch, describe the task.
2. The repo is cloned into an isolated VM. Your GitHub credentials stay on Anthropic's side, behind a proxy, never inside the VM.
3. Claude works, commits and **pushes a branch**; the **Changes** card shows the diff; create a PR from it.
4. **Auto-fix** (from the Changes card ⋮ menu, or \`/autofix-pr\` in the terminal) lets Claude respond to failing CI and review comments on the PR.

## Move work between terminal and cloud
\`\`\`bash
claude --cloud "Fix the authentication bug in src/auth/login.ts"   # start a cloud task from the terminal
claude --teleport                                                  # pull a cloud session into your terminal (picker)
claude --teleport <session-id>
\`\`\`
- \`--cloud\` clones your repo's **GitHub remote at the current branch**, not your local uncommitted files, so **push first**.
- Teleport needs a clean git state, the same repo checked out, the branch pushed, and the same claude.ai account. Inside a session: \`/teleport\` (or \`/tp\`).

> [!NOTE] Cloud sessions need a Claude plan with Claude Code (Pro, Max, Team or Enterprise seats), and some compliance setups (e.g. zero data retention) can't use them. See the docs page in Resources.
`,
    check: [
      { q: 'You run `claude --cloud "fix the bug"` but the cloud session doesn\'t see your latest changes. Why?', options: ['The cloud is slow', 'It clones the GitHub remote at your current branch, so unpushed local commits and edits aren\'t included', 'Cloud sessions can\'t read code', 'You need plan mode'], a: 1, why: 'Push your branch first; --cloud starts from what\'s on GitHub.' },
    ],
  },

  // ============================================================== SHIP IT
  {
    id: 'ci', group: 'Ship & automate', icon: '🔄', title: 'GitHub Actions CI basics', mins: 15, domain: 'D3',
    body: `
**GitHub Actions** ([[github-actions-ci]]) runs automation in GitHub's cloud when something happens: a push, a PR, a schedule, a button click.

## Anatomy of a workflow
Files live in \`.github/workflows/*.yml\`:
\`\`\`yaml
name: Tests                       # shown in the Actions tab
on:                               # WHEN it runs
  push:
    branches: [main]
  pull_request:
jobs:
  test:                           # a job runs on a fresh virtual machine
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4          # "uses" = a ready-made action
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt   # "run" = a shell command
      - run: pytest
\`\`\`
| Concept | Meaning |
|---|---|
| **Trigger** (\`on\`) | push, pull_request, schedule (cron), workflow_dispatch (manual button), issue_comment… |
| **Job** | A set of steps on one runner; jobs run in parallel unless \`needs:\` links them |
| **Step** | \`uses:\` an action, or \`run:\` a command |
| **Runner** | The VM: ubuntu-latest, windows-latest, macos-latest |
| **Secrets** | Encrypted values (Settings → Secrets and variables → Actions), used as \`\${{ secrets.NAME }}\` |
| **Artifacts** | Files a run produces (e.g. a built installer) that you can download |
| **Matrix** | Run the same job across versions/OSes |

> [!TIP] This repo already has two real examples: \`.github/workflows/tests.yml\` (runs your Life Control Center tests) and \`academy-windows.yml\` (builds this app's Windows installer and uploads it as an artifact). Open them and ask Claude to explain every line.

## Status checks + branch protection = quality gate
Make the "Tests" check **required** in a ruleset, and PRs can't merge until it passes, whether a human or Claude wrote them.

## When CI fails
1. Open the run (Actions tab, or \`gh run list\` / \`gh run view --log-failed\`).
2. Read the **first** error, not the last line.
3. Ask Claude: \`gh run view --log-failed | claude -p "why did this fail?"\`, or let **Auto-fix** handle it on cloud PRs.
4. Reproduce locally (run the same command), fix, push; CI re-runs automatically.

## Let Claude write workflows
*"Create a GitHub Actions workflow that runs npm test and lint on every PR, caches node_modules, and uploads coverage as an artifact."* Then review: triggers, permissions (\`permissions:\` as small as possible) and secrets.
`,
    check: [
      { q: 'Where should an API key used by a workflow be stored?', options: ['In the YAML file', 'In GitHub Actions secrets, referenced as ${{ secrets.NAME }}', 'In README.md', 'In a commit message'], a: 1, why: 'Secrets are encrypted and masked in logs; never put keys in files.' },
    ],
  },
  {
    id: 'repo-ready', group: 'Ship & automate', icon: '🏗️', title: 'A Claude-ready repository (checklist)', mins: 10, domain: 'D3',
    body: `
The better your repo is organized, the better Claude (and humans) work in it.

## The checklist
- [ ] **README.md**: what it is, how to install, run and test.
- [ ] **CLAUDE.md**: commands, architecture map, conventions, gotchas ([[claude-md]]).
- [ ] **.gitignore**: build output, dependencies, \`.env\`, \`.claude/settings.local.json\`.
- [ ] **Tests** that run with one command, so Claude can verify its own work.
- [ ] **CI** running those tests on every PR, required by a ruleset.
- [ ] **.claude/** committed: \`settings.json\` (permissions), \`commands/\`, \`agents/\`, \`skills/\`.
- [ ] **.mcp.json** for team MCP servers (secrets via env vars).
- [ ] **Issue & PR templates** in \`.github/\`.
- [ ] **CONTRIBUTING.md**: branch naming, commit style, review rules.
- [ ] **LICENSE** (for public repos).
- [ ] **Dependabot** and **secret scanning** turned on.
- [ ] The **Claude Code Action** installed if you want @claude in issues and PRs.

## A suggested layout
\`\`\`text
my-app/
├── README.md  CLAUDE.md  CONTRIBUTING.md  LICENSE  .gitignore
├── .mcp.json
├── .claude/      settings.json  commands/  agents/  skills/
├── .github/
│   ├── workflows/    tests.yml  claude.yml
│   ├── ISSUE_TEMPLATE/bug_report.md
│   ├── pull_request_template.md
│   └── dependabot.yml
├── src/
└── tests/
\`\`\`

## PR template example (.github/pull_request_template.md)
\`\`\`md
## What & why
## How to test
## Screenshots (UI changes)
## Checklist
- [ ] Tests added/updated
- [ ] CLAUDE.md updated if conventions changed
\`\`\`

> [!TIP] Ask Claude Code: *"Audit this repo against a Claude-ready checklist and open a PR adding whatever is missing."*
`,
    check: [
      { q: 'Which single file most directly improves how well Claude Code works in a repo every session?', options: ['LICENSE', 'CLAUDE.md', '.gitattributes', 'A logo'], a: 1, why: 'CLAUDE.md is loaded into every session with commands, conventions and gotchas.' },
    ],
  },
  {
    id: 'security', group: 'Ship & automate', icon: '🔐', title: 'GitHub security for AI-assisted projects', mins: 12, domain: 'D5',
    body: `
## Secrets
- Never commit keys. Use \`.env\` (git-ignored) locally and **Actions secrets** in CI.
- Turn on **secret scanning** and **push protection** (Settings → Code security): GitHub blocks pushes containing known token formats.
- If a secret leaks: **revoke/rotate it first**, then clean up history. Assume it's compromised.

## Dependencies
- **Dependabot alerts**: known vulnerabilities in your packages.
- **Dependabot updates** (\`.github/dependabot.yml\`): automatic PRs to update packages. Let CI (and optionally a Claude review) check them.

## Code scanning
**CodeQL** code scanning finds security bugs on every PR. Claude Code's \`/security-review\` is a great *extra* pass before you push.

## Access
- 2FA on, always.
- **Fine-grained tokens** with only the repos and permissions needed, and an expiry date ([[pat]]).
- Give the Claude GitHub App and MCP servers access only to the repos they need.
- Protect \`main\` with rulesets: PRs + required checks + reviews.

## AI-specific risks
- **Prompt injection via GitHub content**: issue bodies, PR comments, README files and even code comments can contain instructions aimed at an AI. Treat them as data. By default the Claude action only responds to users with **write access**.
- **Review AI pull requests** like any contributor's: run the tests, read the diff, check for new dependencies and permission changes.
- **Least privilege in workflows**: set \`permissions:\` explicitly and minimally; read-only for review-only jobs.
- Be careful with workflows triggered by **pull requests from forks**: they shouldn't get your secrets or write tokens.
`,
    check: [
      { q: 'An API key was accidentally pushed to a public repo. First action?', options: ['Delete the commit and hope', 'Revoke/rotate the key immediately, then clean up the history', 'Make the repo private and do nothing else', 'Rename the file'], a: 1, why: 'Bots scan public repos within minutes; rotation is the only real fix.' },
    ],
  },
  {
    id: 'portfolio', group: 'Ship & automate', icon: '🌟', title: 'Releases, Pages, portfolio & open source', mins: 10,
    body: `
## Releases & versions
- **Tags** mark versions: \`git tag v1.2.0 && git push --tags\`.
- **Releases** add notes and downloadable files: \`gh release create v1.2.0 --generate-notes ./dist/*.exe\`.
- **Semantic versioning**: MAJOR.MINOR.PATCH (breaking.feature.fix).
- Ask Claude: *"Write release notes for everything since v1.1.0, grouped by feature/fix, for non-technical users."* (or use a release-notes skill).

## GitHub Pages: free website hosting
Settings → Pages → deploy from a branch (or an Actions workflow). Perfect for a portfolio, docs or a static app at \`yourname.github.io\`.

## Your developer portfolio
- A **profile README**: create a repo named exactly like your username with a README.md; it shows on your profile.
- **Pin** your best repos; give each a clear README with screenshots and a "built with Claude Code" section explaining your CLAUDE.md, agents and workflow, since employers increasingly value AI-native skills.
- Keep a steady contribution graph by committing small, often.

## Contributing to open source
1. Find a repo and an issue labelled \`good first issue\`.
2. \`gh repo fork owner/repo --clone\`, create a branch, make the change.
3. Follow CONTRIBUTING.md, run their tests, open a PR from your fork.
4. Claude can help you understand an unfamiliar codebase fast: *"Explain this repo's architecture and how I'd implement issue #123."* Write the PR yourself and disclose AI help where the project asks for it.

## Free stuff for learners
The **GitHub Student Developer Pack** (education.github.com) bundles free tools and credits for verified students.
`,
    check: [
      { q: 'You fixed bugs without breaking anything in v1.4.0. What\'s the next semantic version?', options: ['v2.0.0', 'v1.5.0', 'v1.4.1', 'v1.4.0-final'], a: 2, why: 'Bug fixes bump PATCH; new features bump MINOR; breaking changes bump MAJOR.' },
    ],
  },

  // ============================================================== LEARN MORE
  {
    id: 'learn', group: 'Trainings & reads', icon: '📚', title: 'Trainings, certifications & must-reads', mins: 8,
    body: `
## Hands-on trainings (free)
| Course | Why |
|---|---|
| [GitHub Skills](https://skills.github.com/) | Interactive courses that run *inside* a GitHub repo, e.g. Introduction to GitHub, Communicate using Markdown, GitHub Pages, Review pull requests, Resolve merge conflicts, Hello GitHub Actions |
| [Learn Git Branching](https://learngitbranching.js.org/) | Visual, game-like git exercises: the best way to understand branches and rebasing |
| [GitHub Docs: Get started](https://docs.github.com/en/get-started) | Official beginner path |
| [Pro Git book](https://git-scm.com/book/en/v2) | The free, complete git book |
| [Claude Academy](https://anthropic.skilljar.com/) | "Claude Code in Action" covers git and GitHub workflows with Claude |
| [freeCodeCamp: Git & GitHub](https://www.freecodecamp.org/news/tag/git/) | Long-form tutorials and videos |

## GitHub certifications
GitHub offers certifications such as **GitHub Foundations** (start here), **GitHub Actions**, **GitHub Advanced Security**, **GitHub Administration** and **GitHub Copilot**, with free prep paths on Microsoft Learn. Details and current list: [GitHub certifications](https://resources.github.com/learn/certifications/). **GitHub Foundations** pairs well with the Claude Architect exam: it proves you know repos, PRs, Actions and collaboration.

## Must-reads for building with Claude + GitHub
- [Claude Code GitHub Actions docs](https://code.claude.com/docs/en/github-actions): setup, modes, inputs, examples
- [claude-code-action repository](https://github.com/anthropics/claude-code-action): examples folder with ready workflows
- [Common workflows (Claude Code)](https://code.claude.com/docs/en/common-workflows): PRs, worktrees, git history research
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web): cloud sessions, teleport, Auto-fix
- [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices): includes git & GitHub workflows from Anthropic's team
- [GitHub MCP server](https://github.com/github/github-mcp-server): install guides for Claude
- [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow): the branch → PR → merge model
- [About pull requests](https://docs.github.com/en/pull-requests): reviews, merging, conflicts
- [GitHub Actions docs](https://docs.github.com/en/actions): workflows, secrets, runners
- [Conventional Commits](https://www.conventionalcommits.org/): a commit message standard
- [Oh Shit, Git!?!](https://ohshitgit.com/): plain-English fixes for common git mistakes
- [GitHub Git cheat sheet (PDF)](https://education.github.com/git-cheat-sheet-education.pdf)

## Suggested 3-week GitHub path
1. **Week 1:** this section's Foundations chapters + the Git Playground challenges + GitHub Skills "Introduction to GitHub".
2. **Week 2:** put a real project on GitHub, protect main, add CI, practice PRs with Claude (Simulator: "GitHub flow with Claude").
3. **Week 3:** install the Claude Code Action, try @claude on an issue, add Dependabot; consider GitHub Foundations.
`,
    check: [
      { q: 'Which GitHub certification is the natural starting point?', options: ['GitHub Administration', 'GitHub Foundations', 'GitHub Advanced Security', 'GitHub Copilot'], a: 1, why: 'Foundations covers the core concepts the others build on.' },
    ],
  },
];
