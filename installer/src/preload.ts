import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object

contextBridge.exposeInMainWorld('installer', {
  getInstallInfo: () => ipcRenderer.invoke('get-install-info'),
  getLatestVersion: (beta: boolean = false) => ipcRenderer.invoke('get-latest-version', beta),
  selectInstallPath: () => ipcRenderer.invoke('select-install-path'),
  install: (installPath: string, addToPath: boolean, beta: boolean = false) =>
    ipcRenderer.invoke('install', installPath, addToPath, beta),
  getVersion: () => ipcRenderer.invoke('get-version'),
  // Listen for progress updates during installation
  onProgress: (callback: (data: { message: string; percent: number }) => void) => {
    ipcRenderer.on('install-progress', (_event: unknown, data: { message: string; percent: number }) => callback(data));
  },
  // Listen for warning messages during installation
  onWarning: (callback: (message: string) => void) => {
    ipcRenderer.on('install-warning', (_event: unknown, message: string) => callback(message));
  },
  // Remove all install listeners
  removeListeners: () => {
    ipcRenderer.removeAllListeners('install-progress');
    ipcRenderer.removeAllListeners('install-warning');
  },
});
