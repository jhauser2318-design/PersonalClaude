/* Context & Memory Engineering track. API facts follow the Claude API
   skill reference (prompt caching, compaction, context editing, memory
   tool), November 2026. Product facts match the other tracks.           */
window.CCA = window.CCA || {};
CCA.CONTEXT = [
  // ============================================================ FOUNDATIONS
  {
    id: 'ctx-what', group: 'Foundations', icon: '🧠', title: 'What context engineering is', mins: 10, domain: 'D5',
    body: `
**Prompt engineering** is writing a good instruction. **Context engineering** ([[context-engineering]]) is deciding *everything* the model sees on each turn: which instructions, which documents, which tools, which memories, which parts of the conversation, and in what order and size.

## The context window is working memory, not a hard drive
Current Claude models have very large windows (up to 1M tokens), but **more is not automatically better**:
- Every token costs money and time on every request.
- Attention is finite: as context grows, details in the middle get less attention (**lost in the middle**), and quality can degrade ([[context-rot]]).
- Stale or contradictory information (old tool results, abandoned plans) actively misleads.

> [!TIP] The goal: **the smallest set of high-signal tokens that makes the right answer likely.**

## The layers of context
\`\`\`text
┌──────────────────────────────────────────────┐  stable: changes rarely
│ Tools (definitions)                          │  → cache it
│ System prompt / CLAUDE.md / project rules    │
├──────────────────────────────────────────────┤  semi-stable
│ Long-term memory (memory files, stores)      │
│ Retrieved knowledge (docs, search results)   │  → retrieve just in time
├──────────────────────────────────────────────┤  changes every turn
│ Conversation so far + tool results           │  → trim, edit, compact
│ The current question                         │
└──────────────────────────────────────────────┘
\`\`\`

## Four moves you'll use everywhere
| Move | Meaning | Examples |
|---|---|---|
| **Write** | Save context *outside* the window for later | CLAUDE.md, NOTES.md scratchpads, memory tool, memory stores, Projects |
| **Select** | Pull in only what's relevant now | @-mentions, RAG, skills (progressive disclosure), tool search |
| **Compress** | Keep meaning, drop tokens | /compact, server-side compaction, summaries, trimmed tool outputs |
| **Isolate** | Do messy work in a separate context | Subagents, separate sessions, worktrees, multi-agent |

> [!EXAM] Domain 5 (Context Management & Reliability, 15%) is exactly this: case-facts blocks, scratchpads, trimming outputs, subagents for exploration, lost-in-the-middle, provenance.
`,
    check: [
      { q: 'Your agent has a 1M-token window. Why not just put every document in every request?', options: ['It\'s fine, bigger is always better', 'Cost and latency on every request, and attention degrades as irrelevant context grows', 'The API forbids it', 'Claude ignores documents'], a: 1, why: 'More tokens cost more and dilute attention; select what\'s relevant.' },
      { q: 'A subagent explores 40 files and returns a 10-line summary. Which context move is that?', options: ['Write', 'Select', 'Compress', 'Isolate'], a: 3, why: 'The messy exploration happens in a separate context window; only the result comes back.' },
    ],
  },
  {
    id: 'ctx-budget', group: 'Foundations', icon: '📊', title: 'Tokens, budgets & measuring context', mins: 10, domain: 'D5',
    body: `
## Rules of thumb
- 1 token ≈ ¾ of an English word; 1,000 tokens ≈ 750 words ≈ 1.5 pages.
- Code and non-English text use more tokens per character.
- Images and PDFs cost tokens too (a PDF page includes its text plus an image of the page).

## Measure, don't guess
**In Claude Code:** \`/context\` shows what fills the window (system, tools, MCP tools, memory files, messages), and \`/cost\` shows spend.

**In the API:** count before you send, and read usage after:
\`\`\`python
count = client.messages.count_tokens(model="claude-opus-5-5", system=system, messages=messages, tools=tools)
print(count.input_tokens)

response = client.messages.create(...)
u = response.usage
print(u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens, u.output_tokens)
\`\`\`

## A context budget for an agent
| Slice | Typical size | Keep it lean by |
|---|---|---|
| Tool definitions | 100–800 tokens each | Fewer, sharper tools; tool search for big catalogs |
| System prompt + memory files | 1k–10k | Short CLAUDE.md, rules loaded by path, skills on demand |
| Retrieved documents | 2k–30k | Retrieve top-k chunks, not whole files |
| Conversation + tool results | grows every turn | Trim outputs, context editing, compaction |

> [!TIP] Open the **Context Budget Visualizer** in this section to play with these numbers and see the effect of caching on cost.
`,
    check: [
      { q: 'How do you see what\'s filling the context window in a Claude Code session?', options: ['/cost', '/context', '/model', 'git status'], a: 1, why: '/context breaks down context usage by category.' },
    ],
  },

  // ======================================================= IN CLAUDE PRODUCTS
  {
    id: 'ctx-claudecode', group: 'Storing context in Claude products', icon: '💻', title: 'Context engineering in Claude Code', mins: 14, domain: 'D3',
    body: `
## Write: durable context files
| File | Loads | Use for |
|---|---|---|
| \`CLAUDE.md\` (project) | Every session | Commands, architecture map, conventions, gotchas: **short** |
| \`~/.claude/CLAUDE.md\` | Every session, all projects | Your personal preferences |
| Subfolder \`CLAUDE.md\` | When Claude works in that folder | Area-specific notes |
| \`.claude/rules/*.md\` with \`paths:\` | When matching files are touched | Conventions for a *type* of file |
| \`@docs/architecture.md\` imports | With the file that imports them | Keep CLAUDE.md small, detail elsewhere |
| Skills (\`SKILL.md\`) | Description always; body on demand | Procedures and reference knowledge |
| \`NOTES.md\` / \`PLAN.md\` scratchpads | When Claude reads them | Progress and decisions in long tasks |

### A CLAUDE.md diet
- Aim for something you could read in two minutes. Every line costs tokens **every session**.
- Delete what Claude can infer from the code; keep what it **can't** guess.
- Move file-type rules to \`.claude/rules/\` with \`paths:\`, and procedures to skills.
- When Claude repeats a mistake, add **one** precise line, not a paragraph.

## Select: point, don't dump
- \`@src/cart.js\` beats "look at the cart code".
- Ask Claude to **search first** (Grep/Glob) and read only matching files: *just-in-time* context ([[just-in-time]]).
- Keep MCP servers you don't need disconnected: their tool definitions use context.

## Compress: keep sessions healthy
- \`/clear\` between unrelated tasks.
- \`/compact keep the API decisions and failing test names\`: tell the summary what matters.
- Put must-not-lose facts (IDs, numbers, decisions) in a file before compacting.

## Isolate: subagents & parallel sessions
- *"Use a subagent to investigate how discounts flow through the code and report back in 10 bullets."* The exploration stays out of your main context.
- Parallel sessions on separate branches: \`claude --worktree <name>\`.

## Long tasks: the scratchpad pattern
\`\`\`text
Create PLAN.md with a checklist for this migration. After each step, tick it off
and add one line to NOTES.md with what you learned. Re-read both after any /compact.
\`\`\`
This gives Claude an external memory that survives compaction and new sessions.

> [!NOTE] Newer Claude Code versions can also keep their own memory notes automatically (the Agent SDK lets you turn this off with \`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1\`). Check \`/memory\` to see what's loaded.
`,
    check: [
      { q: 'Testing conventions apply to every *.test.ts file across 40 folders, and your CLAUDE.md is already long. Best place for them?', options: ['Append to CLAUDE.md', '.claude/rules/testing.md with paths: ["**/*.test.ts"]', 'Your user CLAUDE.md', 'Paste them into every prompt'], a: 1, why: 'Path-scoped rules load only when relevant, keeping every session lean.' },
      { q: 'A multi-hour migration keeps losing track of decisions after /compact. Best fix?', options: ['Never compact', 'Keep a PLAN.md checklist and NOTES.md that Claude updates and re-reads', 'Use a bigger model', 'Restart from scratch each hour'], a: 1, why: 'Externalized notes survive summarization and new sessions.' },
    ],
  },
  {
    id: 'ctx-apps', group: 'Storing context in Claude products', icon: '💬', title: 'Context in Claude chat & Cowork', mins: 8,
    body: `
| Where | What to store | Scope |
|---|---|---|
| **Project instructions** | How Claude should behave for this topic/team | One project |
| **Project knowledge** | Reference files (retrieved as needed when large) | One project |
| **Memory** | Lasting facts about you and your preferences | Your chats (projects keep separate memory) |
| **Chat search** | Ask about past conversations | Your history |
| **Skills** | Reusable procedures & formats | Everywhere they're enabled |
| **Cowork folder & global instructions** | Standing context for file work | A folder / all Cowork tasks |
| **Connectors** | Live data fetched when needed (Drive, Gmail, Slack…) | Per connector |

## Choosing well
- **Changes often, lives elsewhere** (inbox, shared drive) → a **connector**, so Claude fetches the current version instead of a stale upload.
- **Stable reference** (style guide, product spec) → **project knowledge**.
- **Rules of behaviour** → **instructions** (project or Cowork).
- **About you** → **memory** (review it now and then).
- **A repeatable process** → a **skill**.
- **Sensitive one-off** → an **incognito chat** (not saved to memory).

## Make knowledge files retrieval-friendly
- Clear titles and headings; one topic per file.
- Remove duplicates and outdated versions (conflicting copies confuse retrieval).
- Prefer text formats (Markdown, DOCX, text PDFs) over scanned images.
`,
    check: [
      { q: 'Your team\'s pricing sheet changes weekly in Google Drive. How should Claude get it?', options: ['Upload it to the project every week', 'Connect Google Drive so Claude fetches the current version when needed', 'Put it in memory', 'Paste it in instructions'], a: 1, why: 'Live sources belong behind connectors; uploads go stale.' },
    ],
  },

  // ============================================================ YOUR OWN APPS
  {
    id: 'ctx-caching', group: 'Context in your own apps (API)', icon: '♻️', title: 'Prompt caching, properly', mins: 14, domain: 'D5',
    body: `
[[prompt-caching|Prompt caching]] stores a prefix of your prompt so later requests that start with **exactly the same bytes** read it cheaply instead of reprocessing it.

## The one rule
The cache key is the exact bytes up to each breakpoint, in render order **tools → system → messages**. **One changed byte invalidates everything after it.** So: stable content first, changing content last.

## Turning it on
\`\`\`python
# Simplest: automatic caching (moves forward as the conversation grows)
client.messages.create(model="claude-opus-5-5", max_tokens=16000,
    cache_control={"type": "ephemeral"},
    system=LONG_STABLE_INSTRUCTIONS, messages=messages)

# Explicit breakpoint on the end of the stable system prompt
system=[{"type": "text", "text": LONG_STABLE_INSTRUCTIONS,
         "cache_control": {"type": "ephemeral"}}]          # add "ttl": "1h" for the 1-hour cache
\`\`\`
- Up to **4** breakpoints per request.
- **Minimum** cacheable prefix: 512 tokens on current models (older models need 1024–4096). Shorter prefixes silently don't cache.
- **Lifetime**: 5 minutes by default (each hit refreshes it), or 1 hour.

## The economics
| | Cost vs normal input |
|---|---|
| Cache write (5-minute TTL) | 1.25× |
| Cache write (1-hour TTL) | 2× |
| Cache read | ~0.1× (0.05× on Claude Opus 5.5 and Sonnet 5.5) |
With the 5-minute TTL, **two requests already break even**.

## Verify it works
\`\`\`python
u = response.usage
print(u.cache_creation_input_tokens, u.cache_read_input_tokens)   # reads should grow on repeat calls
\`\`\`
If \`cache_read_input_tokens\` stays 0, look for a **silent invalidator**:
| Pattern | Why it breaks caching |
|---|---|
| \`datetime.now()\` in the system prompt | Prefix changes every request |
| Request IDs / UUIDs early in the prompt | Every request unique |
| \`json.dumps(d)\` without \`sort_keys=True\` | Byte order can differ |
| User name/ID interpolated into the system prompt | No sharing across users |
| Tool list that varies per user | Tools render first: nothing after them caches |

## Placement patterns
- **Big shared instructions or documents**: breakpoint at the end of the shared part, with the question after it.
- **Multi-turn chat**: automatic caching, which moves forward each turn.
- **Agent loops**: one explicit breakpoint on the static system prefix + automatic caching for the growing tail.
- Need to add an instruction mid-conversation? Use a **mid-conversation system message** (\`{"role": "system", ...}\` appended to messages, on supporting models) instead of editing the top-level system prompt.

> [!TIP] Try the **Prompt Cache Lab** in this section: move a timestamp around and watch hits turn into misses.
`,
    check: [
      { q: 'You added `f"Current time: {datetime.now()}"` at the top of your system prompt, and cache reads dropped to zero. Fix?', options: ['Raise max_tokens', 'Move the timestamp after the last cache breakpoint (e.g. into the user message) or drop it', 'Use the 1-hour TTL', 'Add more breakpoints'], a: 1, why: 'Anything that changes per request must come after the cached prefix.' },
      { q: 'Why does a per-user tool list prevent caching across users?', options: ['Tools aren\'t cacheable', 'Tools render first in the prefix, so a different tool list changes the very beginning of every prompt', 'The cache is per user anyway', 'It doesn\'t'], a: 1, why: 'Render order is tools → system → messages; differences at position 0 invalidate everything after.' },
    ],
  },
  {
    id: 'ctx-long', group: 'Context in your own apps (API)', icon: '📜', title: 'Long conversations: editing, compaction & summaries', mins: 12, domain: 'D5',
    body: `
Agents that run for many turns accumulate stale tool results and history. Three tools, often used together:

| Technique | What it does | Use when |
|---|---|---|
| **Context editing** ([[context-editing]]) | **Removes** old tool results (and optionally thinking blocks) | Old outputs are irrelevant but the conversation structure matters |
| **Compaction** ([[compact]]) | **Summarizes** earlier history server-side into a compaction block | The conversation may approach the window limit |
| **Memory** | **Persists** facts across sessions in files/stores | Knowledge must outlive this conversation |

## Context editing (beta)
\`\`\`python
client.beta.messages.create(
    model="claude-opus-5-5", max_tokens=16000,
    betas=["context-management-2025-06-27"],
    context_management={"edits": [{"type": "clear_tool_uses_20250919"}]},
    tools=tools, messages=messages,
)
\`\`\`
Strategies: \`clear_tool_uses_20250919\` (old tool results; \`clear_tool_inputs: true\` also clears the call inputs) and \`clear_thinking_20251015\`.

## Server-side compaction (beta)
\`\`\`python
response = client.beta.messages.create(
    betas=["compact-2026-01-12"],
    model="claude-opus-5-5", max_tokens=16000,
    messages=messages,
    context_management={"edits": [{"type": "compact_20260112"}]},
)
messages.append({"role": "assistant", "content": response.content})   # keep ALL blocks
\`\`\`
> [!WARN] Append the full \`response.content\`, not just its text: the **compaction block** must go back on the next request, or the compaction state is lost.

## Client-side summaries done right
If you summarize yourself: summarize into **one message**, start the next request with that summary plus the new user turn, and **tell the summarizer what to keep** (decisions, IDs, numbers, open tasks). Don't compact in the middle of a tool round.

## The case-facts block ([[case-facts]])
Summaries blur specifics. Keep a small structured block of facts that you **re-send every turn**:
\`\`\`text
<case_facts>
customer_id: C-88213   order: ORD-55120   amount: $247.83   opened: 2026-11-18
issue: double charge   status: refund approved, awaiting bank (3-5 days)
</case_facts>
\`\`\`
`,
    check: [
      { q: 'After enabling server-side compaction, the agent seems to "forget" everything each turn. Likely bug?', options: ['Compaction is broken', 'The code appends only the text of the response, dropping the compaction block', 'Too many tools', 'Wrong model'], a: 1, why: 'The compaction block must be sent back; append the full response.content.' },
      { q: 'Old tool outputs are bloating context but you want to keep the conversation structure. Which technique?', options: ['Compaction', 'Context editing (clear tool uses)', 'Batch API', 'A new session'], a: 1, why: 'Context editing prunes stale tool results without summarizing the whole conversation.' },
    ],
  },
  {
    id: 'ctx-memory', group: 'Context in your own apps (API)', icon: '🗄️', title: 'Persistent memory for agents', mins: 12, domain: 'D5',
    body: `
## The memory tool (client-side)
The **memory tool** ([[memory-tool]]) lets Claude create, read, edit and delete files in a \`/memories\` directory that **your code** stores (disk, database, cloud storage). Claude checks memory at the start of a task and writes down what's worth keeping.
\`\`\`python
response = client.messages.create(
    model="claude-opus-5-5", max_tokens=16000,
    tools=[{"type": "memory_20250818", "name": "memory"}],
    messages=[{"role": "user", "content": "Remember that my preferred language is Python."}],
)
\`\`\`
Commands Claude uses: \`view\`, \`create\`, \`str_replace\`, \`insert\`, \`delete\`, \`rename\`. The Python SDK's \`BetaAbstractMemoryTool\` (from \`anthropic.lib.tools\`) gives you a class to subclass for your storage backend, and it plugs into the tool runner.

## Memory stores (Claude Managed Agents)
Hosted agents can attach **memory stores**: persistent storage mounted into the session as files, with **version history** to audit, roll back or redact what was remembered.

## What should an agent remember?
| Remember | Don't remember |
|---|---|
| User preferences & stable facts | Secrets: API keys, passwords, tokens |
| Decisions and their reasons | Raw transcripts (summarize instead) |
| Lessons learned ("tests need DB_URL set") | Things that change often (fetch live instead) |
| Progress on long tasks | Sensitive personal data you don't need |

## Design rules
- **Per-user isolation**: separate memory directories per user, with authentication in your tool handler.
- **Privacy**: check regulations (GDPR, CCPA) before persisting personal data; let users view and delete.
- **Hygiene**: prefer updating a file over appending forever; periodically consolidate.
- **Trust**: memory written from untrusted inputs can carry injected instructions, so treat it like any other input.
`,
    check: [
      { q: 'Who stores the files when you use the memory tool on the Messages API?', options: ['Anthropic, automatically', 'Your application: it\'s a client-side tool and you implement the storage', 'The user\'s browser', 'GitHub'], a: 1, why: 'The memory tool is client-side; your code executes its commands against your storage.' },
    ],
  },
  {
    id: 'ctx-rag', group: 'Context in your own apps (API)', icon: '🔍', title: 'RAG: retrieval from first principles', mins: 16, domain: 'D5',
    body: `
**Retrieval-augmented generation** ([[rag]]) = find the most relevant pieces of a large knowledge base, then give only those to Claude with the question.

## The pipeline
\`\`\`text
documents ─▶ chunk ─▶ index (keywords / embeddings) ─────────┐
                                                             ▼
question ─▶ search ─▶ top-k chunks ─▶ (rerank) ─▶ prompt + citations ─▶ Claude
\`\`\`
1. **Chunk**: split documents into pieces (a few hundred tokens), keeping headings with their text.
2. **Index**: keyword index (BM25) and/or **embeddings** (vectors capturing meaning) in a vector database.
3. **Search**: find the best chunks for the question. **Hybrid** search (keywords + embeddings) catches both exact terms ("ORD-55120") and paraphrases.
4. **Rerank** (optional): a second model reorders the candidates by relevance.
5. **Generate**: put the chunks in the prompt (in XML tags, with IDs), ask Claude to answer **only from them** and cite sources.

## Contextual retrieval
Anthropic's **contextual retrieval** technique ([[contextual-retrieval]]) prepends a short, Claude-written sentence to each chunk explaining where it sits ("This chunk is from the Q3 2026 refund policy, section on chargebacks…") before indexing. In Anthropic's published experiments this cut retrieval failures substantially, especially combined with BM25 and reranking. Prompt caching keeps generating those sentences cheap, because the full document is cached while each chunk is described.

## A runnable mini-RAG (pure Python)
This tiny keyword retriever is in **Python Basics → "Mini RAG in pure Python"**, where you can run it:
\`\`\`python
import math, re
from collections import Counter

def tokenize(text):
    return re.findall(r"[a-z0-9]+", text.lower())

docs = {name: Counter(tokenize(text)) for name, text in notes.items()}
doc_freq = Counter(word for counts in docs.values() for word in counts)

def score(question, counts):
    return sum(counts[w] * math.log((len(docs) + 1) / (doc_freq[w] + 0.5))
               for w in tokenize(question) if w in counts)
\`\`\`
Real systems swap this for embeddings + a vector database (Anthropic recommends Voyage AI for embeddings), but the idea is identical.

## Prompting with retrieved context
\`\`\`text
<documents>
<doc id="refund-policy#3">…</doc>
<doc id="faq#12">…</doc>
</documents>
Answer using only the documents. Quote the sentence you rely on and cite its id.
If the documents don't contain the answer, say "I don't know".
\`\`\`
For PDFs and text you pass as \`document\` blocks, the API's **citations** feature (\`citations: {enabled: true}\`) returns exact cited passages automatically.

## RAG vs just-in-time search vs long context
| Approach | Best for |
|---|---|
| **Long context** (put it all in, cache it) | Up to a few hundred pages that are reused a lot |
| **RAG** | Large, mostly static knowledge bases; many users |
| **Agentic search** (Grep/Glob/tools, just in time) | Codebases and data that change constantly |
Many systems combine them. Claude Code itself relies mostly on agentic search over your files.
`,
    check: [
      { q: 'Users search for exact order IDs like "ORD-55120" and embeddings-only search misses them. Fix?', options: ['Bigger chunks', 'Hybrid search: add a keyword (BM25) index alongside embeddings', 'Turn off retrieval', 'Use a smaller model'], a: 1, why: 'Keyword search excels at exact tokens; hybrid search gets both meaning and exact matches.' },
      { q: 'What does contextual retrieval add to each chunk before indexing?', options: ['A random ID', 'A short generated explanation of where the chunk fits in its document', 'The whole document', 'An embedding of the question'], a: 1, why: 'Situating each chunk in its document improves retrieval of otherwise ambiguous chunks.' },
    ],
  },
  {
    id: 'ctx-agents', group: 'Context in your own apps (API)', icon: '🤖', title: 'Context-efficient tools & agents', mins: 12, domain: 'D2',
    body: `
Tool results are often the biggest context consumer in agents. Design for it.

## Tools that return less
- **Trim outputs** to what the agent needs: \`{"status": "shipped", "eta": "2026-11-26"}\`, not the 40-field order record.
- **Paginate and filter**: \`search_orders(customer_id, status="open", limit=10)\`.
- Offer a **concise vs detailed** option: \`response_format: "concise" | "detailed"\`.
- Return **IDs and summaries**, and let the agent fetch details only if needed.
- Truncate long logs with a note: \`"…(2,400 more lines; call get_log_page to see more)"\`.

## Fewer tools in context
- Each tool definition costs tokens on every request. Scope tools per agent/subagent ([[least-privilege]]).
- For large catalogs use **tool search** / deferred loading so definitions load on demand ([[tool-search]]).
- Skills follow the same idea: only names and descriptions load until a skill is used ([[progressive-disclosure]]).

## Just-in-time over just-in-case
Instead of pre-loading every file "just in case", give the agent lightweight references (file paths, URLs, IDs) and tools to fetch them when needed ([[just-in-time]]). That's how Claude Code explores codebases: Glob → Grep → Read the few files that matter.

## Isolate with subagents
Subagents do heavy reading in their own windows and return **condensed, structured** results (with sources). The coordinator's context stays small and focused ([[context-isolation]]).

## Structured note-taking
Long-horizon agents keep a NOTES/TODO file (or memory) and re-read it, which is more reliable than hoping the conversation preserves everything.

> [!EXAM] Typical Domain 5 answers: trim verbose tool results before they enter context, carry a case-facts block, use scratchpad files, delegate exploration to subagents, and put key findings at the start of long inputs.
`,
    check: [
      { q: 'An order-lookup tool returns 40 fields and context fills up after a few calls. Best first fix?', options: ['A bigger context window', 'Return only the fields the agent needs (or a concise mode), with details on request', 'Call it less', 'Compact after every call'], a: 1, why: 'Trimming tool outputs prevents bloat at the source.' },
    ],
  },
  {
    id: 'ctx-files', group: 'Context in your own apps (API)', icon: '📎', title: 'Documents, the Files API & citations', mins: 8,
    body: `
## Send documents directly
PDFs and text can go straight into a message as \`document\` blocks (base64, URL, or a file ID). Put long documents **before** your question; that ordering works better.

## Upload once, reuse many times: the Files API
\`\`\`python
file = client.files.upload(file=("handbook.pdf", open("handbook.pdf", "rb"), "application/pdf"))
messages = [{"role": "user", "content": [
    {"type": "document", "source": {"type": "file", "file_id": file.id}},
    {"type": "text", "text": "What is the refund window?"},
]}]
\`\`\`
The Files API is generally available (no beta header). Combine it with prompt caching when you ask many questions about the same file.

## Citations: grounded answers
Turn on citations per document and Claude's answer comes back split into text blocks with **exact cited passages** (page numbers for PDFs, character ranges for text):
\`\`\`python
{"type": "document", "source": {"type": "file", "file_id": file.id}, "citations": {"enabled": True}}
\`\`\`
Citations make answers auditable, which is key for policy, legal and support use cases ([[provenance]]). (They can't be combined with JSON structured outputs in the same request.)
`,
    check: [
      { q: 'You ask 200 questions about the same 80-page manual. What saves the most?', options: ['Re-uploading it as base64 every time without caching', 'Upload once with the Files API and cache the document prefix', 'Split it into 200 emails', 'Use a smaller font'], a: 1, why: 'Upload once, reference by file_id, and cache the stable prefix.' },
    ],
  },

  // ================================================================ PRACTICE
  {
    id: 'ctx-patterns', group: 'Practice', icon: '🧪', title: 'Patterns cookbook', mins: 10, domain: 'D5',
    body: `
| Scenario | Context recipe |
|---|---|
| **Customer support agent** | Cached system prompt + policy docs; case-facts block re-sent every turn; trimmed tool outputs; escalation summary on handoff |
| **Codebase onboarding** | Lean CLAUDE.md + path rules; agentic search; an Explore subagent writes ARCHITECTURE.md you then import with @ |
| **Research agent** | Subagents per source return claim → source records; coordinator keeps a findings file; synthesis cites sources |
| **Document Q&A for a team** | Files API + citations; hybrid RAG with contextual retrieval for large corpora; cache the shared prefix |
| **Personal assistant** | Memory for preferences; connectors for live data (calendar, email); incognito for sensitive one-offs |
| **Long migration in Claude Code** | PLAN.md checklist + NOTES.md; /compact with focus; worktrees for parallel tracks |
| **Nightly batch extraction** | Batch API + one cached instruction prefix + small per-document suffix |

## A template you can reuse (system prompt layout)
\`\`\`text
[1] Role & rules                      ← stable   (cache breakpoint after [3])
[2] Tool usage guidance               ← stable
[3] Reference policies / examples     ← stable
[4] Memory: user preferences          ← changes rarely
[5] Retrieved documents for this turn ← changes per turn
[6] Case facts                        ← changes per turn
[7] The user's message                ← changes per turn
\`\`\`
`,
    check: [
      { q: 'In a support agent, where should the customer\'s order number and amount live so they survive long conversations?', options: ['Only in the first user message', 'In a case-facts block re-sent every turn (after the cached prefix)', 'In the tool descriptions', 'In the model name'], a: 1, why: 'A compact, structured facts block keeps exact values available on every turn.' },
    ],
  },
  {
    id: 'ctx-pitfalls', group: 'Practice', icon: '⚠️', title: 'Pitfalls & checklist', mins: 8, domain: 'D5',
    body: `
## Ten classic mistakes
1. A **bloated CLAUDE.md** that costs tokens every session and buries the important lines.
2. **Resuming stale sessions** after the code changed: Claude reasons over outdated tool results.
3. **Timestamps or user IDs** at the top of the system prompt, silently killing the cache.
4. **Twenty MCP servers** connected "just in case".
5. **Dumping whole files** instead of searching for the relevant part.
6. **Verbose tool outputs** (full JSON records, full logs) piling up.
7. Trusting **summaries with exact numbers**: keep facts in a facts block or file.
8. Key instructions **buried in the middle** of a long prompt.
9. **Secrets or unnecessary personal data** written into memory.
10. Treating **retrieved or remembered text as trusted instructions** (prompt injection).

## Checklist before you ship
- [ ] Stable content first, cache breakpoint placed, cache reads verified in usage.
- [ ] Tools are few, sharp, and return trimmed outputs.
- [ ] Long-running loops use context editing and/or compaction (full content appended).
- [ ] Must-not-lose facts are in a facts block, memory or files.
- [ ] Retrieval returns cited, relevant chunks; "I don't know" is allowed.
- [ ] Memory is per-user, private, and free of secrets.
- [ ] Exploration happens in subagents or separate sessions.
`,
    check: [
      { q: 'Which is NOT a good context-engineering practice?', options: ['Trimming tool outputs', 'Putting a per-request timestamp before the cache breakpoint', 'Using subagents for exploration', 'Keeping a case-facts block'], a: 1, why: 'Per-request content before the breakpoint invalidates the cache on every call.' },
    ],
  },
];
