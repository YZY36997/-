/** 预加载脚本：暴露安全 API 给前端 */
import { contextBridge, ipcRenderer } from 'electron';
import { ACTIONS, CHANNEL } from './channels.js';

const api = {
  invoke: (action: string, args?: any) => ipcRenderer.invoke(CHANNEL, action, args),
  ACTIONS,
  onEvent: (channel: string, cb: (data: any) => void) => {
    const h = (_e: any, d: any) => cb(d);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  }
};

contextBridge.exposeInMainWorld('lingmo', api);

// 允许前端区分运行环境
contextBridge.exposeInMainWorld('__LINGMO__', { platform: 'electron', version: '1.0.0' });
