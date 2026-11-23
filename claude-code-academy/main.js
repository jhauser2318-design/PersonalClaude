// Claude Code Academy — Electron main process.
//
// Responsibilities:
//  * the app window (custom orange title bar, native window buttons)
//  * the API key: stored encrypted with the OS keychain (safeStorage), never
//    handed to the page
//  * the "Ask Claude" tutor: streams answers from the Claude API to the page
//  * the Python playground: runs the learner's snippet with their local Python
//  * opening every web link in the real browser, never inside the app

const { app, BrowserWindow, ipcMain, shell, safeStorage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const isDev = process.argv.includes('--dev');
let mainWindow = null;

// ---------------------------------------------------------------------------
// Settings (stored in the user's app-data folder)
// ---------------------------------------------------------------------------
const configPath = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  const cfg = readConfig();
  if (!cfg.apiKeyEnc) return '';
  try {
    if (cfg.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(cfg.apiKeyEnc, 'base64'));
    }
    return Buffer.from(cfg.apiKeyEnc, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function setApiKey(key) {
  const cfg = readConfig();
  if (!key) {
    delete cfg.apiKeyEnc;
    delete cfg.apiKeyEncrypted;
  } else if (safeStorage.isEncryptionAvailable()) {
    cfg.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
    cfg.apiKeyEncrypted = true;
  } else {
    cfg.apiKeyEnc = Buffer.from(key, 'utf8').toString('base64');
    cfg.apiKeyEncrypted = false;
  }
  writeConfig(cfg);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Claude Code Academy',
    backgroundColor: '#F5F1E8',
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? true : {
      color: '#00000000',
      symbolColor: '#C15F3C',
      height: 40,
    },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Every link opens in the user's browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC: settings
// ---------------------------------------------------------------------------
ipcMain.handle('settings:get', () => {
  const cfg = readConfig();
  const key = getApiKey();
  return {
    hasKey: Boolean(key),
    keyFromEnv: Boolean(process.env.ANTHROPIC_API_KEY),
    keyHint: key ? `${key.slice(0, 7)}…${key.slice(-4)}` : '',
    model: cfg.model || 'claude-opus-5-5',
    effort: cfg.effort || 'medium',
    pythonPath: cfg.pythonPath || '',
    version: app.getVersion(),
    platform: process.platform,
  };
});

ipcMain.handle('settings:setKey', (_e, key) => {
  const clean = String(key || '').trim();
  if (clean && !clean.startsWith('sk-ant-')) {
    return { ok: false, error: 'That does not look like an Anthropic API key (they start with "sk-ant-").' };
  }
  setApiKey(clean);
  return { ok: true };
});

ipcMain.handle('settings:set', (_e, patch) => {
  const cfg = readConfig();
  const allowed = ['model', 'effort', 'pythonPath'];
  for (const k of allowed) if (k in patch) cfg[k] = patch[k];
  writeConfig(cfg);
  return { ok: true };
});

ipcMain.handle('theme:set', (_e, mode) => {
  nativeTheme.themeSource = ['light', 'dark', 'system'].includes(mode) ? mode : 'system';
  if (mainWindow && process.platform !== 'darwin') {
    const dark = nativeTheme.shouldUseDarkColors;
    mainWindow.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: dark ? '#E8916E' : '#C15F3C',
      height: 40,
    });
  }
  return { ok: true };
});

ipcMain.handle('link:open', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ---------------------------------------------------------------------------
// IPC: the "Ask Claude" tutor (streaming)
// ---------------------------------------------------------------------------
const activeStreams = new Map();

// Models that accept the server-side refusal fallback. Claude Haiku 5.5 has
// no server-side fallback, so it is sent without one.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

ipcMain.handle('chat:send', async (event, { requestId, system, messages }) => {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: 'no-key' };

  const Anthropic = require('@anthropic-ai/sdk').default;
  const client = new Anthropic({ apiKey });
  const cfg = readConfig();
  const model = cfg.model || 'claude-opus-5-5';
  const effort = cfg.effort || 'medium';
  const send = (channel, payload) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, { requestId, ...payload });
  };

  const params = {
    model,
    max_tokens: 16000,
    output_config: { effort },
    // The tutor's long, stable knowledge base sits in the system prompt and is
    // cached, so follow-up questions are cheaper and faster.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  try {
    const stream = client.beta.messages.stream(params);
    activeStreams.set(requestId, stream);
    stream.on('text', (text) => send('chat:delta', { text }));
    const final = await stream.finalMessage();
    activeStreams.delete(requestId);
    send('chat:done', {
      stopReason: final.stop_reason,
      refusal: final.stop_reason === 'refusal'
        ? (final.stop_details && final.stop_details.explanation) || 'Claude declined to answer this one.'
        : null,
      model: final.model,
      usage: final.usage
        ? {
            input: final.usage.input_tokens,
            output: final.usage.output_tokens,
            cacheRead: final.usage.cache_read_input_tokens || 0,
          }
        : null,
    });
    return { ok: true };
  } catch (err) {
    activeStreams.delete(requestId);
    const message = describeApiError(err, Anthropic);
    send('chat:error', { error: message });
    return { ok: false, error: message };
  }
});

ipcMain.handle('chat:stop', (_e, requestId) => {
  const s = activeStreams.get(requestId);
  if (s) {
    s.abort();
    activeStreams.delete(requestId);
  }
  return { ok: true };
});

function describeApiError(err, Anthropic) {
  if (err instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.';
  if (err instanceof Anthropic.NotFoundError) return 'That model was not found. Pick another one in Settings.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and try again.';
  if (err instanceof Anthropic.BadRequestError) return `The API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIStatusError) {
    return err.status >= 500
      ? `Anthropic's servers had a problem (${err.status}). Try again shortly.`
      : `API error (${err.status}): ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your internet connection.';
  if (err && err.name === 'APIUserAbortError') return 'Stopped.';
  return (err && err.message) || 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// IPC: Python playground (runs on the learner's own computer)
// ---------------------------------------------------------------------------
function pythonCandidates() {
  const cfg = readConfig();
  const list = [];
  if (cfg.pythonPath) list.push([cfg.pythonPath, []]);
  if (process.platform === 'win32') list.push(['py', ['-3']], ['python', []], ['python3', []]);
  else list.push(['python3', []], ['python', []]);
  return list;
}

function runWith(cmd, preArgs, file, stdinText) {
  return new Promise((resolve) => {
    let out = '';
    let errText = '';
    let finished = false;
    let child;
    try {
      child = spawn(cmd, [...preArgs, '-I', file], { windowsHide: true });
    } catch (e) {
      resolve({ notFound: true });
      return;
    }
    const timer = setTimeout(() => {
      if (!finished) {
        child.kill();
        resolve({ ok: true, stdout: out, stderr: errText + '\n⏱ Stopped after 10 seconds (possible infinite loop).', code: -1 });
        finished = true;
      }
    }, 10000);
    child.stdout.on('data', (d) => { out += d.toString(); if (out.length > 200000) child.kill(); });
    child.stderr.on('data', (d) => { errText += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      if (!finished) { finished = true; resolve({ notFound: e.code === 'ENOENT', error: e.message }); }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!finished) { finished = true; resolve({ ok: true, stdout: out, stderr: errText, code }); }
    });
    if (stdinText) child.stdin.write(stdinText);
    child.stdin.end();
  });
}

ipcMain.handle('python:run', async (_e, { code, stdin }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-py-'));
  const file = path.join(dir, 'snippet.py');
  fs.writeFileSync(file, String(code || ''), 'utf8');
  try {
    for (const [cmd, pre] of pythonCandidates()) {
      const r = await runWith(cmd, pre, file, stdin || '');
      if (r.notFound) continue;
      if (r.ok) return { ok: true, stdout: r.stdout, stderr: r.stderr, code: r.code, interpreter: [cmd, ...pre].join(' ') };
    }
    return { ok: false, error: 'python-missing' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
