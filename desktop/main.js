const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const PORT = 8765;
const URL = `http://127.0.0.1:${PORT}`;

let backendProcess = null;

function waitForBackend(maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryConnect = () => {
      http.get(URL, (res) => {
        res.resume();
        resolve();
      }).on('error', () => {
        attempts++;
        if (attempts >= maxAttempts) reject(new Error('Backend did not start in time. Check that port 8765 is free.'));
        else setTimeout(tryConnect, 400);
      });
    };
    tryConnect();
  });
}

function createWindow() {
  let iconOption = {};
  try {
    const p = path.join(__dirname, 'icon.jpeg');
    const png = path.join(__dirname, 'icon.png');
    if (fs.existsSync(p)) iconOption = { icon: p };
    else if (fs.existsSync(png)) iconOption = { icon: png };
  } catch (_) {}

  const win = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 700,
    minHeight: 600,
    title: 'VPN Connect',
    ...iconOption,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  win.loadURL(URL);
  let shown = false;
  const showWin = () => {
    if (!shown) {
      shown = true;
      win.show();
      win.focus();
    }
  };
  win.once('ready-to-show', showWin);
  setTimeout(showWin, 4000);
  win.on('closed', () => { app.quit(); });
}

function startBackend() {
  const installDir = __dirname;
  const serverPath = path.join(installDir, 'server.py');
  const staticDir = path.join(installDir, 'dist');

  if (!fs.existsSync(serverPath)) {
    console.error('server.py not found at', serverPath);
    app.quit();
    return;
  }

  const env = { ...process.env, VPN_CONNECT_STATIC: staticDir };
  backendProcess = spawn('python3', [serverPath, '--port=' + PORT, '--no-browser'], {
    cwd: installDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (d) => process.stdout.write(d.toString()));
  backendProcess.stderr.on('data', (d) => process.stderr.write(d.toString()));
  backendProcess.on('error', (err) => {
    console.error('Backend failed to start:', err);
    app.quit();
  });
  backendProcess.on('exit', (code) => {
    if (code != null && code !== 0) console.error('Backend exited with code', code);
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForBackend();
    createWindow();
  } catch (e) {
    console.error(e.message);
    stopBackend();
    app.quit();
  }
});

app.on('before-quit', stopBackend);
app.on('window-all-closed', () => { app.quit(); });
