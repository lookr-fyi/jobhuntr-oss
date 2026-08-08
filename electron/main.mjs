import { app, BrowserWindow, shell } from "electron";
import net from "node:net";
import path from "node:path";

let mainWindow;
let localUrl;

const projectRoot = path.resolve(import.meta.dirname, "..");

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const waitForServer = async (url) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The local JobHuntr service did not start.");
};

const startServer = async () => {
  if (localUrl) return localUrl;
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const dataDir =
    process.env.JOBHUNTR_DATA_DIR || path.join(app.getPath("userData"), "data");

  process.env.NODE_ENV = "production";
  process.env.HOST = "127.0.0.1";
  process.env.PORT = String(port);
  process.env.JOBHUNTR_DATA_DIR = dataDir;
  await import(path.join(projectRoot, "server", "index.mjs"));
  await waitForServer(url);
  localUrl = url;
  return url;
};

const createWindow = async () => {
  const url = await startServer();

  mainWindow = new BrowserWindow({
    title: "JobHuntr",
    width: 1440,
    height: 900,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) return { action: "allow" };
    void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(url);
};

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error(error);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
