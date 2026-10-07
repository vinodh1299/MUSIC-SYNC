const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    title: "Duotone - Synced Music & Video",
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    icon: path.join(__dirname, "../public/favicon.ico"),
  });

  Menu.setApplicationMenu(null);

  // Target URL: supports local dev, custom environment URL, or deployed production server
  const targetUrl =
    process.env.ELECTRON_START_URL ||
    process.env.DUOTONE_URL ||
    "https://music-sync-git-main-vinodh1299s-projects.vercel.app";

  mainWindow.loadURL(targetUrl);

  // Open external links (e.g. YouTube web links, help, external auth) in system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Single instance lock to prevent duplicate windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
