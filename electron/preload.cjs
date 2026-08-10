const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jobHuntrDesktop", {
  close: () => ipcRenderer.send("jobhuntr:close-window"),
});
