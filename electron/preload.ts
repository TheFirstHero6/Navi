import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  // Persistent storage methods
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: (preferences: any) => ipcRenderer.invoke('save-preferences', preferences),
  detectTerminals: () => ipcRenderer.invoke('detect-terminals'),
  // Window mode methods
  setWindowMode: (mode: 'minimal' | 'full') => ipcRenderer.invoke('set-window-mode', mode),
  toggleWindowVisibility: () => ipcRenderer.invoke('toggle-window-visibility'),
  getWindowMode: () => ipcRenderer.invoke('get-window-mode'),
    setWindowHeight: (height: number) => ipcRenderer.invoke('set-window-height', height),
    resetWindowMaxHeight: () => ipcRenderer.invoke('reset-window-max-height'),
  // Listen for window mode changes
  onWindowModeChanged: (callback: (mode: 'minimal' | 'full') => void) => {
    ipcRenderer.on('window-mode-changed', (event, mode) => callback(mode));
  },
  onFocusInput: (callback: () => void) => {
    ipcRenderer.on('focus-input', () => callback());
  },
});

