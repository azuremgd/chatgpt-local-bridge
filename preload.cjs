const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('consoleAPI', {
  invoke: (command, payload) => ipcRenderer.invoke('console:invoke', command, payload),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('console:state', listener); return () => ipcRenderer.removeListener('console:state', listener); }
});
