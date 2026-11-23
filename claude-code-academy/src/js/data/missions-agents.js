/* Simulator missions: a hosted Managed Agent, a self-hosted Agent SDK
   agent, and Cowork in the Claude desktop app.                           */
(function (C) {
  const L = (...lines) => lines.join('\n');
  const annotate = (content, notes) => {
    const out = {}; const lines = content.split('\n');
    for (const [needle, text] of notes) { const i = lines.findIndex((l, n) => l.includes(needle) && !out[n + 1]); if (i >= 0) out[i + 1] = text; }
    return { content, notes: out };
  };

  const setup = L('# setup.py: run ONCE. Creates the environment and the agent, saves their IDs.', 'import json', 'import anthropic', '',
    'client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY; adds the beta header itself', '',
    'environment = client.beta.environments.create(', '    name="reports-env",',
    '    config={"type": "cloud", "networking": {"type": "limited", "allow_package_managers": True}},', ')', '',
    'agent = client.beta.agents.create(', '    name="Report Writer",', '    model="claude-opus-5-5",',
    '    system="You turn CSV files into short, clear reports for non-technical readers.",',
    '    tools=[{', '        "type": "agent_toolset_20260401",',
    '        "default_config": {"enabled": True, "permission_policy": {"type": "auto"}},',
    '        "configs": [{"name": "web_fetch", "enabled": False}, {"name": "web_search", "enabled": False}],', '    }],', ')', '',
    'json.dump({"environment_id": environment.id, "agent_id": agent.id, "agent_version": agent.version},',
    '          open(".agent-ids.json", "w"))', 'print("Saved IDs to .agent-ids.json")');
  const run = L('# run.py: every task. Starts a session, sends the task, streams events.', 'import json, sys', 'import anthropic', '',
    'client = anthropic.Anthropic()', 'ids = json.load(open(".agent-ids.json"))', '',
    'session = client.beta.sessions.create(', '    agent={"type": "agent", "id": ids["agent_id"], "version": ids["agent_version"]},',
    '    environment_id=ids["environment_id"],', '    resources=[{"type": "file", "file_id": upload("sales.csv"), "mount_path": "/workspace/sales.csv"}],', ')', '',
    'with client.beta.sessions.events.stream(session_id=session.id) as stream:',
    '    client.beta.sessions.events.send(session_id=session.id, events=[',
    '        {"type": "user.message", "content": [{"type": "text", "text": sys.argv[1]}]}])',
    '    for event in stream:', '        show(event)                                   # print messages & tool calls',
    '        if event.type == "agent.tool_use" and event.evaluated_permission == "ask":',
    '            ok = input("Allow? [y/N] ") == "y"',
    '            client.beta.sessions.events.send(session_id=session.id, events=[',
    '                {"type": "user.tool_confirmation", "tool_use_id": event.id, "result": "allow" if ok else "deny"}])',
    '        elif event.type == "session.status_idle" and event.stop_reason.type != "requires_action":',
    '            break');
  const deploy = L('# deploy.py: run the agent automatically every Friday evening.', 'import json', 'import anthropic', '',
    'client = anthropic.Anthropic()', 'ids = json.load(open(".agent-ids.json"))', '',
    'deployment = client.beta.deployments.create(', '    name="Weekly sales report",', '    agent=ids["agent_id"],', '    environment_id=ids["environment_id"],',
    '    initial_events=[{"type": "user.message",', '                     "content": [{"type": "text", "text": "Write this week\'s sales report."}]}],',
    '    schedule={"type": "cron", "expression": "0 20 * * 5", "timezone": "America/New_York"},', ')', 'print("Deployment", deployment.id)');
  const sdk = L('# agent.py: a self-hosted agent built with the Claude Agent SDK', 'import asyncio, os, sys',
    'from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage, TextBlock', '',
    'async def main(task: str):', '    options = ClaudeAgentOptions(',
    '        system_prompt="You are a careful analyst. Write for non-technical readers.",',
    '        allowed_tools=["Read", "Glob", "Grep", "Write"],', '        permission_mode="acceptEdits",',
    '        cwd=os.environ.get("WORKDIR", "."),', '        setting_sources=[],              # ignore local CLAUDE.md/settings: predictable in prod',
    '        max_turns=20,', '        max_budget_usd=2.0,', '    )', '    async for message in query(prompt=task, options=options):',
    '        if isinstance(message, AssistantMessage):', '            for block in message.content:', '                if isinstance(block, TextBlock):',
    '                    print(block.text)', '        elif isinstance(message, ResultMessage):',
    '            print(f"Done: {message.num_turns} turns, ${message.total_cost_usd:.2f}")', '',
    'asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else os.environ["TASK_PROMPT"]))');
  const dockerfile = L('FROM python:3.12-slim', 'RUN useradd -m agent && pip install --no-cache-dir claude-agent-sdk', 'USER agent',
    'WORKDIR /home/agent/app', 'COPY agent.py .', 'ENV WORKDIR=/workspace', 'CMD ["python", "agent.py"]');

  Object.assign(C.SIM_CREATED, {
    '~/agents-demo/setup.py': annotate(setup, [
      ['run ONCE', 'Setup is separate from runtime: agents are persistent, versioned configs. Never create one per request.'],
      ['anthropic.Anthropic()', 'The normal Anthropic SDK (pip install anthropic). Managed Agents lives under client.beta.*.'],
      ['environments.create', 'An ENVIRONMENT is where tools run. "cloud" = Anthropic\'s container per session.'],
      ['"networking"', 'Limited networking: only package registries here. Allowlist other hosts explicitly.'],
      ['agents.create', 'The AGENT: model, system prompt, tools. Changing it later creates a new version.'],
      ['agent_toolset_20260401', 'The built-in toolset: bash, file operations, code, web tools.'],
      ['permission_policy', '"auto": safe calls run, risky ones are denied, uncertain ones pause for approval.'],
      ['"web_fetch", "enabled": False', 'Least privilege: web tools off because this job doesn\'t need the internet.'],
      ['json.dump', 'Store the IDs (or keep agents as files synced with the `ant` CLI). Runtime code only reads them.'],
    ]),
    '~/agents-demo/run.py': annotate(run, [
      ['every task', 'Every run creates a SESSION: its own sandbox, workspace and event history.'],
      ['"version": ids["agent_version"]', 'Pin the agent version for reproducible runs; omit to use the latest.'],
      ['resources=', 'Mount files (or a GitHub repo) into the session\'s container.'],
      ['events.stream', 'Open the stream FIRST, then send the message, so no events are missed.'],
      ['"user.message"', 'Your task enters the session as a user.message event.'],
      ['evaluated_permission == "ask"', 'The agent paused: a tool call needs your decision. Unattended? Deny.'],
      ['user.tool_confirmation', 'Your allow/deny answer goes back as an event.'],
      ['status_idle', 'Idle + a stop reason other than requires_action = the agent finished.'],
    ]),
    '~/agents-demo/deploy.py': annotate(deploy, [
      ['deployments.create', 'A DEPLOYMENT = agent + environment + starting message + schedule. Anthropic fires it; you host nothing.'],
      ['"cron"', 'Standard cron ("0 20 * * 5" = Fridays 20:00) in the timezone you give.'],
    ]),
    '~/agents-demo/sales.csv': { content: L('date,region,product,amount', '2026-11-02,North,Mugs,1240', '2026-11-03,South,Tea,860', '2026-11-05,North,Tea,1530', '2026-11-06,West,Mugs,410') },
    '~/sdk-agent/agent.py': annotate(sdk, [
      ['from claude_agent_sdk', 'pip install claude-agent-sdk. It bundles Claude Code\'s engine; you host it.'],
      ['ClaudeAgentOptions(', 'All configuration in one place: like Claude Code settings, but in code.'],
      ['allowed_tools', 'Pre-approved built-in tools. No Bash here, because this agent only needs to read and write files.'],
      ['permission_mode="acceptEdits"', 'File edits run without prompts (there\'s no human watching in production).'],
      ['cwd=', 'The folder the agent works in (mounted into the container).'],
      ['setting_sources=[]', 'Don\'t load CLAUDE.md/settings from disk: predictable and safer for multi-tenant hosting.'],
      ['max_turns=20', 'Caps are OFF by default. Always set turn and budget caps for unattended agents.'],
      ['async for message in query', 'query() streams messages as the agent works.'],
      ['ResultMessage', 'The final message: result, number of turns, and total cost in USD.'],
    ]),
    '~/sdk-agent/Dockerfile': annotate(dockerfile, [
      ['FROM python', 'A small Python base image.'],
      ['useradd', 'Run as a non-root user: basic container hardening.'],
      ['ENV WORKDIR', 'Mount your data at /workspace when you run the container.'],
      ['CMD', 'Ephemeral pattern: the container runs one task (from TASK_PROMPT) and exits.'],
    ]),
    '~/Downloads/invoice-march.pdf': { content: 'Invoice #2291 · Acme Hosting · 2026-03-04 · $48.00' },
    '~/Downloads/receipt-coffee.jpg': { content: '(photo) Bean There Café · 2026-11-03 · $6.40' },
    '~/Downloads/receipt-train.pdf': { content: 'Rail ticket · City Rail · 2026-11-10 · $23.50' },
    '~/Downloads/setup-old.exe': { content: '(installer, 86 MB)' },
    '~/Downloads/holiday-photo.jpg': { content: '(photo)' },
    '~/Downloads/notes.txt': { content: 'Ideas for the shop: gift cards, bundles.' },
  });
  const DL = ['~/Downloads/invoice-march.pdf', '~/Downloads/receipt-coffee.jpg', '~/Downloads/receipt-train.pdf', '~/Downloads/setup-old.exe', '~/Downloads/holiday-photo.jpg', '~/Downloads/notes.txt'];

  C.SIM_PAGES['https://platform.claude.com/workspaces/default/sessions/sesn_01demo'] = {
    title: 'Session sesn_01demo · Claude Console',
    render: () => `<div class="gh-top"><b>Claude Console</b> <span class="gh-private">Managed Agents</span></div><div class="gh-tabs"><span class="on">Transcript</span><span>Tools</span><span>Files</span><span>Cost</span></div>
      <div class="gh-page"><h3>Report Writer · v1 <span class="gh-num">sesn_01demo</span></h3>
      <div class="row" style="gap:8px;margin-bottom:10px"><span class="gh-pill open">● Idle · end_turn</span><span class="gh-meta">4 tool calls · 41s · $0.07 tokens + runtime</span></div>
      <pre class="gh-log">user.message        Summarize sales.csv into a one-page report
agent.message       I'll analyze the CSV and write report.md.
agent.tool_use      bash   python3 analyze.py           allow (auto)
agent.tool_use      read   /workspace/sales.csv         allow (auto)
agent.tool_use      write  /workspace/report.md         ask → allowed by you
agent.message       Report written: total $4,040; Tea leads (59%).
session.status_idle end_turn</pre></div>`,
  };

  C.MISSIONS.push(
    {
      id: 'managed-agent', title: 'Ship a hosted Managed Agent', level: 'Advanced', mins: 8,
      sub: 'Create an agent once, run it in Anthropic\'s cloud with live events and an approval, then schedule it.',
      intro: '**Claude Managed Agents**: Anthropic runs the agent loop *and* a sandbox per session. You write a setup script once and a tiny run script. No servers.',
      start: { inClaude: false, cwd: '~/agents-demo', fxDir: '~/agents-demo', files: ['~/agents-demo/setup.py', '~/agents-demo/run.py', '~/agents-demo/deploy.py', '~/agents-demo/sales.csv'] },
      steps: [
        { do: 'Open Files → setup.py and read how the agent is defined', action: 'open:~/agents-demo/setup.py', type: '(click 📁 Files → setup.py)',
          explain: 'Two objects created **once**: an **environment** (where tools run) and an **agent** (model, prompt, tools: versioned). Runtime code never creates agents.', terms: ['managed-agents'] },
        { do: 'Run the one-time setup', type: 'python setup.py', match: /^python3?\s+setup\.py/,
          run: [['out', ['Creating environment "reports-env"… [g]env_01HXq7[/]', 'Creating agent "Report Writer"… [g]agent_01J3kp[/] [d](version 1)[/]', 'Saved IDs to .agent-ids.json']], ['write-silent', '~/agents-demo/.agent-ids.json', '{"environment_id": "env_01HXq7", "agent_id": "agent_01J3kp", "agent_version": 1}']],
          explain: 'The agent and environment now live in your Anthropic workspace. Change the agent later with an **update** (new version), not a new agent.', terms: ['managed-agents'] },
        { do: 'Run a task: a session in the cloud, streaming events', type: 'python run.py "Summarize sales.csv into a one-page report"', match: /^python3?\s+run\.py/,
          run: [
            ['out', ['Session [g]sesn_01demo[/] created (Report Writer v1)', '[d]Trace: https://platform.claude.com/workspaces/default/sessions/sesn_01demo[/]']],
            ['pause', 500],
            ['out', ['[b]session.status_running[/]', '[o]agent.message[/]   I\'ll analyze the CSV and write report.md.', '[p]agent.tool_use[/]  bash: python3 analyze.py   [d]permission: allow (auto)[/]', '[p]agent.tool_use[/]  read: /workspace/sales.csv   [d]permission: allow (auto)[/]', '[p]agent.tool_use[/]  write: /workspace/report.md  [y]permission: ask[/]']],
            ['choice', 'The agent paused: allow it to write report.md?', ['Allow (sends user.tool_confirmation: allow)', 'Deny']],
            ['out', ['[o]agent.message[/]   Report written: total $4,040 across 4 orders; Tea leads with 59% of revenue.', '[b]session.status_idle[/]  stop_reason=end_turn']],
            ['ghpage', 'https://platform.claude.com/workspaces/default/sessions/sesn_01demo', {}],
          ],
          explain: 'Your laptop only **sent a message and printed events**. The loop ran at Anthropic and the tools ran in a **cloud container**. The write paused for approval because of the `auto` policy. The Console shows the same session: transcript, tool calls, cost.', terms: ['managed-agents', 'permission-mode'] },
        { do: 'Schedule it every Friday evening', type: 'python deploy.py', match: /^python3?\s+deploy\.py/,
          run: [['out', ['Deployment [g]dep_01KcT2[/] "Weekly sales report"', '[d]Schedule: 0 20 * * 5 (America/New_York) · next run: Fri 20:00[/]']]],
          explain: 'A **scheduled deployment** fires a new session on the cron schedule. Anthropic hosts it all; each firing leaves a **deployment run** record. Pause, unpause or trigger manual runs any time.', terms: ['managed-agents'] },
      ],
    },
    {
      id: 'sdk-agent', title: 'Self-host an agent with the Agent SDK', level: 'Advanced', mins: 7,
      sub: 'Install the SDK, read the agent, run it locally, then package it as a container.',
      intro: 'The **Claude Agent SDK** puts Claude Code\'s engine in your own program. You run the loop and the tools, on your machines.',
      start: { inClaude: false, cwd: '~/sdk-agent', fxDir: '~/sdk-agent', files: ['~/sdk-agent/agent.py', '~/sdk-agent/Dockerfile'] },
      steps: [
        { do: 'Install the SDK', type: 'pip install claude-agent-sdk', match: /^(python -m )?pip3? install claude-agent-sdk/,
          run: [['out', ['Collecting claude-agent-sdk', '  Downloading claude_agent_sdk-0.2.x (includes the Claude Code binary)', '[g]Successfully installed claude-agent-sdk-0.2.x[/]']]],
          explain: 'Python 3.10+ (or `npm install @anthropic-ai/claude-agent-sdk` for TypeScript). Set `ANTHROPIC_API_KEY`, or use Bedrock/Vertex/Foundry with their env vars.', terms: ['agent-sdk'] },
        { do: 'Open Files → agent.py and read the explained lines', action: 'open:~/sdk-agent/agent.py', type: '(click 📁 Files → agent.py)',
          explain: 'Everything lives in `ClaudeAgentOptions`: tools, permission mode, working folder, caps. `query()` streams messages; `ResultMessage` reports turns and cost.', terms: ['agent-sdk', 'least-privilege'] },
        { do: 'Run it locally', type: 'python agent.py "Summarize sales.csv into report.md"', match: /^python3?\s+agent\.py/,
          run: [['pause', 500], ['out', ['I\'ll read sales.csv and write a short report.', '[d]  ⎿ Read(sales.csv)[/]', '[d]  ⎿ Write(report.md)[/]', 'Wrote report.md: total $4,040; Tea is the best-selling product (59%).', '[g]Done: 4 turns, $0.06[/]']]],
          explain: 'The same agent loop as Claude Code, but **you** run it: on your laptop now, in your servers later. No session runtime fee; you pay tokens plus your own infrastructure.', terms: ['agent-sdk', 'agentic-loop'] },
        { do: 'Package it as a container (ephemeral pattern)', type: 'docker build -t report-agent . && docker run --rm -e ANTHROPIC_API_KEY -e TASK_PROMPT="Summarize sales.csv" -v "$PWD/data:/workspace" report-agent', match: /^docker (build|run)/,
          run: [['out', ['[d]Successfully built report-agent[/]', 'Wrote report.md: total $4,040 …', '[g]Done: 4 turns, $0.06[/]', '[d](container exited: one task, then gone)[/]']]],
          explain: 'One container per task, non-root, data mounted at /workspace, key from the environment. Add an egress allowlist and a gateway for inbound auth in production. That is self-hosting.', terms: ['sandbox', 'agent-sdk'] },
      ],
    },
    {
      id: 'cowork', title: 'Cowork: let Claude do the busywork', level: 'Beginner', mins: 7,
      sub: 'Open the Claude app, connect a folder, approve a plan, review the results, and schedule it weekly.',
      intro: '**Cowork** does multi-step knowledge work for you: here, tidying a messy Downloads folder and building a receipts spreadsheet. Use the **Claude** app on the desktop (orange icon).',
      start: { inClaude: false, cwd: '~', files: DL, fxDir: '~/Downloads' },
      steps: [
        { do: 'Open the Claude desktop app (the orange Claude icon on the desktop)', action: 'cw:open', type: '(click the Claude icon)',
          explain: 'Chat and Cowork live in the same Claude app. The desktop app is what gives Cowork access to local folders, the browser and computer use.', terms: ['cowork'] },
        { do: 'Click "📁 Connect folder" in the Claude app and choose Downloads', action: 'cw:folder', type: '(click 📁 Connect folder)',
          explain: 'Least privilege: Claude can only reach the folder you connect. Use a dedicated working folder and keep backups of important files.', terms: ['least-privilege'] },
        { do: 'Type the task in the Claude app\'s message box', app: 'cowork', type: 'Sort my Downloads into folders by type and build a spreadsheet of my receipts with a total', keys: ['sort|organi|tidy', 'receipt|spreadsheet'],
          run: [
            ['cw-say', 'Here\'s my plan. Approve it or tell me what to change.'],
            ['cw-plan', ['Read all 6 files in Downloads', 'Create folders: Receipts, Photos, Installers, Notes', 'Move each file into the right folder', 'Extract date, vendor and amount from 3 receipts', 'Build receipts-2026.csv with a total row']],
            ['cw-progress', 'Reading 6 files…'], ['cw-progress', 'Found 3 receipts, 1 photo, 1 installer, 1 note'],
            ['cw-perm', 'Move 6 files into 4 new folders?'],
            ['cw-move', [['invoice-march.pdf', 'Receipts'], ['receipt-coffee.jpg', 'Receipts'], ['receipt-train.pdf', 'Receipts'], ['holiday-photo.jpg', 'Photos'], ['setup-old.exe', 'Installers'], ['notes.txt', 'Notes']]],
            ['cw-file', '~/Downloads/Receipts/receipts-2026.csv', L('date,vendor,amount', '2026-03-04,Acme Hosting,48.00', '2026-11-03,Bean There Café,6.40', '2026-11-10,City Rail,23.50', 'TOTAL,,77.90')],
            ['cw-say', 'Done! Downloads is sorted into **4 folders**, and **Receipts/receipts-2026.csv** lists 3 receipts totalling **$77.90**. (I can also make it an Excel file with formulas.)'],
          ],
          explain: 'Cowork **planned first**, waited for your OK, worked step by step, and asked before moving files (Manual mode). It produced a real file you can open.', terms: ['cowork', 'permission-mode'] },
        { do: 'Check its work: open Files → Downloads → Receipts → receipts-2026.csv', action: 'open:~/Downloads/Receipts/receipts-2026.csv', type: '(click 📁 Files → Downloads → Receipts → receipts-2026.csv)',
          explain: 'Always spot-check outputs (amounts, dates, names) before you rely on them or send them to anyone.', terms: ['hallucination'] },
        { do: 'Ask it to delete the old installer', app: 'cowork', type: 'delete the old installer', keys: ['delet|remove'],
          run: [['cw-perm', 'Delete Installers/setup-old.exe? This can\'t be undone.'], ['cw-delete', '~/Downloads/Installers/setup-old.exe'], ['cw-say', 'Deleted setup-old.exe (86 MB freed).']],
          explain: 'In Cowork, **deleting always asks** for your explicit Allow, whatever the permission mode.', terms: ['cowork'] },
        { do: 'Make it weekly with /schedule', app: 'cowork', type: '/schedule every Monday at 9am: sort new downloads and add new receipts to the spreadsheet', match: /^\/schedule/,
          run: [['cw-sched', 'Every Monday at 9:00 · Sort new downloads and add new receipts to receipts-2026.csv']],
          explain: '**Scheduled tasks** run on their own in the cloud (tasks using a local folder need the desktop app). Start simple and review the first few runs.', terms: ['cowork'] },
      ],
    },
  );
})(window.CCA);
