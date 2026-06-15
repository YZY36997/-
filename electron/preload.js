/** preload：向前端暴露安全的 lingmo API */
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  invoke: (action, args) => ipcRenderer.invoke('lingmo:invoke', action, args),
  onEvent: (channel, cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
};
contextBridge.exposeInMainWorld('lingmo', api);
