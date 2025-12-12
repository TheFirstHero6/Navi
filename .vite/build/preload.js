"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  windowMinimize: () => electron.ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => electron.ipcRenderer.invoke("window-maximize"),
  windowClose: () => electron.ipcRenderer.invoke("window-close"),
  // Persistent storage methods
  getPreferences: () => electron.ipcRenderer.invoke("get-preferences"),
  savePreferences: (preferences) => electron.ipcRenderer.invoke("save-preferences", preferences),
  detectTerminals: () => electron.ipcRenderer.invoke("detect-terminals"),
  // Window mode methods
  setWindowMode: (mode) => electron.ipcRenderer.invoke("set-window-mode", mode),
  toggleWindowVisibility: () => electron.ipcRenderer.invoke("toggle-window-visibility"),
  getWindowMode: () => electron.ipcRenderer.invoke("get-window-mode"),
  setWindowHeight: (height) => electron.ipcRenderer.invoke("set-window-height", height),
  resetWindowMaxHeight: () => electron.ipcRenderer.invoke("reset-window-max-height"),
  // Listen for window mode changes
  onWindowModeChanged: (callback) => {
    electron.ipcRenderer.on("window-mode-changed", (event, mode) => callback(mode));
  },
  onFocusInput: (callback) => {
    electron.ipcRenderer.on("focus-input", () => callback());
  }
});
