// The only bridge between the page and the main process. The page never sees
// the API key or Node.js; it can only call these named functions.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('academy', {
  isDesktop: true,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setKey: (key) => ipcRenderer.invoke('settings:setKey', key),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  setTheme: (mode) => ipcRenderer.invoke('theme:set', mode),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  chat: {
    send: (payload) => ipcRenderer.invoke('chat:send', payload),
    stop: (requestId) => ipcRenderer.invoke('chat:stop', requestId),
    onDelta: (cb) => ipcRenderer.on('chat:delta', (_e, d) => cb(d)),
    onDone: (cb) => ipcRenderer.on('chat:done', (_e, d) => cb(d)),
    onError: (cb) => ipcRenderer.on('chat:error', (_e, d) => cb(d)),
  },
  python: {
    run: (code, stdin) => ipcRenderer.invoke('python:run', { code, stdin }),
  },
});
