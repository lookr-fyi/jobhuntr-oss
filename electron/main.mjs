import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

let mainWindow;
let localUrl;
let tray;
let forceQuit = false;
let checkingClose = false;
let allowWindowCloseOnce = false;
let syncingTray = false;

const LOCAL_REQUEST_TIMEOUT_MS = Math.max(
  50,
  Math.min(
    Number(process.env.JOBHUNTR_LOCAL_REQUEST_TIMEOUT_MS) || 5_000,
    30_000,
  ),
);

const projectRoot = path.resolve(import.meta.dirname, "..");
const iconPath = path.join(projectRoot, "src", "jobhuntr-logo.png");
const preloadPath = path.join(projectRoot, "electron", "preload.cjs");
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
    if (parsed.username || parsed.password) return;
    void shell.openExternal(parsed.href);
  } catch {}
};
const hardenWebContents = (contents, localOrigin) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url: target }) => {
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
  contents.on("will-navigate", (event, target) => {
    if (isLocalTarget(target, localOrigin)) return;
    event.preventDefault();
    openSafeExternal(target);
  });
};
const showMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};
const stopInfiniteHunt = async () => {
  if (!localUrl) return;
  const response = await fetch(`${localUrl}/api/infinite-hunt/stop`, {
    method: "POST",
    signal: AbortSignal.timeout(LOCAL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`Infinite Hunt stop failed with ${response.status}`);
};
const ensureTray = () => {
  if (tray) return tray;
  tray = new Tray(iconPath);
  tray.setToolTip("JobHuntr — Infinite Hunt is running");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show JobHuntr", click: showMainWindow },
      {
        label: "Stop Infinite Hunt",
        click: async () => {
          try {
            await stopInfiniteHunt();
            tray?.destroy();
            tray = undefined;
          } catch (error) {
            console.warn("Could not stop Infinite Hunt:", error.message);
          }
          showMainWindow();
        },
      },
      { type: "separator" },
      {
        label: "Quit JobHuntr",
        click: () => {
          forceQuit = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", showMainWindow);
  return tray;
};
const syncTrayState = async () => {
  if (!tray || !localUrl || syncingTray) return;
  syncingTray = true;
  try {
    const response = await fetch(`${localUrl}/api/state`, {
      signal: AbortSignal.timeout(LOCAL_REQUEST_TIMEOUT_MS),
    });
    const state = response.ok ? await response.json() : null;
    if (!state?.infiniteHunt?.enabled) {
      tray.destroy();
      tray = undefined;
      // If the window was hidden because a close-time status check was
      // inconclusive (or because a hunt later stopped in the background),
      // honor the original close intent once the service confirms there is
      // no active hunt. Never leave a headless process with no tray affordance.
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        allowWindowCloseOnce = true;
        mainWindow.close();
      }
    }
  } catch {
  } finally {
    syncingTray = false;
  }
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
      preload: preloadPath,
    },
  });

  mainWindow.removeMenu();
  ipcMain.removeAllListeners("jobhuntr:close-window");
  ipcMain.on("jobhuntr:close-window", (event) => {
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents
    )
      return;
    mainWindow.close();
  });
  hardenWebContents(mainWindow.webContents, localOrigin);
  mainWindow.webContents.on("did-create-window", (childWindow) => {
    hardenWebContents(childWindow.webContents, localOrigin);
  });
  mainWindow.on("close", async (event) => {
    saveWindowState(mainWindow);
    if (forceQuit || allowWindowCloseOnce) {
      allowWindowCloseOnce = false;
      return;
    }
    event.preventDefault();
    // A second native close can arrive while the asynchronous hunt-status
    // request is still pending. Keep every repeated event cancelled so a
    // rapid double-close cannot bypass the tray handoff.
    if (checkingClose) return;
    checkingClose = true;
    try {
      const response = await fetch(`${localUrl}/api/state`, {
        signal: AbortSignal.timeout(LOCAL_REQUEST_TIMEOUT_MS),
      });
      const state = response.ok ? await response.json() : null;
      if (state?.infiniteHunt?.enabled) {
        ensureTray();
        mainWindow.hide();
        return;
      }
      allowWindowCloseOnce = true;
      mainWindow.close();
    } catch (error) {
      console.warn("Could not verify Infinite Hunt status:", error.message);
      // Fail safe: if the local service is temporarily busy, destroying the
      // only window could also strand or terminate an active hunt. Preserve
      // the process in the tray until its bounded status check can recover;
      // the tray still exposes an explicit Quit action.
      ensureTray();
      mainWindow.hide();
      return;
    } finally {
      checkingClose = false;
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  if (windowState.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(url);
  if (process.env.JOBHUNTR_DESKTOP_SMOKE === "1") {
    console.log("JOBHUNTR_DESKTOP_READY");
    forceQuit = true;
    app.quit();
  }
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
    const traySync = setInterval(syncTrayState, 5000);
    traySync.unref?.();
  } catch (error) {
    console.error(error);
    app.quit();
  }
});

app.on("before-quit", () => {
  forceQuit = true;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  else showMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
