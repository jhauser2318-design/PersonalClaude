/* Python basics: short lessons with runnable examples, a practice task and
   a quick check each. Runs on the learner's own Python install.          */
window.CCA = window.CCA || {};
CCA.PY_LESSONS = [
  {
    id: 'py1', title: 'Hello, Python', icon: '👋',
    body: `
Python is a programming language famous for reading almost like English. It's the most popular language for AI, data and automation, and it's what most Claude API examples use.

## Your first program
\`print()\` shows text on the screen. Text goes inside quotes, and is called a **string**.

> [!TIP] Click **Run** below. The code runs with the Python installed on your computer. Edit it and run again; you can't break anything.

## Comments
Anything after \`#\` is a note for humans. Python ignores it.
`,
    code: '# My first Python program\nprint("Hello, Claude!")\nprint("2 + 3 =", 2 + 3)',
    task: 'Change the program so it prints your name and the result of 7 × 6 (use * for multiply).',
    check: { q: 'What does print("4" + "4") show?', options: ['8', '44', 'Error', '"4" + "4"'], a: 1, why: 'Quotes make them strings; + joins strings together: "44".' },
  },
  {
    id: 'py2', title: 'Variables & types', icon: '📦',
    body: `
A **variable** is a labelled box that holds a value. You create one with \`=\`.

| Type | Example | Meaning |
|---|---|---|
| \`str\` | \`"Claude"\` | text |
| \`int\` | \`42\` | whole number |
| \`float\` | \`3.14\` | decimal number |
| \`bool\` | \`True\` / \`False\` | yes/no |
| \`None\` | \`None\` | "nothing here" |

\`type(x)\` tells you what kind of value \`x\` holds. Convert between types with \`int()\`, \`float()\`, \`str()\`.

## f-strings
Put \`f\` before the quotes and \`{variables}\` inside: the cleanest way to build text.
`,
    code: 'model = "Opus"\ntokens = 1500\nprice_per_million = 4.0\n\ncost = tokens / 1_000_000 * price_per_million\nprint(f"{model} used {tokens} tokens, costing ${cost:.4f}")\nprint(type(model), type(tokens), type(cost))',
    task: 'Add a variable output_tokens = 300 with a price of 20.0 per million, and print the total cost of input + output.',
    check: { q: 'What is type(3 / 2) in Python 3?', options: ['int', 'float', 'str', 'bool'], a: 1, why: '/ always returns a float (1.5). Use // for whole-number division.' },
  },
  {
    id: 'py3', title: 'Strings', icon: '🔤',
    body: `
Strings have handy built-in **methods** (functions attached to a value):

| Method | Result |
|---|---|
| \`"hi".upper()\` | \`"HI"\` |
| \`"  hi ".strip()\` | \`"hi"\` |
| \`"a,b,c".split(",")\` | \`["a", "b", "c"]\` |
| \`"-".join(["a","b"])\` | \`"a-b"\` |
| \`"claude code".replace("code", "API")\` | \`"claude API"\` |
| \`"code" in "claude code"\` | \`True\` |

**Indexing:** \`s[0]\` is the first character, \`s[-1]\` the last, \`s[0:3]\` the first three (a **slice**).
`,
    code: 'email = "  Ana+Shop@Mail.com "\nclean = email.strip().lower()\nprint(clean)\nlocal, domain = clean.split("@")\nprint("local part:", local)\nprint("domain:", domain)\nprint("has a plus?", "+" in local)',
    task: 'Print just the part of the local name before the "+" (hint: split again).',
    check: { q: 'What does "python"[0:2] return?', options: ['"py"', '"pyt"', '"p"', '"on"'], a: 0, why: 'Slices include the start index and stop BEFORE the end index: characters 0 and 1.' },
  },
  {
    id: 'py4', title: 'Lists & dictionaries', icon: '🗂️',
    body: `
## Lists: ordered collections
\`\`\`python
tools = ["Read", "Edit", "Bash"]
tools.append("Grep")      # add to the end
tools[0]                  # "Read"
len(tools)                # 4
\`\`\`

## Dictionaries: key → value lookups
\`\`\`python
agent = {"name": "reviewer", "model": "sonnet", "tools": ["Read", "Grep"]}
agent["model"]            # "sonnet"
agent["max_turns"] = 10   # add a key
agent.get("color", "none")# safe lookup with a default
\`\`\`

> [!NOTE] Dictionaries look exactly like **JSON**, the format the Claude API, settings.json and .mcp.json all use. Learn dicts and you can read all of them.
`,
    code: 'subagent = {\n    "name": "test-runner",\n    "tools": ["Read", "Bash"],\n    "model": "haiku",\n}\nsubagent["tools"].append("Grep")\nprint(subagent["name"], "can use", len(subagent["tools"]), "tools:")\nfor t in subagent["tools"]:\n    print(" -", t)',
    task: 'Add a "description" key and print it. Then remove "Bash" from the tools list with .remove().',
    check: { q: 'What does {"a": 1}.get("b", 0) return?', options: ['Error', 'None', '0', '1'], a: 2, why: '.get() returns the default (0) when the key is missing, without raising an error.' },
  },
  {
    id: 'py5', title: 'If / else decisions', icon: '🔀',
    body: `
\`if\` runs code only when a condition is True. **Indentation** (4 spaces) shows which lines belong to the block. In Python, indentation is not optional!

Comparison operators: \`==\` equal, \`!=\` not equal, \`<\` \`>\` \`<=\` \`>=\`. Combine with \`and\`, \`or\`, \`not\`.
`,
    code: 'stop_reason = "tool_use"\n\nif stop_reason == "tool_use":\n    print("Run the tool, then call the API again")\nelif stop_reason == "end_turn":\n    print("Claude is finished")\nelif stop_reason == "max_tokens":\n    print("Cut off: raise max_tokens")\nelse:\n    print("Something else:", stop_reason)',
    task: 'Add a branch for "refusal" that prints "Claude declined this request".',
    check: { q: 'Which line is the correct comparison?', options: ['if x = 5:', 'if x == 5:', 'if x === 5:', 'if (x equals 5)'], a: 1, why: '= assigns a value; == compares. Python has no ===.' },
  },
  {
    id: 'py6', title: 'Loops', icon: '🔁',
    body: `
## for: repeat for each item
\`\`\`python
for name in ["Read", "Edit"]:
    print(name)
for i in range(3):        # 0, 1, 2
    print(i)
\`\`\`

## while: repeat while a condition holds
\`\`\`python
turns = 0
while turns < 3:
    turns += 1
\`\`\`
\`break\` exits a loop early; \`continue\` skips to the next round.

> [!EXAM] An agent loop is literally a \`while True:\` loop that \`break\`s when \`stop_reason\` isn't \`"tool_use"\`.
`,
    code: '# A fake agent loop\nreplies = ["tool_use", "tool_use", "end_turn"]\nturn = 0\nwhile True:\n    stop = replies[turn]\n    print(f"turn {turn + 1}: stop_reason = {stop}")\n    if stop != "tool_use":\n        break\n    print("   -> running a tool...")\n    turn += 1\nprint("Agent finished after", turn + 1, "turns")',
    task: 'Use a for loop with enumerate() to print each item of ["Read","Edit","Bash"] with its number.',
    check: { q: 'What does range(2, 5) produce?', options: ['2,3,4,5', '2,3,4', '3,4,5', '0,1,2,3,4'], a: 1, why: 'range stops before the end value.' },
  },
  {
    id: 'py7', title: 'Functions', icon: '🧩',
    body: `
A **function** packages code under a name so you can reuse it. \`def\` defines it; \`return\` sends a value back.

\`\`\`python
def greet(name, excited=False):
    msg = f"Hi {name}"
    return msg + "!" if excited else msg
\`\`\`

- **Parameters** are the inputs (\`name\`, \`excited\`). \`excited=False\` is a **default value**.
- A docstring (\`"""..."""\`) right under \`def\` explains what it does.
- **Type hints** like \`def total(items: list[dict]) -> float:\` document expected types.

> [!NOTE] When you define a Claude **tool**, you're describing a function: its name, what it does, and its parameters. Exactly what you're learning here.
`,
    code: 'def cart_total(items: list[dict], discount_pct: float = 0) -> float:\n    """Sum price * qty and apply a percentage discount (0-100)."""\n    if not 0 <= discount_pct <= 100:\n        raise ValueError("discount must be between 0 and 100")\n    subtotal = sum(i["price"] * i["qty"] for i in items)\n    return round(subtotal * (1 - discount_pct / 100), 2)\n\nprint(cart_total([{"price": 10, "qty": 2}, {"price": 5, "qty": 1}]))\nprint(cart_total([{"price": 50, "qty": 1}], 10))',
    task: 'Call cart_total with a 150% discount and see the error. Then make items default to an empty list safely.',
    check: { q: 'What does a function return if it has no return statement?', options: ['0', 'An error', 'None', 'The last variable'], a: 2, why: 'Functions without return give back None.' },
  },
  {
    id: 'py8', title: 'Errors & files', icon: '🛟',
    body: `
## Handling errors
\`try\` / \`except\` catches problems so your program can recover instead of crashing.
\`\`\`python
try:
    n = int("abc")
except ValueError as e:
    print("Not a number:", e)
\`\`\`
Catch **specific** exceptions (\`ValueError\`, \`FileNotFoundError\`), not everything. (The Claude SDK does this too: \`RateLimitError\`, \`AuthenticationError\`…)

## Reading & writing files
\`\`\`python
with open("notes.txt", "w", encoding="utf-8") as f:
    f.write("hello\\n")
with open("notes.txt", encoding="utf-8") as f:
    print(f.read())
\`\`\`
\`with\` closes the file automatically.

## JSON
\`import json\`, then \`json.dumps(obj)\` → text, \`json.loads(text)\` → Python dict.
`,
    code: 'import json\n\nraw = \'{"vendor": "Acme", "total": "120.50", "due_date": null}\'\ndata = json.loads(raw)\n\ntry:\n    total = float(data["total"])\n    print("Total as number:", total)\n    print("Due date:", data["due_date"] or "not provided")\n    print(data["tax"])\nexcept KeyError as e:\n    print("Missing field:", e)',
    task: 'Change "total" to "abc" and add an except ValueError branch that prints a friendly message.',
    check: { q: 'json.loads() takes … and returns …', options: ['a dict → text', 'text → a Python object (e.g. dict)', 'a file path → text', 'a list → a dict'], a: 1, why: 'loads = load from a string; dumps = dump to a string.' },
  },
  {
    id: 'py9', title: 'Modules, pip & virtual environments', icon: '📦',
    body: `
## Importing
\`\`\`python
import math
from datetime import date
print(math.sqrt(16), date.today())
\`\`\`

## Installing packages with pip
Packages from PyPI (the Python Package Index) install with **pip**:
\`\`\`bash
python -m pip install anthropic
\`\`\`

## Virtual environments (venv)
Keep each project's packages separate:
\`\`\`bash
python -m venv .venv
# Windows
.venv\\Scripts\\activate
# macOS / Linux
source .venv/bin/activate
pip install -r requirements.txt
\`\`\`
> [!TIP] A \`requirements.txt\` lists a project's packages so anyone can reinstall them, exactly like the one in your Life Control Center app!
`,
    code: 'import sys, platform, math, random\nfrom datetime import date\n\nprint("Python", sys.version.split()[0], "on", platform.system())\nprint("Today is", date.today())\nprint("Square root of 144:", math.sqrt(144))\nprint("Random dice roll:", random.randint(1, 6))',
    task: 'Import the statistics module and print the mean of [3, 7, 8, 10].',
    check: { q: 'Why use a virtual environment?', options: ['It makes Python faster', 'It isolates each project\'s packages and versions', 'It is required to run print()', 'It encrypts your code'], a: 1, why: 'venvs prevent version clashes between projects.' },
  },
  {
    id: 'py10', title: 'Classes (the basics)', icon: '🏛️',
    body: `
A **class** is a blueprint for objects that bundle data (attributes) and behavior (methods).
\`\`\`python
class Agent:
    def __init__(self, name, tools):
        self.name = name          # attribute
        self.tools = tools
    def can_use(self, tool):      # method
        return tool in self.tools
\`\`\`
\`__init__\` runs when you create an object; \`self\` is the object itself.

You'll mostly **use** classes from libraries (e.g. \`anthropic.Anthropic()\` creates a client object) before writing your own.
`,
    code: 'class Agent:\n    def __init__(self, name, tools):\n        self.name = name\n        self.tools = tools\n\n    def can_use(self, tool):\n        return tool in self.tools\n\n    def __repr__(self):\n        return f"Agent({self.name!r}, {len(self.tools)} tools)"\n\nreviewer = Agent("reviewer", ["Read", "Grep"])\nprint(reviewer)\nprint("Can edit?", reviewer.can_use("Edit"))',
    task: 'Add a method add_tool(self, tool) that appends a tool, then give the reviewer "Glob".',
    check: { q: 'What is self inside a method?', options: ['The class name', 'The object the method was called on', 'A global variable', 'The parent class'], a: 1, why: 'self refers to the specific instance.' },
  },
  {
    id: 'py11', title: 'Python + the Claude API', icon: '✨',
    body: `
Everything comes together! The official SDK: \`pip install anthropic\`. Set your key in an environment variable called \`ANTHROPIC_API_KEY\` (never paste keys into code).

\`\`\`python
import anthropic

client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    messages=[{"role": "user", "content": "Explain a Python list in one sentence."}],
)
for block in response.content:
    if block.type == "text":
        print(block.text)
\`\`\`

## A tiny agent with a tool
\`\`\`python
tools = [{
    "name": "get_weather",
    "description": "Current weather for a city. Use when the user asks about weather.",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
}]

messages = [{"role": "user", "content": "Should I bring an umbrella in Paris?"}]
while True:
    resp = client.messages.create(model="claude-opus-5-5", max_tokens=16000,
                                  tools=tools, messages=messages)
    messages.append({"role": "assistant", "content": resp.content})
    if resp.stop_reason != "tool_use":
        break
    results = []
    for block in resp.content:
        if block.type == "tool_use":
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": "Rain, 12°C"})   # your real code goes here
    messages.append({"role": "user", "content": results})

print(next(b.text for b in resp.content if b.type == "text"))
\`\`\`
That's the [[agentic-loop]] from the exam, in about 20 lines of Python.

> [!NOTE] The playground below runs offline. It simulates the loop without calling the API, so you can study the control flow for free.
`,
    code: '# Offline simulation of the agent loop (no API key needed)\nfake_api = [\n    {"stop_reason": "tool_use", "tool": "get_weather", "input": {"city": "Paris"}},\n    {"stop_reason": "end_turn", "text": "Yes, bring an umbrella: rain and 12°C."},\n]\n\ndef run_tool(name, args):\n    return "Rain, 12°C" if name == "get_weather" else "unknown tool"\n\nmessages = [{"role": "user", "content": "Umbrella in Paris?"}]\nfor resp in fake_api:\n    messages.append({"role": "assistant", "content": resp})\n    if resp["stop_reason"] != "tool_use":\n        print("Claude:", resp["text"])\n        break\n    result = run_tool(resp["tool"], resp["input"])\n    print(f"Tool {resp[\'tool\']}({resp[\'input\']}) -> {result}")\n    messages.append({"role": "user", "content": [{"type": "tool_result", "content": result}]})\n\nprint(len(messages), "messages in history")',
    task: 'Add a second tool call to fake_api (e.g. get_forecast) before end_turn, and handle it in run_tool.',
    check: { q: 'In the agent loop, when do you stop?', options: ['When the reply has text', 'When stop_reason is not "tool_use"', 'After 1 turn', 'When the tool fails'], a: 1, why: 'stop_reason drives the loop: exactly what the Architect exam tests.' },
  },

  {
    id: 'py12', title: 'Mini RAG in pure Python', icon: '🔍',
    body: `
**Retrieval-augmented generation (RAG)** finds the most relevant pieces of a knowledge base and gives only those to Claude. Here's the core idea in about 30 lines of standard-library Python, no packages needed.

## How it works
1. **Tokenize**: split text into lowercase words.
2. **Index**: count words in each note, and in how many notes each word appears.
3. **Score**: words that match the question score points; **rare** words count more (that's the *IDF* idea used by search engines).
4. **Retrieve** the top notes and build a prompt that tells Claude to answer only from them.

> [!NOTE] Real systems use **embeddings** (vectors that capture meaning) and a vector database, often combined with keyword search like this one (hybrid search). See **Context & Memory → RAG from first principles**.

## Try it
Run the code, then change the question (e.g. *"How do subagents help with context?"*) and watch which notes are retrieved.
`,
    code: "# Mini RAG: find the most relevant notes for a question (pure Python, no libraries)\nimport math\nimport re\nfrom collections import Counter\n\nnotes = {\n    \"claude_md\": \"CLAUDE.md is project memory. Claude Code loads it at the start of every session. Put build commands, conventions and gotchas there.\",\n    \"compact\": \"Use /compact with focus instructions when the conversation gets long. Summaries can lose exact numbers, so keep key facts in a file.\",\n    \"caching\": \"Prompt caching reuses an identical prompt prefix. Put stable content first and changing content last. A timestamp in the system prompt breaks the cache.\",\n    \"subagents\": \"Subagents explore in their own context window and return a short summary, keeping the main conversation clean.\",\n    \"projects\": \"Claude chat Projects store knowledge files and instructions. Large project knowledge is retrieved as needed.\",\n}\n\ndef tokenize(text):\n    return re.findall(r\"[a-z0-9]+\", text.lower())\n\n# 1. Index: count words per note, and in how many notes each word appears\ndocs = {name: Counter(tokenize(text)) for name, text in notes.items()}\ndoc_freq = Counter(word for counts in docs.values() for word in counts)\nN = len(docs)\n\ndef score(question, counts):\n    total = 0.0\n    for word in tokenize(question):\n        if word in counts:\n            idf = math.log((N + 1) / (doc_freq[word] + 0.5))   # rare words matter more\n            total += counts[word] * idf\n    return total\n\ndef retrieve(question, k=2):\n    ranked = sorted(docs, key=lambda name: score(question, docs[name]), reverse=True)\n    return [name for name in ranked[:k] if score(question, docs[name]) > 0]\n\n# 2. Retrieve, then build the prompt you would send to Claude\nquestion = \"Why did my prompt cache stop working after I added a timestamp?\"\ntop = retrieve(question)\nprint(\"Retrieved:\", top)\n\ncontext = \"\\n\".join(f\"<doc id='{name}'>{notes[name]}</doc>\" for name in top)\nprompt = f\"{context}\\n\\nUsing only the documents above, answer: {question}\"\nprint(prompt)\n",
    task: 'Add a new note about "skills load only their description until needed" and ask a question that should retrieve it. Then change k to 1.',
    check: { q: 'Why do rare words get a higher score in this retriever?', options: ['They are longer', 'They distinguish one document from the others better than common words', 'Python sorts them first', 'They are always nouns'], a: 1, why: 'Common words appear everywhere and carry little signal; rare matching words point to the right document.' },
  },
];

CCA.PY_CERTS = [
  { name: 'PCEP™: Certified Entry-Level Python Programmer', org: 'Python Institute', level: 'Entry', icon: '🥉',
    what: 'Python fundamentals: data types, control flow, loops, functions, lists, dicts, tuples, exceptions. About 30 questions, 40 minutes, online-proctored via OpenEDG.',
    fit: 'The perfect first cert. Everything in this app\'s Python Basics tab maps to it.', prep: 'Free official course "Python Essentials 1" on edube.org (OpenEDG) + Cisco Networking Academy.',
    url: 'https://pythoninstitute.org/pcep', course: 'https://edube.org/' },
  { name: 'PCAP™: Certified Associate Python Programmer', org: 'Python Institute', level: 'Associate', icon: '🥈',
    what: 'Modules & packages, exceptions, strings, object-oriented programming (classes, inheritance), generators, closures, file processing.',
    fit: 'Next step after PCEP; shows you can build real programs. Good before building Claude agents in Python.', prep: 'Free official course "Python Essentials 2" on edube.org.',
    url: 'https://pythoninstitute.org/pcap', course: 'https://edube.org/' },
  { name: 'PCPP1™: Certified Professional Python Programmer, Level 1', org: 'Python Institute', level: 'Professional', icon: '🥇',
    what: 'Advanced OOP, best practices (PEP 8/257), GUI programming, network programming & REST APIs, file processing.',
    fit: 'Advanced; optional once you\'re building production tools.', prep: 'Python Institute advanced courses.', url: 'https://pythoninstitute.org/pcpp1' },
  { name: 'CS50\'s Introduction to Programming with Python (CS50P)', org: 'Harvard / edX', level: 'Course certificate', icon: '🎓',
    what: 'Free, excellent university course: functions, conditionals, loops, exceptions, libraries, unit tests, file I/O, regex, OOP, plus a final project.',
    fit: 'The best free structured course. Free certificate from CS50 (paid verified one on edX).', prep: 'Watch the lectures, do the problem sets.', url: 'https://cs50.harvard.edu/python/' },
  { name: 'Scientific Computing with Python', org: 'freeCodeCamp', level: 'Course certificate', icon: '🔥',
    what: 'Free, project-based certification: build several projects to earn it.',
    fit: 'Hands-on and free. Great for building a portfolio.', prep: 'Do it in the browser on freecodecamp.org.', url: 'https://www.freecodecamp.org/learn/scientific-computing-with-python/' },
  { name: 'Google IT Automation with Python', org: 'Google / Coursera', level: 'Professional certificate', icon: '🤖',
    what: 'Python for automating real tasks: files, regex, Git & GitHub, debugging, configuration management, cloud.',
    fit: 'Very practical, and close to how you\'ll use Claude Code (automation + git).', prep: 'Coursera subscription (financial aid available).', url: 'https://www.coursera.org/professional-certificates/google-it-automation' },
];

CCA.PY_LINKS = [
  ['Official Python Tutorial', 'https://docs.python.org/3/tutorial/', 'The canonical beginner tutorial from python.org'],
  ['Download Python', 'https://www.python.org/downloads/', 'Install Python (tick "Add python.exe to PATH" on Windows)'],
  ['Automate the Boring Stuff with Python', 'https://automatetheboringstuff.com/', 'Free online book: practical automation for beginners'],
  ['CS50P (Harvard)', 'https://cs50.harvard.edu/python/', 'Free university course with problem sets'],
  ['Real Python', 'https://realpython.com/', 'Hundreds of clear tutorials on every topic'],
  ['Exercism: Python track', 'https://exercism.org/tracks/python', 'Free exercises with mentor feedback'],
  ['Python Institute: certifications', 'https://pythoninstitute.org/certification-tracks', 'PCEP → PCAP → PCPP exam details'],
  ['OpenEDG Edube (free PCEP/PCAP courses)', 'https://edube.org/', 'Official free prep for Python Institute exams'],
  ['Anthropic Python SDK', 'https://github.com/anthropics/anthropic-sdk-python', 'pip install anthropic: call Claude from Python'],
  ['Claude Agent SDK for Python', 'https://github.com/anthropics/claude-agent-sdk-python', 'Build agents with Claude Code\'s engine'],
  ['PEP 8 Style Guide', 'https://peps.python.org/pep-0008/', 'How to write clean, standard Python'],
  ['Python Tutor (visualize code)', 'https://pythontutor.com/', 'See your code run step by step'],
];
