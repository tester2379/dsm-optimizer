/**
 * Windows Optimizer — Electron main process
 * System tray app with health monitoring GUI
 */

'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// ── Admin elevation — relaunch as admin if not elevated ─────────────────────

let _isAdmin = false;
try {
  execSync('net session', { stdio: 'pipe', timeout: 5000 });
  _isAdmin = true;
} catch {}

if (!_isAdmin && !process.argv.includes('--no-admin')) {
  // Try to relaunch as admin (UAC prompt)
  try {
    const electronExe = process.execPath;
    const appPath = path.resolve(__dirname);
    const psCmd = `Start-Process -FilePath '${electronExe.replace(/'/g, "''")}' -ArgumentList '${appPath.replace(/'/g, "''")}','--no-admin' -Verb RunAs`;
    execSync(`powershell -Command "${psCmd}"`, { stdio: 'ignore', timeout: 10000 });
    // Elevated instance launched — exit this one
    process.exit(0);
  } catch {
    // UAC denied or failed — continue without admin
    console.log('Admin elevation skipped — running without admin rights.');
  }
}

// ── Full logging — catches everything ───────────────────────────────────────
const LOG_DIR = path.join(__dirname, 'logs');
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function logToFile(msg, level = 'INFO') {
  const ts = new Date().toLocaleString('en-MT');
  const line = `[${ts}] [${level}] ${msg}\n`;
  try {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    fs.appendFileSync(path.join(LOG_DIR, `optimizer-${dateStr}.log`), line);
  } catch {}
  if (level === 'ERROR') console.error(line.trim());
  else console.log(line.trim());
}

// Catch all uncaught errors
process.on('uncaughtException', (err) => {
  logToFile('UNCAUGHT EXCEPTION: ' + err.message + '\n' + err.stack, 'ERROR');
});
process.on('unhandledRejection', (reason) => {
  logToFile('UNHANDLED REJECTION: ' + String(reason), 'ERROR');
});
process.on('exit', (code) => {
  logToFile('Process exiting with code ' + code);
});

// Single instance — prevent multiple copies running
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logToFile('Another instance already running — quitting.');
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (win) { win.show(); win.focus(); }
});

logToFile('Windows Optimizer starting (admin: true)...');

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'icon.ico'),
  });

  win.loadFile(path.join(__dirname, 'gui', 'index.html'));

  // Close minimizes to system tray (quit only from tray menu)
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
      logToFile('Window hidden to tray.');
    }
  });
}

function createTray() {
  // Destroy old tray if exists (prevents duplicate icons)
  if (tray) { try { tray.destroy(); } catch {} tray = null; }
  // Use icon.ico for tray, fallback to data URL
  let icon;
  const icoPath = path.join(__dirname, 'icon.ico');
  if (fs.existsSync(icoPath)) {
    icon = nativeImage.createFromPath(icoPath);
  } else {
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA3ElEQVQ4T6WTsQ3CQBBE3y4hoAMkZyRUQAd0QEgHJFdgSkCiAxISKjglkBM4s9LJ+O5sS5Z8wU72aGd2/sJfK/y9fwFYAhfgJOkR+KoaFpKWQAuYS9pI2kn6jpYSMOoD+JZ0D3T/ADaSTpK2BcAQ2EuaJLUPADxKakjaZkMKwE7SC7AB3sDnL+1GE0kvYPIHsJXUzofEkfQKzKJgBFwlXbMhNQGJKDgC+6z/DSRdgT4wynuCAWzVPIBvklrAAtgDY0nbGoBo7Mus5v+IIXA2pwXM01pZ3h/gB+8LOBHvJBlUAAAAAElFTkSuQmCC');
  }
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Optimizer', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Quick Optimize', click: () => { win.show(); win.webContents.send('run-command', 'optimize'); } },
    { label: 'Virus Scan', click: () => { win.show(); win.webContents.send('run-command', 'scan'); } },
    { label: 'Check Updates', click: () => { win.show(); win.webContents.send('run-command', 'update'); } },
    { type: 'separator' },
    { label: 'Restart Windows', click: () => { win.webContents.send('run-command', 'restart'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('Windows Optimizer');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (win.isVisible()) { win.hide(); }
    else { win.show(); win.focus(); }
  });
}

app.whenReady().then(() => {
  logToFile('App ready — creating window and tray.');
  try {
    createWindow();
    logToFile('Window created.');
  } catch (e) {
    logToFile('Window creation failed: ' + e.message, 'ERROR');
  }
  try {
    createTray();
    logToFile('Tray icon created.');
  } catch (e) {
    logToFile('Tray creation failed: ' + e.message, 'ERROR');
  }
  // Apply max performance settings on startup if enabled
  try {
    applyMaxPerformanceOnStartup();
  } catch (e) {
    logToFile('Max performance startup apply failed: ' + e.message, 'ERROR');
  }
});

app.on('window-all-closed', (e) => {
  // Don't quit — stay in tray
  logToFile('All windows closed — staying in tray.');
});

app.on('before-quit', () => {
  logToFile('App quitting.');
  app.isQuitting = true;
});

// ── Devices registry — track all optimizer installations ─────────────────────

const DEVICES_FILE = path.join(__dirname, 'devices.json');

function loadDevices() {
  try { return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8')); } catch { return []; }
}

function saveDevices(devices) {
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
}

// ── Scheduler — runs tasks at configured times ──────────────────────────────

const SCHEDULE_FILE = path.join(__dirname, 'schedules.json');

function loadSchedules() {
  try { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')); } catch { return []; }
}

function saveSchedules(schedules) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2), 'utf8');
}

// Check every minute if a scheduled task should run
let _lastCheckedMinute = -1;
setInterval(() => {
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  if (minute === _lastCheckedMinute) return;
  _lastCheckedMinute = minute;

  const schedules = loadSchedules();
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  let changed = false;

  for (const sched of schedules) {
    if (!sched.enabled) continue;

    let shouldRun = false;

    if (sched.intervalHours) {
      // Interval-based: run every X hours
      const lastRun = sched.lastRun || 0;
      const elapsed = (Date.now() - lastRun) / 3600000; // hours since last run
      if (elapsed >= sched.intervalHours) {
        shouldRun = true;
        sched.lastRun = Date.now();
        changed = true;
      }
    } else if (sched.time === timeStr) {
      // Daily at fixed time
      shouldRun = true;
    }

    if (shouldRun) {
      const label = sched.intervalHours ? `every ${sched.intervalHours}h` : `at ${sched.time}`;
      logToFile(`Scheduler: running "${sched.task}" (${label})`);
      const optimizer = require('./optimizer-api');
      optimizer.run(sched.task).then(result => {
        logToFile(`Scheduler: "${sched.task}" completed: ${JSON.stringify(result).slice(0, 100)}`);
        if (win && !win.isDestroyed()) win.webContents.send('schedule-ran', { time: sched.time || label, task: sched.task, result });
      }).catch(e => {
        logToFile(`Scheduler: "${sched.task}" failed: ${e.message}`, 'ERROR');
      });
    }
  }

  if (changed) saveSchedules(schedules);
}, 30000); // Check every 30 seconds

ipcMain.handle('get-schedules', () => loadSchedules());

ipcMain.handle('save-schedules', (_, schedules) => {
  saveSchedules(schedules);
  logToFile('Schedules updated: ' + schedules.length + ' task(s)');
  return true;
});

// ── IPC: System info ────────────────────────────────────────────────────────

const { exec } = require('child_process');

function run(cmd, timeout = 10000) {
  return new Promise(resolve => {
    exec(cmd, { timeout, shell: true }, (err, stdout) => {
      resolve((stdout || '').trim());
    });
  });
}

function runSync(cmd, timeout = 10000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, shell: true, stdio: 'pipe' }).trim(); } catch { return ''; }
}

ipcMain.handle('get-system-info', async () => {
  const info = {};

  // Run all queries in parallel
  const [cpuLoad, cpuName, cpuCores, ramFree, ramTotal, diskOut, bootTime, netTest, defenderStatus, procCount, topProcs] = await Promise.all([
    await run('wmic cpu get LoadPercentage /value'),
    await run('wmic cpu get Name /value'),
    await run('wmic cpu get NumberOfLogicalProcessors /value'),
    await run('wmic OS get FreePhysicalMemory /value'),
    await run('wmic OS get TotalVisibleMemorySize /value'),
    await run('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /value'),
    await run('wmic OS get LastBootUpTime /value'),
    await run('ping -n 1 -w 2000 8.8.8.8'),
    await run('powershell -Command "(Get-MpComputerStatus).RealTimeProtectionEnabled"'),
    await run('powershell -Command "(Get-Process).Count"'),
    await run('powershell -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 5 Name, @{N=\'MB\';E={[math]::Round($_.WorkingSet/1MB)}} | ConvertTo-Json"'),
  ]);

  // CPU
  try {
    info.cpu = parseInt(cpuLoad.match(/LoadPercentage=(\d+)/)?.[1] || '0');
    info.cpuName = (cpuName.match(/Name=(.+)/)?.[1] || 'Unknown').trim();
    info.cpuCores = parseInt(cpuCores.match(/=(\d+)/)?.[1] || '0');
  } catch { info.cpu = 0; }

  // RAM
  try {
    const free = parseInt(ramFree.match(/=(\d+)/)?.[1] || '0');
    const total = parseInt(ramTotal.match(/=(\d+)/)?.[1] || '1');
    info.ramFreeGB = (free / 1024 / 1024).toFixed(1);
    info.ramTotalGB = (total / 1024 / 1024).toFixed(1);
    info.ramUsedPct = Math.round((1 - free / total) * 100);
  } catch { info.ramUsedPct = 0; }

  // Disk
  try {
    const free = parseInt(diskOut.match(/FreeSpace=(\d+)/)?.[1] || '0');
    const total = parseInt(diskOut.match(/Size=(\d+)/)?.[1] || '1');
    info.diskFreeGB = (free / 1024 / 1024 / 1024).toFixed(1);
    info.diskTotalGB = (total / 1024 / 1024 / 1024).toFixed(1);
    info.diskUsedPct = Math.round((1 - free / total) * 100);
  } catch { info.diskUsedPct = 0; }

  // Uptime
  try {
    const m = bootTime.match(/LastBootUpTime=(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (m) {
      const bootDate = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
      const upMs = Date.now() - bootDate.getTime();
      info.uptimeDays = Math.floor(upMs / 86400000);
      info.uptimeHours = Math.floor((upMs % 86400000) / 3600000);
      info.uptimeMinutes = Math.floor((upMs % 3600000) / 60000);
    }
  } catch {}

  // Network
  info.networkUp = netTest.includes('Reply from');

  // Defender
  info.defenderActive = defenderStatus.includes('True');
  info.defenderLastUpdate = '';

  // Processes
  info.processCount = parseInt(procCount) || 0;

  // Top processes
  try { info.topProcesses = JSON.parse(topProcs || '[]'); } catch { info.topProcesses = []; }

  return info;
});

// ── IPC: Run optimizer commands ─────────────────────────────────────────────

ipcMain.handle('run-optimizer', async (_, command) => {
  const optimizer = require('./optimizer-api');
  return optimizer.run(command);
});

ipcMain.handle('get-config', () => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; }
});

ipcMain.handle('save-config', (_, config) => {
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
  return true;
});

// ── IPC: Running apps ───────────────────────────────────────────────────────

ipcMain.handle('get-running-apps', async () => {
  try {
    const output = await run('powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object Id, ProcessName, @{N=\'MemMB\';E={[math]::Round($_.WorkingSet/1MB)}}, MainWindowTitle | Sort-Object -Property MemMB -Descending | ConvertTo-Json -Depth 1"', 15000);
    if (output) return JSON.parse(output);
  } catch {}
  return [];
});

ipcMain.handle('close-app', async (_, pid, gentle) => {
  try {
    if (gentle) {
      // Gentle: send WM_CLOSE first, wait 5s, then force
      await run('powershell -Command "Stop-Process -Id ' + pid + ' -ErrorAction SilentlyContinue"', 10000);
    } else {
      await run('taskkill /F /PID ' + pid, 5000);
    }
    return true;
  } catch { return false; }
});

ipcMain.handle('close-all-non-system', async () => {
  try {
    const systemApps = ['explorer', 'electron', 'node', 'svchost', 'System', 'csrss', 'dwm', 'taskhostw', 'sihost', 'fontdrvhost', 'lsass', 'services', 'winlogon', 'smss', 'wininit', 'RuntimeBroker'];
    const output = await run('powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object Id, ProcessName | ConvertTo-Json -Depth 1"', 10000);
    if (!output) return 0;
    const apps = JSON.parse(output);
    let closed = 0;
    for (const app of (Array.isArray(apps) ? apps : [apps])) {
      if (systemApps.some(s => app.ProcessName.toLowerCase().includes(s.toLowerCase()))) continue;
      try { await run('powershell -Command "Stop-Process -Id ' + app.Id + ' -ErrorAction SilentlyContinue"', 5000); closed++; } catch {}
    }
    return closed;
  } catch { return 0; }
});

// ── IPC: Deep Uninstaller ───────────────────────────────────────────────────

ipcMain.handle('get-installed-apps', async () => {
  try {
    const output = await run('powershell -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -ne $null} | Select-Object DisplayName, DisplayVersion, Publisher, EstimatedSize, UninstallString, InstallLocation | Sort-Object DisplayName | ConvertTo-Json -Depth 1"', 30000);
    if (output) {
      const apps = JSON.parse(output);
      return (Array.isArray(apps) ? apps : [apps]).map(a => ({
        name: a.DisplayName || '',
        version: a.DisplayVersion || '',
        publisher: a.Publisher || '',
        sizeMB: a.EstimatedSize ? Math.round(a.EstimatedSize / 1024) : 0,
        uninstallCmd: a.UninstallString || '',
        installPath: a.InstallLocation || '',
      }));
    }
  } catch {}
  return [];
});

ipcMain.handle('uninstall-app', async (_, uninstallCmd) => {
  if (!uninstallCmd) return { ok: false, error: 'No uninstall command' };
  try {
    // Run the uninstaller
    const result = await run(uninstallCmd.replace('/I', '/X').replace('/i', '/x') + ' /quiet /norestart 2>nul', 120000);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('deep-clean-app', async (_, installPath, appName) => {
  const cleaned = [];
  // 1. Remove install directory
  if (installPath && fs.existsSync(installPath)) {
    try { fs.rmSync(installPath, { recursive: true, force: true }); cleaned.push('Install folder'); } catch {}
  }
  // 2. Clean AppData
  const appData = [
    path.join(process.env.APPDATA || '', appName),
    path.join(process.env.LOCALAPPDATA || '', appName),
    path.join(process.env.APPDATA || '', appName.replace(/\s/g, '')),
    path.join(process.env.LOCALAPPDATA || '', appName.replace(/\s/g, '')),
  ];
  for (const dir of appData) {
    if (fs.existsSync(dir)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); cleaned.push('AppData: ' + path.basename(dir)); } catch {}
    }
  }
  // 3. Clean registry (user keys)
  try {
    await run('reg delete "HKCU\\Software\\' + appName + '" /f 2>nul');
    cleaned.push('Registry HKCU');
  } catch {}
  // 4. Remove from startup
  try {
    await run('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "' + appName + '" /f 2>nul');
  } catch {}
  // 5. Clean temp files
  try {
    await run('del /q /s "%TEMP%\\*' + appName.replace(/\s/g, '') + '*" 2>nul');
  } catch {}

  return { cleaned };
});

// ── IPC: Startup Manager (real registry entries) ─────────────────────────────

ipcMain.handle('get-startup-entries', async () => {
  const entries = [];
  // Read HKCU\...\Run (enabled)
  try {
    const hkcuRun = await run('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" 2>nul');
    for (const line of hkcuRun.split('\n')) {
      const m = line.match(/^\s+(\S+)\s+REG_SZ\s+(.+)$/i);
      if (m) entries.push({ name: m[1], path: m[2].trim(), hive: 'HKCU', enabled: true });
    }
  } catch {}
  // Read HKCU\...\RunDisabled (disabled)
  try {
    const hkcuDis = await run('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunDisabled" 2>nul');
    for (const line of hkcuDis.split('\n')) {
      const m = line.match(/^\s+(\S+)\s+REG_SZ\s+(.+)$/i);
      if (m) entries.push({ name: m[1], path: m[2].trim(), hive: 'HKCU', enabled: false });
    }
  } catch {}
  // Read HKLM\...\Run (enabled)
  try {
    const hklmRun = await run('reg query "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" 2>nul');
    for (const line of hklmRun.split('\n')) {
      const m = line.match(/^\s+(\S+)\s+REG_SZ\s+(.+)$/i);
      if (m) entries.push({ name: m[1], path: m[2].trim(), hive: 'HKLM', enabled: true });
    }
  } catch {}
  // Read HKLM\...\RunDisabled (disabled)
  try {
    const hklmDis = await run('reg query "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunDisabled" 2>nul');
    for (const line of hklmDis.split('\n')) {
      const m = line.match(/^\s+(\S+)\s+REG_SZ\s+(.+)$/i);
      if (m) entries.push({ name: m[1], path: m[2].trim(), hive: 'HKLM', enabled: false });
    }
  } catch {}
  return entries;
});

ipcMain.handle('toggle-startup-entry', async (_, name, hive, currentlyEnabled) => {
  const runKey = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
  const disabledKey = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\RunDisabled`;
  try {
    if (currentlyEnabled) {
      // Read current value, add to RunDisabled, delete from Run
      const valOut = await run(`reg query "${runKey}" /v "${name}" 2>nul`);
      const m = valOut.match(/REG_SZ\s+(.+)$/im);
      if (m) {
        // Ensure RunDisabled key exists
        await run(`reg add "${disabledKey}" /f 2>nul`);
        await run(`reg add "${disabledKey}" /v "${name}" /t REG_SZ /d "${m[1].trim()}" /f`);
        await run(`reg delete "${runKey}" /v "${name}" /f`);
      }
    } else {
      // Move from RunDisabled back to Run
      const valOut = await run(`reg query "${disabledKey}" /v "${name}" 2>nul`);
      const m = valOut.match(/REG_SZ\s+(.+)$/im);
      if (m) {
        await run(`reg add "${runKey}" /v "${name}" /t REG_SZ /d "${m[1].trim()}" /f`);
        await run(`reg delete "${disabledKey}" /v "${name}" /f`);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: Disk Space Analyzer ────────────────────────────────────────────────

ipcMain.handle('get-disk-analysis', async () => {
  const result = { folders: [], browserCaches: [], tempFolders: [] };

  // Top folders on C: — use dir to get sizes quickly
  const topFolders = ['C:\\Users', 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData'];
  const folderPromises = topFolders.map(async (folder) => {
    try {
      const out = await run(`powershell -Command "(Get-ChildItem '${folder}' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`, 30000);
      const bytes = parseInt(out) || 0;
      return { path: folder, sizeMB: Math.round(bytes / 1024 / 1024), sizeGB: (bytes / 1024 / 1024 / 1024).toFixed(1) };
    } catch { return { path: folder, sizeMB: 0, sizeGB: '0.0' }; }
  });
  result.folders = await Promise.all(folderPromises);

  // Browser caches
  const caches = [
    { name: 'Chrome', path: process.env.LOCALAPPDATA + '\\Google\\Chrome\\User Data\\Default\\Cache' },
    { name: 'Edge', path: process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\User Data\\Default\\Cache' },
    { name: 'Firefox', path: process.env.LOCALAPPDATA + '\\Mozilla\\Firefox\\Profiles' },
    { name: 'Brave', path: process.env.LOCALAPPDATA + '\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache' },
  ];
  for (const c of caches) {
    try {
      if (fs.existsSync(c.path)) {
        const out = await run(`powershell -Command "(Get-ChildItem '${c.path}' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`, 15000);
        const bytes = parseInt(out) || 0;
        result.browserCaches.push({ name: c.name, sizeMB: Math.round(bytes / 1024 / 1024) });
      } else {
        result.browserCaches.push({ name: c.name, sizeMB: 0 });
      }
    } catch { result.browserCaches.push({ name: c.name, sizeMB: 0 }); }
  }

  // Temp folders
  const temps = [
    { name: 'Windows Temp', path: 'C:\\Windows\\Temp' },
    { name: 'User Temp', path: process.env.TEMP || '' },
    { name: 'Prefetch', path: 'C:\\Windows\\Prefetch' },
    { name: 'Crash Dumps', path: (process.env.LOCALAPPDATA || '') + '\\CrashDumps' },
    { name: 'Thumbnail Cache', path: (process.env.LOCALAPPDATA || '') + '\\Microsoft\\Windows\\Explorer' },
    { name: 'SoftwareDistribution', path: 'C:\\Windows\\SoftwareDistribution\\Download' },
  ];
  for (const t of temps) {
    try {
      if (t.path && fs.existsSync(t.path)) {
        const out = await run(`powershell -Command "(Get-ChildItem '${t.path}' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`, 15000);
        const bytes = parseInt(out) || 0;
        result.tempFolders.push({ name: t.name, sizeMB: Math.round(bytes / 1024 / 1024) });
      } else {
        result.tempFolders.push({ name: t.name, sizeMB: 0 });
      }
    } catch { result.tempFolders.push({ name: t.name, sizeMB: 0 }); }
  }

  return result;
});

// ── IPC: Network Monitor ────────────────────────────────────────────────────

let _lastNetBytes = null;
let _lastNetTime = null;

ipcMain.handle('get-network-info', async () => {
  const info = { adapter: '', speed: '', bytesSent: 0, bytesRecv: 0, sendRate: 0, recvRate: 0 };

  try {
    // Adapter name and speed
    const adapterOut = await run('powershell -Command "Get-NetAdapter | Where-Object Status -eq Up | Select-Object -First 1 Name, LinkSpeed | ConvertTo-Json"');
    if (adapterOut) {
      const adapter = JSON.parse(adapterOut);
      info.adapter = adapter.Name || 'Unknown';
      info.speed = adapter.LinkSpeed || 'Unknown';
    }
  } catch {}

  try {
    // Bytes sent/received
    const statsOut = await run('powershell -Command "Get-NetAdapterStatistics | Where-Object {$_.ReceivedBytes -gt 0} | Select-Object -First 1 SentBytes, ReceivedBytes | ConvertTo-Json"');
    if (statsOut) {
      const stats = JSON.parse(statsOut);
      info.bytesSent = stats.SentBytes || 0;
      info.bytesRecv = stats.ReceivedBytes || 0;

      // Calculate rates
      const now = Date.now();
      if (_lastNetBytes && _lastNetTime) {
        const elapsed = (now - _lastNetTime) / 1000; // seconds
        if (elapsed > 0) {
          info.sendRate = Math.round((info.bytesSent - _lastNetBytes.sent) / elapsed);
          info.recvRate = Math.round((info.bytesRecv - _lastNetBytes.recv) / elapsed);
          if (info.sendRate < 0) info.sendRate = 0;
          if (info.recvRate < 0) info.recvRate = 0;
        }
      }
      _lastNetBytes = { sent: info.bytesSent, recv: info.bytesRecv };
      _lastNetTime = now;
    }
  } catch {}

  return info;
});

// ── IPC: Create Restore Point ───────────────────────────────────────────────

ipcMain.handle('create-restore-point', async () => {
  try {
    logToFile('Creating system restore point...');
    // Enable System Restore on C: if not already enabled, then create point
    const result = await run('powershell -Command "Enable-ComputerRestore -Drive C:\\ -ErrorAction SilentlyContinue; Checkpoint-Computer -Description \'Windows Optimizer Restore Point\' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop"', 60000);
    logToFile('Restore point created: ' + result);
    return { ok: true };
  } catch (e) {
    // Windows may reject if a restore point was created in the last 24 hours
    logToFile('Restore point failed (may be throttled by Windows): ' + e, 'ERROR');
    return { ok: false, error: 'Failed to create restore point. Windows limits one per 24 hours.' };
  }
});

// ── IPC: Performance Max ────────────────────────────────────────────────────

ipcMain.handle('apply-max-performance', async () => {
  const tasks = [
    // Power plan
    { name: 'High performance power plan', cmd: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>nul' },
    { name: 'Disable USB selective suspend', cmd: 'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 & powercfg /setactive scheme_current 2>nul' },
    { name: 'Disable hard disk timeout', cmd: 'powercfg /change disk-timeout-ac 0 2>nul' },
    { name: 'Disable sleep timeout', cmd: 'powercfg /change standby-timeout-ac 0 2>nul' },
    { name: 'Disable hibernation', cmd: 'powercfg -h off 2>nul' },
    // Visual effects
    { name: 'Disable visual effects', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f 2>nul' },
    { name: 'Disable animations', cmd: 'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f 2>nul' },
    { name: 'Disable transparency', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v EnableTransparency /t REG_DWORD /d 0 /f 2>nul' },
    { name: 'Disable smooth scrolling', cmd: 'reg add "HKCU\\Control Panel\\Desktop" /v SmoothScroll /t REG_DWORD /d 0 /f 2>nul' },
    // Services
    { name: 'Disable search indexing', cmd: 'net stop WSearch 2>nul & sc config WSearch start=disabled 2>nul' },
    { name: 'Disable Superfetch/SysMain', cmd: 'net stop SysMain 2>nul & sc config SysMain start=disabled 2>nul' },
    { name: 'Disable telemetry', cmd: 'net stop DiagTrack 2>nul & sc config DiagTrack start=disabled 2>nul' },
    { name: 'Disable diagnostics', cmd: 'net stop diagsvc 2>nul & sc config diagsvc start=disabled 2>nul' },
    { name: 'Disable print spooler', cmd: 'net stop Spooler 2>nul & sc config Spooler start=disabled 2>nul' },
    // Registry tweaks
    { name: 'Disable Windows tips', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 0 /f 2>nul' },
    { name: 'Disable background apps', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 1 /f 2>nul' },
    { name: 'Disable game bar', cmd: 'reg add "HKCU\\Software\\Microsoft\\GameBar" /v AllowAutoGameMode /t REG_DWORD /d 0 /f 2>nul & reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f 2>nul' },
    { name: 'Disable Cortana', cmd: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" /v AllowCortana /t REG_DWORD /d 0 /f 2>nul' },
    { name: 'Disable lock screen ads', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v RotatingLockScreenOverlayEnabled /t REG_DWORD /d 0 /f 2>nul' },
    { name: 'Disable action center', cmd: 'reg add "HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer" /v DisableNotificationCenter /t REG_DWORD /d 1 /f 2>nul' },
    // Network optimization
    { name: 'Disable Nagle algorithm', cmd: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v TcpAckFrequency /t REG_DWORD /d 1 /f 2>nul & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v TCPNoDelay /t REG_DWORD /d 1 /f 2>nul' },
    // CPU priority
    { name: 'Prioritize foreground apps', cmd: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f 2>nul' },
    { name: 'Large system cache', cmd: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 1 /f 2>nul' },
  ];
  let done = 0;
  for (const t of tasks) {
    const r = await run(t.cmd);
    if (r) done++;
  }
  logToFile('Max performance applied: ' + done + '/' + tasks.length + ' tasks');
  return { ok: true, done, total: tasks.length };
});

// ── Auto-apply max performance on startup if enabled in config ──────────────

function applyMaxPerformanceOnStartup() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.maxPerformance) {
      logToFile('Max Performance is ON — applying on startup...');
      const optimizer = require('./optimizer-api');
      // Use the dedicated commands
      const tasks = [
        'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>nul',
        'powercfg -h off 2>nul',
        'powercfg /change standby-timeout-ac 0 2>nul',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f 2>nul',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v EnableTransparency /t REG_DWORD /d 0 /f 2>nul',
        'net stop WSearch 2>nul & sc config WSearch start=disabled 2>nul',
        'net stop SysMain 2>nul & sc config SysMain start=disabled 2>nul',
        'net stop DiagTrack 2>nul & sc config DiagTrack start=disabled 2>nul',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 0 /f 2>nul',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 1 /f 2>nul',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f 2>nul',
      ];
      for (const t of tasks) {
        try { execSync(t, { encoding: 'utf8', timeout: 10000, shell: true, stdio: 'pipe' }); } catch {}
      }
      logToFile('Max Performance applied on startup.');
    }
  } catch {}
}

// Window controls
ipcMain.handle('win-minimize', () => win.hide());
ipcMain.handle('win-maximize', () => { if (win.isMaximized()) win.unmaximize(); else win.maximize(); });
ipcMain.handle('win-close', () => win.hide());

// ══════════════════════════════════════════════════════════════════════════════
// ── HTTP API — Full remote monitor & control (port 9500) ─────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const httpServer = require('http');
const API_PORT = 9500;
const API_KEY = 'dsm-optimizer-2026';

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data, null, 2));
}

function parseJsonBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

const apiServer = httpServer.createServer(async (req, res) => {
  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-API-Key' });
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // Auth check
  const key = req.headers['x-api-key'] || url.searchParams.get('key');
  if (key !== API_KEY) {
    return jsonRes(res, 401, { error: 'Unauthorized' });
  }

  const optimizer = require('./optimizer-api');

  try {
    // ── GET endpoints (monitor) ──
    if (req.method === 'GET') {
      if (pathname === '/api/health') {
        const info = {};
        // CPU — try PowerShell first, fallback to wmic
        try {
          const cpuOut = await run('powershell -Command "(Get-CimInstance Win32_Processor).LoadPercentage"');
          info.cpu = parseInt(cpuOut) || 0;
        } catch {
          try {
            const cpuLoad = await run('wmic cpu get LoadPercentage /value');
            info.cpu = parseInt((cpuLoad.match(/LoadPercentage=(\d+)/) || [])[1] || '0');
          } catch { info.cpu = 0; }
        }
        // RAM — PowerShell with fallback
        try {
          const ramOut = await run('powershell -Command "$os = Get-CimInstance Win32_OperatingSystem; $total = [math]::Round($os.TotalVisibleMemorySize/1MB,1); $free = [math]::Round($os.FreePhysicalMemory/1MB,1); $used = [math]::Round((1-$os.FreePhysicalMemory/$os.TotalVisibleMemorySize)*100); Write-Output \\"$used|$free|$total\\""');
          const [usedPct, freeGB, totalGB] = ramOut.split('|');
          info.ramUsedPct = parseInt(usedPct) || 0;
          info.ramFreeGB = freeGB || '0';
          info.ramTotalGB = totalGB || '0';
        } catch {
          try {
            const ramFree = await run('wmic OS get FreePhysicalMemory /value');
            const ramTotal = await run('wmic OS get TotalVisibleMemorySize /value');
            const free = parseInt((ramFree.match(/=(\d+)/) || [])[1] || '0');
            const total = parseInt((ramTotal.match(/=(\d+)/) || [])[1] || '1');
            info.ramUsedPct = Math.round((1 - free / total) * 100);
            info.ramFreeGB = (free / 1024 / 1024).toFixed(1);
            info.ramTotalGB = (total / 1024 / 1024).toFixed(1);
          } catch { info.ramUsedPct = 0; info.ramFreeGB = '0'; info.ramTotalGB = '0'; }
        }
        // Disk — PowerShell with fallback
        try {
          const diskOut = await run('powershell -Command "$d = Get-CimInstance Win32_LogicalDisk -Filter \\"DeviceID=\'C:\'\\"; $total = [math]::Round($d.Size/1GB,1); $free = [math]::Round($d.FreeSpace/1GB,1); $used = [math]::Round((1-$d.FreeSpace/$d.Size)*100); Write-Output \\"$used|$free|$total\\""');
          const [dUsed, dFree, dTotal] = diskOut.split('|');
          info.diskUsedPct = parseInt(dUsed) || 0;
          info.diskFreeGB = dFree || '0';
          info.diskTotalGB = dTotal || '0';
        } catch {
          try {
            const diskOut = await run('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /value');
            const dfree = parseInt((diskOut.match(/FreeSpace=(\d+)/) || [])[1] || '0');
            const dtotal = parseInt((diskOut.match(/Size=(\d+)/) || [])[1] || '1');
            info.diskUsedPct = Math.round((1 - dfree / dtotal) * 100);
            info.diskFreeGB = (dfree / 1024 / 1024 / 1024).toFixed(1);
            info.diskTotalGB = (dtotal / 1024 / 1024 / 1024).toFixed(1);
          } catch { info.diskUsedPct = 0; info.diskFreeGB = '0'; info.diskTotalGB = '0'; }
        }
        // Uptime — use Node.js os module (always works)
        try {
          info.uptimeHours = Math.round(require('os').uptime() / 3600);
        } catch { info.uptimeHours = 0; }
        const configPath = path.join(__dirname, 'config.json');
        let config = {};
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
        info.maxPerformance = config.maxPerformance || false;
        info.deviceName = config.deviceName || 'Unnamed';
        info.version = '1.2.0';
        info.admin = _isAdmin;
        info.uptime = process.uptime();
        info.memory = Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB';
        info.ip = getLocalIP();
        info.publicIP = await getPublicIP();
        return jsonRes(res, 200, info);
      }

      if (pathname === '/api/startup-apps') {
        const entries = [];
        try {
          for (const [hive, suffix] of [['HKCU','Run'],['HKCU','RunDisabled'],['HKLM','Run'],['HKLM','RunDisabled']]) {
            const enabled = suffix === 'Run';
            const out = await run(`reg query "${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\${suffix}" 2>nul`);
            for (const line of (out || '').split('\n')) {
              const m = line.match(/^\s+(\S+)\s+REG_SZ\s+(.+)$/i);
              if (m) entries.push({ name: m[1], path: m[2].trim(), hive, enabled });
            }
          }
        } catch {}
        return jsonRes(res, 200, { entries });
      }

      if (pathname === '/api/schedules') {
        return jsonRes(res, 200, { schedules: loadSchedules() });
      }

      if (pathname === '/api/logs') {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const logPath = path.join(LOG_DIR, `optimizer-${dateStr}.log`);
        try {
          const content = fs.readFileSync(logPath, 'utf8');
          const lines = content.trim().split('\n').slice(-50);
          return jsonRes(res, 200, { lines });
        } catch { return jsonRes(res, 200, { lines: [] }); }
      }

      if (pathname === '/api/network') {
        try {
          const adapterOut = await run('powershell -Command "Get-NetAdapter | Where-Object Status -eq Up | Select-Object -First 1 Name, LinkSpeed | ConvertTo-Json"');
          const adapter = adapterOut ? JSON.parse(adapterOut) : {};
          const statsOut = await run('powershell -Command "Get-NetAdapterStatistics | Where-Object {$_.ReceivedBytes -gt 0} | Select-Object -First 1 SentBytes, ReceivedBytes | ConvertTo-Json"');
          const stats = statsOut ? JSON.parse(statsOut) : {};
          const localIP = getLocalIP();
          const pubIP = await getPublicIP();
          return jsonRes(res, 200, { adapter: adapter.Name, speed: adapter.LinkSpeed, bytesSent: stats.SentBytes || 0, bytesRecv: stats.ReceivedBytes || 0, localIP, publicIP: pubIP });
        } catch { return jsonRes(res, 200, { adapter: 'Unknown', speed: 'Unknown' }); }
      }

      if (pathname === '/api/running-apps') {
        try {
          const out = await run('powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object Id, ProcessName, @{N=\'MemMB\';E={[math]::Round($_.WorkingSet/1MB)}}, MainWindowTitle | Sort-Object -Property MemMB -Descending | ConvertTo-Json -Depth 1"', 15000);
          return jsonRes(res, 200, { apps: out ? JSON.parse(out) : [] });
        } catch { return jsonRes(res, 200, { apps: [] }); }
      }

      // Devices registry — list all known optimizer instances
      if (pathname === '/api/devices') {
        return jsonRes(res, 200, { devices: loadDevices() });
      }

      // Check health of all registered devices
      if (pathname === '/api/devices/status') {
        const devices = loadDevices();
        const results = [];
        const http = require('http');
        for (const dev of devices) {
          try {
            const health = await new Promise((resolve, reject) => {
              const req = http.get(`http://${dev.ip}:${dev.port || 9500}/api/health?key=${API_KEY}`, { timeout: 5000 }, (res) => {
                let d = ''; res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
              });
              req.on('error', () => resolve(null));
              req.on('timeout', () => { req.destroy(); resolve(null); });
            });
            results.push({ ...dev, online: !!health, health });
          } catch { results.push({ ...dev, online: false, health: null }); }
        }
        return jsonRes(res, 200, { devices: results });
      }
    }

      // Self-update — pull latest main.js from GitHub
      if (pathname === '/api/self-update') {
        try {
          const https = require('https');
          const files = ['main.js', 'optimizer-api.js', 'package.json'];
          const results = [];
          for (const file of files) {
            const updated = await new Promise((resolve) => {
              const url = `https://raw.githubusercontent.com/tester2379/dsm-optimizer/master/${file}`;
              https.get(url, { headers: { 'User-Agent': 'DSM-Optimizer' } }, (resp) => {
                if (resp.statusCode === 301 || resp.statusCode === 302) {
                  https.get(resp.headers.location, { headers: { 'User-Agent': 'DSM-Optimizer' } }, (r2) => {
                    let data = '';
                    r2.on('data', c => data += c);
                    r2.on('end', () => {
                      if (r2.statusCode === 200 && data.length > 100) {
                        fs.writeFileSync(path.join(__dirname, file), data);
                        resolve({ file, ok: true, size: data.length });
                      } else { resolve({ file, ok: false, status: r2.statusCode }); }
                    });
                  }).on('error', e => resolve({ file, ok: false, error: e.message }));
                  return;
                }
                let data = '';
                resp.on('data', c => data += c);
                resp.on('end', () => {
                  if (resp.statusCode === 200 && data.length > 100) {
                    fs.writeFileSync(path.join(__dirname, file), data);
                    resolve({ file, ok: true, size: data.length });
                  } else { resolve({ file, ok: false, status: resp.statusCode }); }
                });
              }).on('error', e => resolve({ file, ok: false, error: e.message }));
            });
            results.push(updated);
          }
          logToFile('Self-update: ' + JSON.stringify(results));
          return jsonRes(res, 200, { action: 'self-update', results, note: 'Restart optimizer to apply changes' });
        } catch (err) {
          return jsonRes(res, 500, { error: err.message });
        }
      }

    // ── POST endpoints (control) ──
    if (req.method === 'POST') {
      if (pathname === '/api/optimize') {
        const result = await optimizer.run('optimize');
        return jsonRes(res, 200, result);
      }
      if (pathname === '/api/full-optimize') {
        const result = await optimizer.run('full-optimize');
        return jsonRes(res, 200, result);
      }
      if (pathname === '/api/scan') {
        const result = await optimizer.run('scan');
        return jsonRes(res, 200, result);
      }
      if (pathname === '/api/update') {
        const result = await optimizer.run('update');
        return jsonRes(res, 200, result);
      }
      if (pathname === '/api/temp-cleanup') {
        const result = await optimizer.run('temp-cleanup');
        return jsonRes(res, 200, result);
      }
      if (pathname === '/api/close-apps') {
        const result = await optimizer.run('close-apps');
        return jsonRes(res, 200, result);
      }
      if (pathname === '/api/restart') {
        const result = await optimizer.run('restart');
        return jsonRes(res, 200, result);
      }
      if (pathname === '/api/restore-point') {
        try {
          await run('powershell -Command "Enable-ComputerRestore -Drive C:\\ -ErrorAction SilentlyContinue; Checkpoint-Computer -Description \'Windows Optimizer Restore Point\' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop"', 60000);
          return jsonRes(res, 200, { ok: true });
        } catch (e) {
          return jsonRes(res, 200, { ok: false, error: 'Failed — Windows limits one per 24 hours.' });
        }
      }
      if (pathname === '/api/performance-mode') {
        const body = await parseJsonBody(req);
        const configPath = path.join(__dirname, 'config.json');
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          config.maxPerformance = body.enabled !== undefined ? !!body.enabled : !config.maxPerformance;
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
          if (config.maxPerformance) {
            const tasks = [
              'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>nul',
              'net stop WSearch 2>nul', 'net stop SysMain 2>nul',
            ];
            for (const t of tasks) { try { execSync(t, { encoding: 'utf8', timeout: 10000, shell: true, stdio: 'pipe' }); } catch {} }
          }
          return jsonRes(res, 200, { ok: true, maxPerformance: config.maxPerformance });
        } catch (e) { return jsonRes(res, 200, { ok: false, error: e.message }); }
      }
      if (pathname === '/api/toggle-startup') {
        const body = await parseJsonBody(req);
        if (!body.name || !body.hive) return jsonRes(res, 400, { error: 'name and hive required' });
        const runKey = `${body.hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
        const disKey = `${body.hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\RunDisabled`;
        try {
          if (body.enabled) {
            const val = await run(`reg query "${runKey}" /v "${body.name}" 2>nul`);
            const m = val.match(/REG_SZ\s+(.+)$/im);
            if (m) { await run(`reg add "${disKey}" /v "${body.name}" /t REG_SZ /d "${m[1].trim()}" /f`); await run(`reg delete "${runKey}" /v "${body.name}" /f`); }
          } else {
            const val = await run(`reg query "${disKey}" /v "${body.name}" 2>nul`);
            const m = val.match(/REG_SZ\s+(.+)$/im);
            if (m) { await run(`reg add "${runKey}" /v "${body.name}" /t REG_SZ /d "${m[1].trim()}" /f`); await run(`reg delete "${disKey}" /v "${body.name}" /f`); }
          }
          return jsonRes(res, 200, { ok: true });
        } catch (e) { return jsonRes(res, 200, { ok: false, error: e.message }); }
      }
      if (pathname === '/api/schedules') {
        const body = await parseJsonBody(req);
        if (body.schedules) { saveSchedules(body.schedules); return jsonRes(res, 200, { ok: true }); }
        return jsonRes(res, 400, { error: 'schedules array required' });
      }
      if (pathname === '/api/close-app') {
        const body = await parseJsonBody(req);
        if (!body.pid) return jsonRes(res, 400, { error: 'pid required' });
        try { await run('taskkill /F /PID ' + body.pid, 5000); return jsonRes(res, 200, { ok: true }); }
        catch { return jsonRes(res, 200, { ok: false }); }
      }

      // Set device name
      if (pathname === '/api/device-name') {
        const body = await parseJsonBody(req);
        if (!body.name) return jsonRes(res, 400, { error: 'name required' });
        const configPath = path.join(__dirname, 'config.json');
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          config.deviceName = body.name;
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
          logToFile('Device name set to: ' + body.name);
          return jsonRes(res, 200, { ok: true, deviceName: body.name });
        } catch (e) { return jsonRes(res, 200, { ok: false, error: e.message }); }
      }

      // Register a device (add to devices registry)
      if (pathname === '/api/devices/add') {
        const body = await parseJsonBody(req);
        if (!body.name || !body.ip) return jsonRes(res, 400, { error: 'name and ip required' });
        const devices = loadDevices();
        const existing = devices.findIndex(d => d.ip === body.ip);
        const entry = { name: body.name, ip: body.ip, port: body.port || 9500, added: new Date().toISOString() };
        if (existing >= 0) devices[existing] = entry;
        else devices.push(entry);
        saveDevices(devices);
        logToFile('Device registered: ' + body.name + ' @ ' + body.ip);
        return jsonRes(res, 200, { ok: true, devices });
      }

      // Remove a device
      if (pathname === '/api/devices/remove') {
        const body = await parseJsonBody(req);
        if (!body.ip && !body.name) return jsonRes(res, 400, { error: 'ip or name required' });
        let devices = loadDevices();
        devices = devices.filter(d => d.ip !== body.ip && d.name !== body.name);
        saveDevices(devices);
        return jsonRes(res, 200, { ok: true, devices });
      }
    }

      // Call-home config
      if (pathname === '/api/callhome' && req.method === 'GET') {
        const cfg = loadCallHomeConfig();
        return jsonRes(res, 200, cfg || { serverUrl: null, id: null });
      }
      if (pathname === '/api/callhome') {
        const body = await parseJsonBody(req);
        const cfg = { serverUrl: body.serverUrl || '', id: body.id || '', enabled: body.enabled !== false };
        saveCallHomeConfig(cfg);
        logToFile('Call home configured: ' + JSON.stringify(cfg));
        callHome(); // Trigger immediately
        return jsonRes(res, 200, { ok: true, callhome: cfg });
      }

      // Receive check-in from remote optimizers
      if (pathname === '/api/optimizer/checkin') {
        const body = await parseJsonBody(req);
        const checkinFile = path.join(__dirname, 'checkins.json');
        let checkins = {};
        try { checkins = JSON.parse(fs.readFileSync(checkinFile, 'utf8')); } catch {}
        const id = body.callHomeId || body.deviceName || 'unknown';
        checkins[id] = { ...body, lastSeen: new Date().toISOString() };
        fs.writeFileSync(checkinFile, JSON.stringify(checkins, null, 2));
        return jsonRes(res, 200, { ok: true, received: id });
      }

      // Get all check-ins from remote optimizers
      if (pathname === '/api/optimizer/checkins') {
        const checkinFile = path.join(__dirname, 'checkins.json');
        let checkins = {};
        try { checkins = JSON.parse(fs.readFileSync(checkinFile, 'utf8')); } catch {}
        return jsonRes(res, 200, checkins);
      }

    // 404
    jsonRes(res, 404, {
      error: 'Not found',
      endpoints: {
        GET: ['/api/health', '/api/startup-apps', '/api/schedules', '/api/logs', '/api/network', '/api/running-apps', '/api/devices', '/api/devices/status', '/api/callhome', '/api/optimizer/checkins'],
        POST: ['/api/optimize', '/api/full-optimize', '/api/scan', '/api/update', '/api/temp-cleanup', '/api/close-apps', '/api/restart', '/api/restore-point', '/api/performance-mode', '/api/toggle-startup', '/api/schedules', '/api/close-app', '/api/device-name', '/api/devices/add', '/api/devices/remove', '/api/callhome', '/api/optimizer/checkin'],
      }
    });
  } catch (err) {
    jsonRes(res, 500, { error: err.message });
  }
});

apiServer.listen(API_PORT, '0.0.0.0', () => {
  logToFile('API server listening on port ' + API_PORT);
  // Auto port-forward via UPnP
  setupUPnP();
});
apiServer.on('error', (err) => {
  logToFile('API server error: ' + err.message, 'ERROR');
});

// ── UPnP Auto Port Forward ─────────────────────────────────────────────────
// Automatically tells the router to forward API_PORT to this machine

function setupUPnP() {
  try {
    const natUpnp = require('nat-upnp');
    const client = natUpnp.createClient();

    client.portMapping({
      public: API_PORT,
      private: API_PORT,
      ttl: 0, // permanent until removed
      description: 'DSM Optimizer API'
    }, (err) => {
      if (err) {
        logToFile('UPnP port forward failed: ' + err.message + ' (router may not support UPnP)', 'ERROR');
      } else {
        logToFile('UPnP: Port ' + API_PORT + ' forwarded automatically');
      }
    });

    // Also try to get external IP via UPnP
    client.externalIp((err, ip) => {
      if (!err && ip) {
        logToFile('UPnP external IP: ' + ip);
      }
    });
  } catch (err) {
    logToFile('UPnP setup error: ' + err.message, 'ERROR');
  }
}

// Also open Windows Firewall for the port
try {
  execSync('netsh advfirewall firewall add rule name="DSM Optimizer API" dir=in action=allow protocol=TCP localport=' + API_PORT + ' 2>nul', { stdio: 'pipe', timeout: 5000 });
  logToFile('Firewall rule added for port ' + API_PORT);
} catch {
  logToFile('Firewall rule may already exist or failed');
}

// ── Call Home — periodic health beacon to DSM Monitor ──────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const CALL_HOME_INTERVAL = 60000; // every 60 seconds
const CALL_HOME_FILE = path.join(__dirname, 'callhome.json');

function loadCallHomeConfig() {
  try { return JSON.parse(fs.readFileSync(CALL_HOME_FILE, 'utf8')); } catch { return null; }
}

function saveCallHomeConfig(cfg) {
  fs.writeFileSync(CALL_HOME_FILE, JSON.stringify(cfg, null, 2));
}

async function getHealthData() {
  const info = {};
  try {
    const cpuLoad = execSync('wmic cpu get LoadPercentage /value', { encoding: 'utf8', timeout: 5000 });
    info.cpu = parseInt((cpuLoad.match(/LoadPercentage=(\d+)/) || [])[1] || '0');
  } catch { info.cpu = 0; }
  try {
    const ramFree = execSync('wmic OS get FreePhysicalMemory /value', { encoding: 'utf8', timeout: 5000 });
    const ramTotal = execSync('wmic ComputerSystem get TotalPhysicalMemory /value', { encoding: 'utf8', timeout: 5000 });
    const freeKB = parseInt((ramFree.match(/FreePhysicalMemory=(\d+)/) || [])[1] || '0');
    const totalBytes = parseInt((ramTotal.match(/TotalPhysicalMemory=(\d+)/) || [])[1] || '0');
    const totalGB = totalBytes / (1024 * 1024 * 1024);
    const freeGB = freeKB / (1024 * 1024);
    info.ramUsedPct = Math.round(((totalGB - freeGB) / totalGB) * 100);
    info.ramFreeGB = freeGB.toFixed(1);
    info.ramTotalGB = totalGB.toFixed(1);
  } catch { info.ramUsedPct = 0; info.ramFreeGB = '0'; info.ramTotalGB = '0'; }
  try {
    const disk = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /value', { encoding: 'utf8', timeout: 5000 });
    const free = parseInt((disk.match(/FreeSpace=(\d+)/) || [])[1] || '0');
    const total = parseInt((disk.match(/Size=(\d+)/) || [])[1] || '0');
    info.diskUsedPct = Math.round(((total - free) / total) * 100);
    info.diskFreeGB = (free / (1024 * 1024 * 1024)).toFixed(1);
    info.diskTotalGB = (total / (1024 * 1024 * 1024)).toFixed(1);
  } catch { info.diskUsedPct = 0; info.diskFreeGB = '0'; info.diskTotalGB = '0'; }
  try {
    info.uptimeHours = Math.round(require('os').uptime() / 3600);
  } catch { info.uptimeHours = 0; }

  const config = loadConfig();
  info.deviceName = config.deviceName || require('os').hostname();
  info.version = '1.2.0';
  info.maxPerformance = config.maxPerformance || false;
  info.ip = getLocalIP();
  info.port = API_PORT;

  return info;
}

function getLocalIP() {
  try {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch {}
  return '127.0.0.1';
}

function getPublicIP() {
  return new Promise(resolve => {
    const https = require('https');
    https.get('https://api.ipify.org', { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data.trim()));
    }).on('error', () => resolve('unknown'));
  });
}

async function callHome() {
  const cfg = loadCallHomeConfig();
  if (!cfg || !cfg.serverUrl) return;

  try {
    const health = await getHealthData();
    health.publicIP = await getPublicIP();
    health.callHomeId = cfg.id || cfg.deviceName || health.deviceName;
    health.timestamp = new Date().toISOString();

    const payload = JSON.stringify(health);
    const url = new URL(cfg.serverUrl + '/api/optimizer/checkin');
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-API-Key': API_KEY,
      },
      timeout: 10000,
    };

    const proto = url.protocol === 'https:' ? require('https') : require('http');
    const req = proto.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          logToFile('Call home OK → ' + cfg.serverUrl);
        } else {
          logToFile('Call home response: ' + res.statusCode + ' ' + body.slice(0, 100), 'ERROR');
        }
      });
    });
    req.on('error', (err) => {
      logToFile('Call home failed: ' + err.message, 'ERROR');
    });
    req.on('timeout', () => { req.destroy(); });
    req.write(payload);
    req.end();
  } catch (err) {
    logToFile('Call home error: ' + err.message, 'ERROR');
  }
}

// Start call-home loop
setInterval(callHome, CALL_HOME_INTERVAL);
setTimeout(callHome, 5000); // First call after 5s

// API endpoint to configure call-home
// POST /api/callhome { serverUrl: "http://192.168.174.1:11436", id: "remote-office" }
// GET /api/callhome — returns current config
