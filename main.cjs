const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true, // Hides the classic menu bar for an elegant standalone app experience
    icon: path.join(__dirname, 'dist', 'arka_logo.png'), // Windows app icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Load the built index.html from dist
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  
  // Maximize the window for full-screen POS layout
  win.maximize();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
