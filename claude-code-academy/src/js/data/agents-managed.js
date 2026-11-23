/* Agents track, part 1: Claude Managed Agents (hosted). Facts and code
   follow the Claude API skill reference for Managed Agents (beta header
   managed-agents-2026-04-01, Python SDK), November 2026.                 */
window.CCA = window.CCA || {};
CCA.AGENTS_MANAGED = [
  {
    id: 'ma-basics', group: 'Claude Managed Agents (hosted)', icon: '☁️', title: 'Managed Agents: the concepts', mins: 12, domain: 'D1',
    body: `
**Claude Managed Agents** ([[managed-agents]]) is Anthropic's hosted agent platform (beta). Anthropic runs the **agent loop**, and also runs a **container per session** where the agent's tools execute (bash, files, code). You define the agent once and start sessions against it. No loop code, no servers, no scheduler for you to maintain.

## The four building blocks
| Object | What it is | How often you create it |
|---|---|---|
| **Agent** | A saved, **versioned** config: model, system prompt, tools, MCP servers, skills | **Once.** Store its ID; update it to change behaviour |
| **Environment** | Where tools run: \`cloud\` (Anthropic's container, with network rules) or \`self_hosted\` (your infrastructure) | Once per setup |
| **Session** | One run of an agent in an environment, with its own workspace and history | **Every task** |
| **Events** | The stream of what happens: your messages in; the agent's messages, tool calls and status out | Continuously |

\`\`\`text
 setup (once)                         every run
 ┌────────┐   ┌─────────────┐         ┌─────────┐   send user.message   ┌──────────────┐
 │ Agent  │ + │ Environment │  ───▶   │ Session │ ─────────────────────▶ │ agent works  │
 │ v1, v2…│   │ cloud / self│         │ (sandbox│ ◀── stream events ──── │ in container │
 └────────┘   └─────────────┘         │  + log) │                        └──────────────┘
                                      └─────────┘
\`\`\`

## Why agents are versioned
Every change to an agent creates a **new immutable version**; a session pins the version it started with. You can improve the prompt without breaking running sessions, roll back a bad change, or compare versions side by side. So: **never create a new agent on every run**. Create once, then update it.

## What you get without writing it yourself
- The agent loop, context management and tool execution
- A sandboxed workspace per session (files, bash, code), with configurable network access
- Built-in toolset (bash, file operations, web search/fetch you can switch off), MCP servers, skills, custom tools
- Permission policies (always allow / always ask / auto) with pause-for-approval
- Session history you can inspect in the Console (transcript, tool stats, cost)
- Scheduling, memory, outcomes graded against a rubric, multi-agent work, dollar budgets (next chapters)

## Trade-offs to know up front
- **Beta**: APIs can change; the SDK sets the beta header (\`managed-agents-2026-04-01\`) for you.
- **Billing**: session runtime is billed **on top of tokens**.
- **Data**: session history is kept until you delete it. Not currently eligible for Zero Data Retention or HIPAA BAA coverage.
- **Platforms**: on the Claude API and some cloud platforms, not all of them (e.g. not Bedrock or Vertex AI).

> [!EXAM] The concepts map directly to Domain 1: who runs the loop, how tools are scoped and approved, how context and sessions are managed.
`,
    check: [
      { q: 'Your code calls agents.create() at the start of every user request. What\'s wrong?', options: ['Nothing', 'Agents are persistent, versioned configs: create once, store the ID, and only create sessions per run', 'You must also delete the agent each time', 'Agents can only be created in the Console'], a: 1, why: 'Re-creating agents piles up orphaned configs and loses versioning. Create once, update to change, sessions per run.' },
      { q: 'In Managed Agents, where do the agent\'s bash commands run in a "cloud" environment?', options: ['On your laptop', 'In a container Anthropic provisions for that session', 'In the user\'s browser', 'They can\'t run bash'], a: 1, why: 'Cloud environments give each session an Anthropic-hosted container for tool execution.' },
    ],
  },
  {
    id: 'ma-build', group: 'Claude Managed Agents (hosted)', icon: '🛠️', title: 'Build your first Managed Agent (Python)', mins: 16, domain: 'D1',
    body: `
\`pip install anthropic\` and set \`ANTHROPIC_API_KEY\`. The SDK adds the beta header automatically.

## 1. Setup (run once, save the IDs)
\`\`\`python
import anthropic

client = anthropic.Anthropic()

environment = client.beta.environments.create(
    name="my-dev-env",
    config={
        "type": "cloud",
        "networking": {"type": "limited", "allow_package_managers": True, "allow_mcp_servers": True},
    },
)

agent = client.beta.agents.create(
    name="Report Writer",
    model="claude-opus-5-5",
    system="You turn CSV files into short, clear reports for non-technical readers.",
    tools=[{
        "type": "agent_toolset_20260401",                       # bash, files, code, web...
        "default_config": {"enabled": True, "permission_policy": {"type": "auto"}},
        "configs": [
            {"name": "web_fetch", "enabled": False},           # off unless the job needs the web
            {"name": "web_search", "enabled": False},
        ],
    }],
)
print("ENVIRONMENT_ID =", environment.id)
print("AGENT_ID =", agent.id, "version", agent.version)
\`\`\`
> [!TIP] The recommended production setup keeps agents and environments as **version-controlled files** synced with Anthropic's \`ant\` CLI (\`ant apply\`), which records the IDs in \`claude-lock.json\`. Your app code then only creates sessions.

## 2. Every run: a session + a message + the event stream
\`\`\`python
session = client.beta.sessions.create(
    agent={"type": "agent", "id": AGENT_ID, "version": AGENT_VERSION},   # pin a version
    environment_id=ENVIRONMENT_ID,
    title="March sales report",
)

with client.beta.sessions.events.stream(session_id=session.id) as stream:
    client.beta.sessions.events.send(          # send while the stream is open
        session_id=session.id,
        events=[{"type": "user.message",
                 "content": [{"type": "text", "text": "Summarize sales.csv into a one-page report."}]}],
    )
    for event in stream:
        if event.type == "agent.message":
            for block in event.content:
                if block.type == "text":
                    print(block.text, end="", flush=True)
        elif event.type in ("agent.tool_use", "agent.mcp_tool_use") and event.evaluated_permission == "ask":
            client.beta.sessions.events.send(              # the agent paused for approval
                session_id=session.id,
                events=[{"type": "user.tool_confirmation", "tool_use_id": event.id,
                         "result": "allow" if approve(event) else "deny"}],   # you write approve()
            )
        elif event.type == "session.status_idle" and event.stop_reason.type != "requires_action":
            break                                           # finished (not waiting on you)
        elif event.type == "session.status_terminated":
            break
\`\`\`
Watch the run live in the Console's session viewer: transcript, tool calls and cost.

## 3. Give it your files or repo
Attach **resources** at session creation: uploaded files (Files API) or a GitHub repository mounted into the container:
\`\`\`python
resources=[{
    "type": "github_repository",
    "url": "https://github.com/owner/repo",
    "mount_path": "/workspace/repo",
    "authorization_token": os.environ["GITHUB_TOKEN"],
    "checkout": {"type": "branch", "name": "main"},
}]
\`\`\`

## 4. Your own tools (custom tools)
Add \`{"type": "custom", "name": "run_tests", "description": "...", "input_schema": {...}}\` to the agent's tools. When the agent calls it you receive an \`agent.custom_tool_use\` event, run it **in your own code**, and send back a \`user.custom_tool_result\`. This is how a hosted agent reaches systems only *you* can access.

## Permission policies
| Policy | Behaviour |
|---|---|
| \`always_allow\` | Runs without asking |
| \`always_ask\` | Pauses every time for \`user.tool_confirmation\` |
| \`auto\` | A server-side check runs safe calls, denies high-risk ones, and pauses when unsure |
When nobody is watching a run, answer pauses with **deny**, never blanket allow.

## Gotchas
- Messages **queue**: you can send events while the session runs.
- The stream has **no replay**. On reconnect, list past events and de-duplicate by ID, or a pending approval can deadlock the session.
- **Archive is permanent** (no unarchive). Only archive or delete when you mean it.
`,
    check: [
      { q: 'The agent paused on a tool call that needs approval and nobody is watching (a nightly run). Safest answer?', options: ['Allow everything so it finishes', 'Deny, and design the run so it doesn\'t need risky tools unattended', 'Restart the session', 'Archive the agent'], a: 1, why: 'Unattended runs should deny paused calls; never blanket-allow.' },
      { q: 'Your hosted agent must look up data in an internal database only reachable from your network. Simplest option?', options: ['Give the container your VPN password', 'Define a custom tool; your code runs the query when the agent calls it and returns the result', 'Use web_fetch', 'It is impossible'], a: 1, why: 'Custom tools execute in your code, so the agent can use systems only you can reach (or use a self-hosted sandbox).' },
    ],
  },
  {
    id: 'ma-power', group: 'Claude Managed Agents (hosted)', icon: '⚡', title: 'Power features: MCP, vaults, memory, outcomes, schedules', mins: 15, domain: 'D1',
    body: `
## MCP servers + vaults (credentials)
The agent declares MCP servers by URL **without secrets**; credentials live in a **vault** attached to the session:
\`\`\`python
agent = client.beta.agents.create(
    name="MCP Agent", model="claude-opus-5-5",
    mcp_servers=[{"type": "url", "name": "my-tools", "url": "https://my-mcp-server.example.com/mcp"}],
    tools=[{"type": "agent_toolset_20260401"}, {"type": "mcp_toolset", "mcp_server_name": "my-tools"}],
)
session = client.beta.sessions.create(agent=agent.id, environment_id=ENVIRONMENT_ID, vault_ids=[vault.id])
\`\`\`
Vaults hold OAuth credentials (auto-refreshed), bearer tokens, and **environment-variable credentials** for CLIs and APIs, which are substituted at the network edge so the sandbox only ever sees a placeholder.

## Memory stores: context that survives sessions
A **memory store** is persistent storage the agent reads and writes across sessions (mounted as files at \`/mnt/memory/<name>/\` in cloud environments). Use it for preferences, learned facts, running notes. It has **version history**, so you can audit, roll back or redact what was remembered. Attach stores as session resources.

## Outcomes: "keep going until it's right"
For a session whose job is **one deliverable** (a report, a dataset, a PR), start it with a \`user.define_outcome\` event plus a **rubric** (5–10 concrete criteria). A separate grader checks the work against the rubric and the agent iterates until it passes. For chat-style or ticket-processing work, use a plain \`user.message\`.

## Multi-agent work
Give an agent a roster of **subagents** (e.g. a cheaper worker model for reading-heavy tasks) and/or **workflows**, which let it run many agents in phases (hundreds of documents, many sources). Workflows use extra tokens: enable them for fan-out jobs, keep them off for simple agents.

## Scheduled deployments: agents on a timer
A **deployment** bundles agent + environment + resources + the starting message + a **cron schedule** with a timezone:
\`\`\`python
deployment = client.beta.deployments.create(
    name="Weekly compliance scan",
    agent=AGENT_ID, environment_id=ENVIRONMENT_ID,
    initial_events=[{"type": "user.message", "content": [{"type": "text", "text": "Run the weekly compliance scan."}]}],
    schedule={"type": "cron", "expression": "0 20 * * 5", "timezone": "America/New_York"},
)
\`\`\`
Each firing creates a session and a **deployment run** record. Pause/unpause (missed runs aren't backfilled), trigger manual runs, or archive (permanent).

## Budgets, webhooks, data residency
- **Session budgets**: a hard **dollar** cap on a session; it pauses at the limit until you raise or remove it. Deployments can have budgets too.
- **Webhooks**: get notified of session state changes instead of polling.
- **Inference geography**: pin where model inference runs for data-residency needs.

> [!TIP] Not every feature is needed. Start with agent + environment + session; add vaults when you connect services, memory when it should remember, outcomes when there's a deliverable, deployments when it runs on a schedule.
`,
    check: [
      { q: 'Where should the OAuth credential for an MCP server used by a Managed Agent be stored?', options: ['In the agent\'s system prompt', 'In a vault attached to the session (vault_ids)', 'In the mcp_servers URL', 'In a public GitHub repo'], a: 1, why: 'Agents declare servers without auth; credentials live in vaults and attach per session.' },
      { q: 'You need a weekly report agent that runs every Friday at 8 pm New York time with no server of your own. What do you use?', options: ['A cron job on your laptop', 'A scheduled deployment with a cron expression and timezone', 'A webhook', 'Plan mode'], a: 1, why: 'Deployments fire sessions on a cron schedule hosted by Anthropic.' },
    ],
  },
  {
    id: 'ma-selfsandbox', group: 'Claude Managed Agents (hosted)', icon: '🏢', title: 'The hybrid: self-hosted sandboxes', mins: 10, domain: 'D5',
    body: `
Sometimes you want Anthropic to run the agent loop but **your files, code execution and network access must stay inside your infrastructure** (a company VPC, sensitive data, internal systems). That's a Managed Agents environment with \`config: {"type": "self_hosted"}\`.

## How it works
\`\`\`text
 Anthropic (control plane)                          Your infrastructure
 ┌────────────────────────────┐   work queue   ┌─────────────────────────────┐
 │ agent loop, model,         │ ◀── long-poll ─│ your worker (EnvironmentWorker│
 │ session history, skills,   │ ── work item ─▶│ or ant beta:worker poll)      │
 │ memory stores              │ ◀─ tool results│ runs bash / files / code here │
 └────────────────────────────┘                └─────────────────────────────┘
          outbound-only: Anthropic never dials into your network
\`\`\`
1. Create the environment: \`client.beta.environments.create(name="self-hosted", config={"type": "self_hosted"})\`
2. Generate an **environment key** in the Console and store it as \`ANTHROPIC_ENVIRONMENT_KEY\` (in a secrets manager).
3. Run a **worker** in your infrastructure: the SDK's \`EnvironmentWorker\` (Python, TypeScript, Go) or \`ant beta:worker poll\`.
4. Sessions use \`environment_id\` exactly as with cloud.

## What changes vs cloud
| Concern | cloud | self_hosted |
|---|---|---|
| Container hardening & network egress | Anthropic | **You** |
| Mounting files / GitHub repos | Anthropic | You (pass pointers, fetch before dispatch) |
| Memory stores | Mounted for you | Supported via the SDK worker (synced copy) |
| Env-variable credentials in vaults | Supported | Not yet: use MCP credentials or a custom tool |
| web_search / web_fetch | Run on Anthropic's servers | Still run on Anthropic's servers (turn off or restrict) |

## What still leaves your network
Tool **inputs and outputs** flow to Anthropic's control plane so the model can see them; skills and memory contents are stored by Anthropic. Self-hosting moves *execution and the filesystem*, not the model's view of results.

## What you own
Container hardening (non-root, read-only filesystem, dropped capabilities), egress rules, environment-key custody and rotation, isolation between sessions, log retention. One environment per trust boundary when running untrusted code.
`,
    check: [
      { q: 'With a self-hosted sandbox, which statement is true?', options: ['Nothing ever leaves your network', 'Tool execution and files stay in your infrastructure, but tool inputs/outputs still go to Anthropic so the model can see them', 'Anthropic connects into your VPC', 'You must host the model yourself'], a: 1, why: 'The loop stays at Anthropic; execution moves to you; results still flow to the control plane. Connectivity is outbound-only.' },
    ],
  },
];
