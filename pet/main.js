const { app, BrowserWindow, ipcMain, Menu, shell, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let dragOffset = null;
let chatOpen = false;

// Fix cache lock: use a dedicated userData path for the pet app
app.setPath('userData', path.join(app.getPath('appData'), 'JesusAI-Pet'));

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function fetchJSON(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ status: 'online' });
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

const PET_WIDTH = 200;
const PET_HEIGHT = 200;
const CHAT_WIDTH = 580;
const CHAT_HEIGHT = 520;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x: width - PET_WIDTH - 20,
    y: height - PET_HEIGHT - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('pet.html');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Auto-generate preload.js
const preloadContent = `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvis', {
  getStatus: () => ipcRenderer.invoke('get-jarvis-status'),
  openCockpit: () => ipcRenderer.invoke('open-cockpit'),
  moveToCenter: () => ipcRenderer.invoke('move-to-center'),
  closePet: () => ipcRenderer.invoke('close-pet'),
  startDrag: (screenX, screenY) => ipcRenderer.send('drag-start', screenX, screenY),
  onDrag: (screenX, screenY) => ipcRenderer.send('drag-move', screenX, screenY),
  stopDrag: () => ipcRenderer.send('drag-stop'),
  showMenu: () => ipcRenderer.send('show-context-menu'),
  toggleChat: (isOpen) => ipcRenderer.send('toggle-chat', isOpen),
});
`;
fs.writeFileSync(path.join(__dirname, 'preload.js'), preloadContent, 'utf-8');

let clampShift = { x: 0, y: 0 };

ipcMain.on('toggle-chat', (e, isOpen) => {
  if (!mainWindow) return;
  chatOpen = isOpen;
  const [x, y] = mainWindow.getPosition();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  if (isOpen) {
    // Posição ideal para manter o pet (canto inferior direito) parado
    let idealX = x - (CHAT_WIDTH - PET_WIDTH);
    let idealY = y - (CHAT_HEIGHT - PET_HEIGHT);
    
    // Evita que a janela saia da tela
    let clampedX = Math.max(0, Math.min(idealX, width - CHAT_WIDTH));
    let clampedY = Math.max(0, Math.min(idealY, height - CHAT_HEIGHT));
    
    // Salva o quanto a janela foi "empurrada" para caber na tela
    clampShift.x = clampedX - idealX;
    clampShift.y = clampedY - idealY;
    
    mainWindow.setBounds({ x: Math.round(clampedX), y: Math.round(clampedY), width: CHAT_WIDTH, height: CHAT_HEIGHT });
  } else {
    // Volta para a posição original, desfazendo o "empurrão" se houver
    let idealX = x + (CHAT_WIDTH - PET_WIDTH) - clampShift.x;
    let idealY = y + (CHAT_HEIGHT - PET_HEIGHT) - clampShift.y;
    
    // Garante que o pet não feche fora da tela (caso tenha sido arrastado pra fora)
    let clampedX = Math.max(0, Math.min(idealX, width - PET_WIDTH));
    let clampedY = Math.max(0, Math.min(idealY, height - PET_HEIGHT));
    
    // Reseta o shift
    clampShift = { x: 0, y: 0 };
    
    mainWindow.setBounds({ x: Math.round(clampedX), y: Math.round(clampedY), width: PET_WIDTH, height: PET_HEIGHT });
  }
});

ipcMain.handle('get-jarvis-status', async () => {
  const result = await fetchJSON('http://localhost:3000/api/health');
  return result ? { online: true, ...result } : { online: false };
});

ipcMain.handle('open-cockpit', () => {
  shell.openExternal('http://localhost:3000/cockpit/');
  return true;
});

ipcMain.handle('move-to-center', () => {
  if (!mainWindow) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const w = chatOpen ? CHAT_WIDTH : PET_WIDTH;
  const h = chatOpen ? CHAT_HEIGHT : PET_HEIGHT;
  mainWindow.setPosition(Math.round(width / 2 - w / 2), Math.round(height / 2 - h / 2));
});

ipcMain.handle('close-pet', () => {
  app.quit();
});

// Drag via IPC
ipcMain.on('drag-start', (e, screenX, screenY) => {
  if (!mainWindow) return;
  const [winX, winY] = mainWindow.getPosition();
  dragOffset = { x: screenX - winX, y: screenY - winY };
});

ipcMain.on('drag-move', (e, screenX, screenY) => {
  if (!mainWindow || !dragOffset) return;
  mainWindow.setPosition(screenX - dragOffset.x, screenY - dragOffset.y);
});

ipcMain.on('drag-stop', () => {
  dragOffset = null;
});

// Context Menu
ipcMain.on('show-context-menu', () => {
  if (!mainWindow) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Cockpit', click: () => shell.openExternal('http://localhost:3000/cockpit/') },
    { label: 'Abrir Chat Web', click: () => shell.openExternal('http://localhost:3000') },
    {
      label: 'Mover pro Centro',
      click: () => {
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        const w = chatOpen ? CHAT_WIDTH : PET_WIDTH;
        const h = chatOpen ? CHAT_HEIGHT : PET_HEIGHT;
        mainWindow.setPosition(Math.round(width / 2 - w / 2), Math.round(height / 2 - h / 2));
      }
    },
    { type: 'separator' },
    { label: 'Fechar Companion', click: () => app.quit() }
  ]);
  menu.popup({ window: mainWindow });
});

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
