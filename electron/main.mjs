import { app, BrowserWindow, screen, session, shell } from "electron";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

let mainWindow;
let localUrl;

const projectRoot = path.resolve(import.meta.dirname, "..");
const iconPath = path.join(projectRoot, "src", "jobhuntr-logo.png");
app.setName("JobHuntr");
app.setPath(
  "userData",
  process.env.JOBHUNTR_USER_DATA_DIR ||
    path.join(app.getPath("appData"), "JobHuntr"),
);
const windowStatePath = () =>
  process.env.JOBHUNTR_WINDOW_STATE_PATH ||
  path.join(app.getPath("userData"), "window-state.json");
const readWindowState = () => {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), "utf8"));
    if (
      Number.isFinite(state.width) &&
      Number.isFinite(state.height) &&
      state.width >= 390 &&
      state.height >= 640
    )
      return state;
  } catch {}
  return { width: 1440, height: 900 };
};
const saveWindowState = (window) => {
  try {
    const target = windowStatePath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(
      temporary,
      JSON.stringify({
        ...window.getNormalBounds(),
        maximized: window.isMaximized(),
      }),
      { mode: 0o600 },
    );
    fs.renameSync(temporary, target);
  } catch (error) {
    console.warn("Could not save JobHuntr window state:", error.message);
  }
};
const visibleWindowState = (state) => {
  const display = screen.getDisplayMatching({
    x: state.x || 0,
    y: state.y || 0,
    width: state.width,
    height: state.height,
  });
  const area = display.workArea;
  const width = Math.min(state.width, area.width);
  const height = Math.min(state.height, area.height);
  return {
    ...state,
    width,
    height,
    x: Number.isFinite(state.x)
      ? Math.min(Math.max(state.x, area.x), area.x + area.width - width)
      : undefined,
    y: Number.isFinite(state.y)
      ? Math.min(Math.max(state.y, area.y), area.y + area.height - height)
      : undefined,
  };
};
const isLocalTarget = (target, localOrigin) => {
  try {
    return new URL(target).origin === localOrigin;
  } catch {
    return false;
  }
};
const openSafeExternal = (target) => {
  try {
    const parsed = new URL(target);
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) return;
    void shell.openExternal(parsed.href);
  } catch {}
};
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

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
  const localOrigin = new URL(url).origin;
  const windowState = visibleWindowState(readWindowState());

  mainWindow = new BrowserWindow({
    title: "JobHuntr",
    ...windowState,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#ffffff",
    icon: iconPath,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      safeDialogs: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isLocalTarget(target, localOrigin))
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            safeDialogs: true,
          },
        },
      };
    openSafeExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (isLocalTarget(target, localOrigin)) return;
    event.preventDefault();
    openSafeExternal(target);
  });
  mainWindow.on("close", () => saveWindowState(mainWindow));
  if (windowState.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(url);
};

app.whenReady().then(async () => {
  const allowedPermissions = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    allowedPermissions.has(permission),
  );
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) =>
      callback(allowedPermissions.has(permission)),
  );
  if (process.platform === "darwin") app.dock.setIcon(iconPath);
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
