import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, session } from 'electron';
import { isOperationsNavigation, operationsURL } from './instance.js';

function configuredEntry(): URL {
  if (!app.isPackaged) return operationsURL(process.env.ZGLOSTO_DESKTOP_ORIGIN, true);
  const config: { origin?: unknown } = JSON.parse(
    readFileSync(join(__dirname, 'instance.json'), 'utf8'),
  );
  return operationsURL(config.origin);
}

function openOperationsWindow(entry: URL): BrowserWindow {
  const instance = createHash('sha256').update(entry.origin).digest('hex');
  const profile = session.fromPartition(`persist:zglosto-operations-${instance}`, { cache: false });
  profile.setPermissionCheckHandler(() => false);
  profile.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 580,
    title: 'ZgłosTO Desktop',
    webPreferences: {
      session: profile,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame || !isOperationsNavigation(event.url, entry)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => {
    if (!event.isMainFrame || !isOperationsNavigation(event.url, entry)) event.preventDefault();
  });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame && !isOperationsNavigation(url, entry)) load();
  });

  let showingError = false;
  async function showConnectionError() {
    if (showingError || window.isDestroyed()) return;
    showingError = true;
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message: 'Nie można otworzyć panelu operacyjnego',
      detail: `Sprawdź połączenie z instancją ${entry.host}.`,
      buttons: ['Spróbuj ponownie', 'Zamknij'],
      cancelId: 1,
    });
    showingError = false;
    if (window.isDestroyed()) return;
    if (response === 0) load();
    else window.close();
  }

  function load() {
    void window.loadURL(entry.href).catch(() => {});
  }

  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) void showConnectionError();
  });
  contents.on('render-process-gone', () => void showConnectionError());
  load();
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const showWindow = () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }
    try {
      openOperationsWindow(configuredEntry());
    } catch (error: unknown) {
      dialog.showErrorBox(
        'ZgłosTO Desktop',
        error instanceof Error ? error.message : 'Nie można odczytać adresu instancji.',
      );
      app.quit();
    }
  };

  async function start() {
    await app.whenReady();
    showWindow();
    app.on('activate', showWindow);
    app.on('second-instance', showWindow);
  }

  void start();
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
