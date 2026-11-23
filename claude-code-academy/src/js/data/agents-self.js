/* Agents track, part 2: choosing where agents run, self-hosting with the
   Messages API and the Claude Agent SDK (checked against claude-agent-sdk
   0.2.x and code.claude.com/docs/en/agent-sdk, Nov 2026), and comparison. */
window.CCA = window.CCA || {};
CCA.AGENTS_INTRO = [
  {
    id: 'spectrum', group: 'Choose where your agent runs', icon: '🧭', title: 'Hosted vs self-hosted: the big picture', mins: 12, domain: 'D1',
    body: `
Every agent has two jobs that someone has to run:
1. **The loop**: send the conversation to Claude, read the tool calls, feed results back, manage context.
2. **The tools**: actually execute bash, read files, call APIs, click buttons.

"Hosted vs self-hosted" is simply **who runs each job**.

| Approach | Who runs the loop | Who runs the tools | You write | Best when |
|---|---|---|---|---|
| **Messages API, manual loop** | You | You | The \`while stop_reason == "tool_use"\` loop + tools | Full control, simple tool sets, any language |
| **Messages API + Tool Runner** | You (the SDK helps) | You | Tool functions | Same, without writing the loop |
| **Claude Agent SDK** | You (Claude Code's engine as a library) | You (built-in file/bash/search tools + yours) | A prompt + options | A capable coding/files agent on your own servers |
| **Managed Agents: cloud** | Anthropic | Anthropic (a container per session) | An agent config + your app's UI | You want no infrastructure: scheduling, memory, sandboxes included |
| **Managed Agents: self-hosted sandbox** | Anthropic | **You** (a worker in your network) | Agent config + a worker | Hosted loop, but files and execution must stay inside your network |

And the **finished products** sit on top of these: **Claude Code** (developers), **Cowork** (knowledge work), and the **Claude apps**: you use them, you don't build them.

## A quick way to decide
- **No servers, fastest to production, need schedules/memory/sandboxes?** → Managed Agents (cloud).
- **Data or execution must stay in your network?** → Managed Agents self-hosted sandbox, or Agent SDK in your own containers.
- **Need zero data retention / HIPAA coverage, or a cloud platform like Bedrock/Vertex?** → self-host (Messages API or Agent SDK); Managed Agents isn't eligible there today.
- **Building a coding or file-heavy agent?** → Agent SDK (it *is* Claude Code's harness) or Managed Agents.
- **Simple workflow: a few tools, predictable steps?** → Messages API with your own loop; don't over-build.
- **Just you, getting work done?** → Claude Code, Cowork or the chat app; no building needed.

## Costs at a glance
| | Model tokens | Plus |
|---|---|---|
| Messages API / Agent SDK | ✅ | your own servers (often small next to token cost) |
| Managed Agents | ✅ | **session runtime** billed by Anthropic |

> [!EXAM] Domain 1 questions often hinge on *who enforces what*: in every approach, deterministic controls (permissions, hooks, budgets, allowlists) beat prompt instructions.

Use the **Hosting decision wizard** in this section to get a recommendation for your project.
`,
    check: [
      { q: 'A company requires that the agent\'s code execution and files never leave its VPC but doesn\'t want to build an agent loop. Best fit?', options: ['Managed Agents cloud environment', 'Managed Agents with a self-hosted sandbox environment', 'Claude chat', 'Batch API'], a: 1, why: 'The loop stays hosted by Anthropic; tool execution and files run on workers in their own network.' },
      { q: 'What is the main extra cost of Managed Agents compared with running your own loop?', options: ['Nothing', 'Session runtime billing on top of tokens', 'A per-tool fee', 'A required Enterprise plan'], a: 1, why: 'Managed Agents bills session runtime in addition to model tokens.' },
    ],
  },
];

CCA.AGENTS_SELF = [
  {
    id: 'self-api', group: 'Self-hosted agents', icon: '🧱', title: 'Self-hosting with the Messages API', mins: 8, domain: 'D1',
    body: `
The lightest way to self-host: **your program runs the loop** and calls \`POST /v1/messages\`. You've already seen it in **Connect & Automate → Tool use** and the **Agent Loop Visualizer**.

## When this is the right choice
- A **workflow** with a handful of tools and predictable steps (classify → look up → reply).
- You need **any language** (all official SDKs support tool use) or a platform like Bedrock, Vertex AI or Foundry.
- You need **Zero Data Retention** or strict compliance setups.
- You want **every decision** in your code: custom retries, routing, approvals.

## What you must build yourself
| Piece | Notes |
|---|---|
| The loop | \`while stop_reason == "tool_use"\` (or the SDK's Tool Runner) |
| Tools | Functions + JSON schemas; validate inputs |
| State | Store conversation history (database) per user/session |
| Context management | Trim old tool results, compaction, caching |
| Safety | Permissions, confirmations, rate limits, logging |
| Hosting | A web service or job runner (serverless, containers, a VM) |

> [!TIP] Start here for simple agents. Move to the Agent SDK when you need file/bash/code tools, subagents and hooks; move to Managed Agents when you'd rather not run infrastructure.
`,
    check: [
      { q: 'You need an agent on Amazon Bedrock with a few custom tools. Which approach fits?', options: ['Managed Agents', 'Messages API with your own loop (or the Agent SDK with Bedrock enabled)', 'Cowork', 'Claude chat Projects'], a: 1, why: 'Self-hosted approaches work on cloud platforms; Managed Agents isn\'t available on Bedrock.' },
    ],
  },
  {
    id: 'agent-sdk', group: 'Self-hosted agents', icon: '🧰', title: 'The Claude Agent SDK, hands-on', mins: 16, domain: 'D1',
    body: `
The **Claude Agent SDK** ([[agent-sdk]]) is Claude Code's engine as a library: the agent loop, context management, built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch…), permissions, hooks, subagents, MCP and sessions, all in **your** program on **your** machines.

## Install
\`\`\`bash
pip install claude-agent-sdk                  # Python 3.10+
npm install @anthropic-ai/claude-agent-sdk    # Node.js 18.14+
\`\`\`
Both bundle a native Claude Code binary. Authenticate with \`ANTHROPIC_API_KEY\` (the SDK doesn't read \`.env\` files for you), or use Bedrock / Vertex AI / Foundry with \`CLAUDE_CODE_USE_BEDROCK=1\`, \`CLAUDE_CODE_USE_VERTEX=1\` or \`CLAUDE_CODE_USE_FOUNDRY=1\` plus that cloud's credentials.

## Your first agent
\`\`\`python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage, TextBlock

async def main():
    options = ClaudeAgentOptions(
        system_prompt="You are a careful analyst. Write for non-technical readers.",
        allowed_tools=["Read", "Glob", "Grep", "Write"],   # pre-approved tools
        permission_mode="acceptEdits",                     # file edits without prompts
        cwd="/workspace",                                  # where the agent works
        max_turns=20,                                      # safety caps (off by default)
        max_budget_usd=2.0,
    )
    async for message in query(prompt="Summarize sales.csv into report.md", options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)
        elif isinstance(message, ResultMessage):
            print(f"Done in {message.num_turns} turns, cost \${message.total_cost_usd}")

asyncio.run(main())
\`\`\`
\`query()\` streams messages as the agent works; the final \`ResultMessage\` carries the result, turn count and cost. For multi-turn conversations in one process, use **\`ClaudeSDKClient\`**.

## Key options
| Option | What it does |
|---|---|
| \`allowed_tools\` / \`tools\` | Pre-approve tools / limit the built-in set |
| \`permission_mode\`, \`can_use_tool\` | Approval behaviour, or your own approval callback |
| \`system_prompt\` | Your instructions |
| \`cwd\`, \`add_dirs\` | Working folder and extra folders it may access |
| \`mcp_servers\` | MCP servers (stdio, HTTP, or in-process SDK servers) |
| \`agents\` | Subagent definitions (description, prompt, tools, model) |
| \`hooks\` | PreToolUse / PostToolUse etc. callbacks: deterministic guardrails |
| \`setting_sources\` | Whether to load CLAUDE.md / settings files; \`[]\` = none |
| \`max_turns\`, \`max_budget_usd\` | Caps (both off by default: set them!) |
| \`model\`, \`resume\`, \`fork_session\` | Model choice and session continuation |

## Your own tools, in-process
\`\`\`python
from claude_agent_sdk import tool, create_sdk_mcp_server

@tool("lookup_order", "Look up an order by ID (format ORD-12345)", {"order_id": str})
async def lookup_order(args):
    return {"content": [{"type": "text", "text": f"Order {args['order_id']}: shipped"}]}

shop = create_sdk_mcp_server(name="shop", tools=[lookup_order])
options = ClaudeAgentOptions(mcp_servers={"shop": shop}, allowed_tools=["mcp__shop__lookup_order"])
\`\`\`
In-process tools run inside your program: no separate server process.

> [!NOTE] Building a product on the SDK? Unless Anthropic has approved it, you may not offer claude.ai login or claude.ai rate limits to your users. Use API keys or a cloud platform.
`,
    check: [
      { q: 'Your Agent SDK agent sometimes runs for a very long time and costs too much. What do you set?', options: ['Nothing; it stops by itself', 'max_turns and max_budget_usd (both off by default)', 'A longer system prompt', 'permission_mode="bypassPermissions"'], a: 1, why: 'Caps are opt-in; set them so runaway runs stop with an error you can handle.' },
      { q: 'How do you give an Agent SDK agent a custom tool without running a separate MCP server process?', options: ['Impossible', 'Define it with @tool and wrap it with create_sdk_mcp_server (in-process MCP server)', 'Put it in CLAUDE.md', 'Use computer use'], a: 1, why: 'SDK MCP servers run inside your own process.' },
    ],
  },
  {
    id: 'deploy-self', group: 'Self-hosted agents', icon: '🚢', title: 'Deploying a self-hosted agent', mins: 14, domain: 'D5',
    body: `
## How the Agent SDK runs
Each \`query()\` starts a **Claude Code subprocess** that talks over stdio: one session = one subprocess with its own transcript. Session state lives on **local disk** (\`~/.claude/projects/\`, CLAUDE.md, the working folder), so it **disappears when a container restarts** unless you persist it (the SDK's **SessionStore** adapter mirrors transcripts; working-folder files need your own storage).

## Four deployment patterns
| Pattern | How | Good for |
|---|---|---|
| **Ephemeral** | One container per task: start, run (e.g. prompt from a \`TASK_PROMPT\` env var), exit | Jobs, CI tasks, queues |
| **Long-running** | Persistent containers serve many sessions over HTTP/WebSocket; route a session to the same container (consistent hashing on session ID) | Chat-style products |
| **Hybrid** | Ephemeral containers that reload a session from a SessionStore when the user returns | Sessions idle between uses |
| **Multi-agent** | Several subprocesses in one container, each with its own \`cwd\` | Parallel workers |

## The container checklist
- **Isolation**: run in a container (Docker; gVisor or Firecracker for stronger isolation). Non-root user, resource limits.
- **Size**: about **1 GiB RAM, 5 GiB disk, 1 CPU per agent** is a reasonable start.
- **Network**: outbound HTTPS to the API (or your Bedrock/Vertex endpoint) and your MCP endpoints only, via an **egress proxy with an allowlist**. Put inbound authentication on a gateway in front of the container.
- **Secrets**: API keys in a secret manager, or route calls through a proxy that injects the key (\`ANTHROPIC_BASE_URL\`). Keep tool credentials out of the agent's environment where you can.
- **Multi-tenant**: \`setting_sources=[]\`, \`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1\`, a per-tenant \`CLAUDE_CONFIG_DIR\` and \`cwd\`, so users never see each other's files or memory.
- **Caps**: \`max_turns\` / \`max_budget_usd\` (there's no built-in session timeout); recycle long-lived subprocesses whose memory grows.
- **Observability**: OpenTelemetry via the standard OTEL environment variables (prompt text excluded by default).

## Costs
Model tokens usually dominate container costs by **an order of magnitude or more**; a minimal container runs for about $0.05/hour. Optimize prompts, caching and model choice before squeezing infrastructure.

## A minimal Dockerfile (ephemeral pattern)
\`\`\`dockerfile
FROM python:3.12-slim
RUN useradd -m agent && pip install --no-cache-dir claude-agent-sdk
USER agent
WORKDIR /home/agent/app
COPY agent.py .
CMD ["python", "agent.py"]
\`\`\`
\`\`\`bash
docker run --rm -e ANTHROPIC_API_KEY -e TASK_PROMPT="Summarize sales.csv" -v "$PWD/data:/workspace" my-agent
\`\`\`
Anthropic's **claude-cookbooks** repository has ready Dockerfiles and Kubernetes manifests for SDK hosting.
`,
    check: [
      { q: 'Your SDK agent runs in containers that scale down overnight; users lose their conversation history. Fix?', options: ['Bigger containers', 'Persist transcripts with a SessionStore (and store working files elsewhere), or use the hybrid pattern', 'Use a longer system prompt', 'Disable scaling and hope'], a: 1, why: 'SDK state is on local disk; persist it outside the container.' },
      { q: 'Where should inbound user authentication happen for a self-hosted agent service?', options: ['Inside the system prompt', 'At a gateway in front of the agent container', 'In CLAUDE.md', 'Nowhere'], a: 1, why: 'Authenticate users before requests reach the agent; the agent container shouldn\'t be exposed directly.' },
    ],
  },
];

CCA.AGENTS_DECIDE = [
  {
    id: 'compare', group: 'Decide & operate', icon: '⚖️', title: 'Side by side, with real scenarios', mins: 10, domain: 'D1',
    body: `
| | Messages API loop | Agent SDK | Managed Agents (cloud) | Managed Agents (self-hosted sandbox) |
|---|---|---|---|---|
| Loop runs at | You | You | Anthropic | Anthropic |
| Tools/files run at | You | You | Anthropic container | You |
| Built-in file/bash tools | ❌ (write them) | ✅ | ✅ | ✅ (via your worker) |
| Scheduling | Your cron | Your cron | ✅ deployments | ✅ deployments |
| Memory across sessions | Build it | CLAUDE.md / your storage | ✅ memory stores | ✅ via SDK worker |
| Hosting work | Medium | Medium–high | **Lowest** | Medium (workers) |
| Data stays in your network | ✅ | ✅ | ❌ | Execution ✅, results ❌ |
| ZDR / HIPAA eligible | Possible | Possible | ❌ today | ❌ today |
| Bedrock / Vertex | ✅ | ✅ | ❌ | ❌ |
| Extra cost | Your servers | Your servers | Session runtime | Session runtime + your workers |
| Maturity | GA | GA | Beta | Beta |

## Scenarios
- **Customer support bot on your website** (lookups via your APIs, escalation rules): Messages API loop or Agent SDK with custom tools; hooks for refund limits. Managed Agents with custom tools also works if you'd rather not host.
- **Weekly market report emailed every Monday**: Managed Agents scheduled deployment with an outcome rubric.
- **Internal coding agent that fixes tickets in private repos**: Agent SDK in your CI/containers, or the Claude Code GitHub Action, or Managed Agents with GitHub resources.
- **Hospital data (HIPAA)**: self-host with eligible configurations; don't use beta hosted features.
- **One person automating their own week**: no building: Cowork scheduled tasks or Claude Code.

> [!TIP] Prototype fast with Managed Agents or the Agent SDK, measure cost and quality, then decide where it should live long-term. The prompts, tools and MCP servers carry over between approaches.
`,
    check: [
      { q: 'A solo user wants a weekly summary of their Downloads folder and inbox, without writing code. Best option?', options: ['Build a Managed Agents deployment', 'Use Cowork (scheduled task) with the needed connectors', 'Write an Agent SDK service', 'Use the Batch API'], a: 1, why: 'Finished products cover personal automation; building is for products and team systems.' },
    ],
  },
  {
    id: 'ops', group: 'Decide & operate', icon: '🛡️', title: 'Operating agents: safety, cost & monitoring', mins: 10, domain: 'D5',
    body: `
Whichever hosting you choose, production agents need the same habits.

## Safety
- **Least privilege**: only the tools, folders, networks and credentials the job needs.
- **Deterministic guardrails**: permission policies, hooks, allowlists; human approval for consequential actions ([[hook]]).
- **Treat inputs as untrusted**: web pages, emails, tickets and files can carry prompt injection.
- **Secrets**: vaults (Managed Agents) or a secret manager / injecting proxy (self-hosted). Never in prompts or images.
- **Isolation per tenant** and per trust boundary.

## Cost control
- Caps: \`max_turns\`, \`max_budget_usd\` (Agent SDK), **session budgets** (Managed Agents), \`--max-turns\` in CI.
- Prompt caching, the right model per task (Haiku-class workers for reading-heavy subagents), effort tuning.
- Measure **cost per completed task**, not per request.

## Monitoring
- Managed Agents: the Console's session viewer (transcript, tool stats, cost), webhooks for state changes.
- Agent SDK / Messages API: OpenTelemetry, structured logs, ResultMessage cost fields.
- Track: success rate, escalations, average turns, cost per task, tool error rates.

## Evaluate before you scale
Keep a set of real test tasks and re-run them when you change prompts, tools or models. It's the only way to know a change helped.
`,
    check: [
      { q: 'Which metric best captures whether an agent is cost-effective?', options: ['Cost per request', 'Cost per successfully completed task', 'Tokens per second', 'Number of tools'], a: 1, why: 'A cheaper request that needs more turns or retries isn\'t cheaper overall.' },
    ],
  },
];
