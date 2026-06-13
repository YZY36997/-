const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  getApiPort: () => ipcRenderer.invoke('get-api-port'),
  platform: process.platform
});
