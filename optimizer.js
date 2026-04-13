/**
 * Windows Optimizer — Full system optimization, updates, security, and app management
 * Runs with admin privileges. Designed for Windows 10/11.
 *
 * Usage: node optimizer.js [command]
 * Commands: optimize, update, scan, close-apps, restart, startup-apps, full, status
 */

'use strict';

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────

const CONFIG_FILE = path.join(__dirname, 'config.json');
const LOG_DIR = path.join(__dirname, 'logs');

const DEFAULT_CONFIG = {
  // Apps to close before optimization
  appsToClose: [
    'notepad.exe',
    'calc.exe',
  ],
  // Apps to start on Windows startup
  startupApps: [
    // { name: 'DSM News Scraper', path: 'C:\\path\\to\\app.exe', args: '' },
  ],
  // Schedule
  autoOptimizeHour: 3, // 3 AM
  autoScanDay: 'sunday', // Weekly virus scan
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// ── Logging ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleString('en-MT');
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  try {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    fs.appendFileSync(path.join(LOG_DIR, `optimizer-${dateStr}.log`), line + '\n');
  } catch {}
}

function run(cmd, opts = {}) {
  const timeout = opts.timeout || 60000;
  const shell = opts.shell !== false;
  try {
    const result = execSync(cmd, { encoding: 'utf8', timeout, stdio: opts.silent ? 'ignore' : 'pipe', shell });
    return { ok: true, output: (result || '').trim() };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

function runAsync(cmd, timeout = 300000) {
  return new Promise((resolve) => {
    const child = exec(cmd, { timeout, shell: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: (stdout || '').trim(), error: err ? err.message.slice(0, 200) : '' });
    });
  });
}

// ── Admin check ─────────────────────────────────────────────────────────────

function isAdmin() {
  const result = run('net session', { silent: true });
  return result.ok;
}

function requireAdmin() {
  if (!isAdmin()) {
    log('Not running as admin — relaunching with elevation...', 'WARN');
    const script = process.argv[1];
    const args = process.argv.slice(2).join(' ');
    const node = process.execPath;
    try {
      execSync(`powershell -Command "Start-Process '${node}' -ArgumentList '${script} ${args}' -Verb RunAs"`, { stdio: 'ignore' });
    } catch {}
    process.exit(0);
  }
  log('Running as administrator.');
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. FULL WINDOWS OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function optimize() {
  log('=== WINDOWS OPTIMIZATION STARTED ===');
  let done = 0, total = 0;

  const tasks = [
    // Disk cleanup
    { name: 'Flush DNS cache', cmd: 'ipconfig /flushdns' },
    { name: 'Clear Windows temp', cmd: 'del /q /s /f "C:\\Windows\\Temp\\*" 2>nul', shell: true },
    { name: 'Clear user temp', cmd: 'del /q /s /f "%TEMP%\\*" 2>nul', shell: true },
    { name: 'Clear prefetch', cmd: 'del /q /s /f "C:\\Windows\\Prefetch\\*.pf" 2>nul', shell: true },
    { name: 'Clear crash dumps', cmd: 'del /q /s /f "%LOCALAPPDATA%\\CrashDumps\\*" 2>nul', shell: true },
    { name: 'Clear Windows Update cache', cmd: 'del /q /s /f "C:\\Windows\\SoftwareDistribution\\Download\\*" 2>nul', shell: true },
    { name: 'Clear thumbnail cache', cmd: 'del /q /s /f "%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\thumbcache_*" 2>nul', shell: true },
    { name: 'Clear font cache', cmd: 'net stop FontCache 2>nul & del /q /s /f "C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache\\*" 2>nul & net start FontCache 2>nul', shell: true },
    { name: 'Clear icon cache', cmd: 'ie4uinit.exe -show', timeout: 10000 },

    // Browser caches
    { name: 'Clear Chrome cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cache" 2>nul & rd /s /q "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Code Cache" 2>nul', shell: true },
    { name: 'Clear Edge cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Cache" 2>nul & rd /s /q "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Code Cache" 2>nul', shell: true },

    // Memory & performance
    { name: 'Process idle tasks', cmd: 'rundll32.exe advapi32.dll,ProcessIdleTasks', timeout: 15000 },
    { name: '.NET garbage collection', cmd: 'powershell -Command "[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()"', timeout: 15000 },
    { name: 'Compact OS memory', cmd: 'powershell -Command "Get-Process | Where-Object {$_.WorkingSet -gt 100MB} | ForEach-Object { $_.MinWorkingSet = 1MB }"', timeout: 15000 },

    // Network
    { name: 'Reset Winsock', cmd: 'netsh winsock reset', timeout: 15000 },
    { name: 'Reset TCP/IP', cmd: 'netsh int ip reset', timeout: 15000 },
    { name: 'Flush ARP cache', cmd: 'netsh interface ip delete arpcache', timeout: 10000 },

    // System maintenance
    { name: 'Clear event logs', cmd: 'wevtutil cl Application 2>nul & wevtutil cl System 2>nul & wevtutil cl Security 2>nul', shell: true },
    { name: 'Disable hibernation', cmd: 'powercfg -h off', timeout: 10000 },
    { name: 'Set high performance power', cmd: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>nul', shell: true },

    // Disk
    { name: 'Empty Recycle Bin', cmd: 'rd /s /q C:\\$Recycle.Bin 2>nul', shell: true, timeout: 30000 },
    { name: 'DISM component cleanup', cmd: 'DISM /Online /Cleanup-Image /StartComponentCleanup /ResetBase', timeout: 300000 },
  ];

  for (const task of tasks) {
    total++;
    log(`  [${total}/${tasks.length}] ${task.name}...`);
    const result = run(task.cmd, { timeout: task.timeout || 60000, shell: task.shell || false, silent: true });
    if (result.ok) { done++; log(`    ✓ ${task.name}`); }
    else { log(`    ✗ ${task.name}: ${result.error}`, 'WARN'); }
  }

  // Disk space report
  const diskResult = run('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /value');
  if (diskResult.ok) {
    const m = diskResult.output.match(/FreeSpace=(\d+)/);
    if (m) log(`Disk free: ${(parseInt(m[1]) / 1024 / 1024 / 1024).toFixed(1)} GB`);
  }

  log(`=== OPTIMIZATION COMPLETE: ${done}/${total} tasks succeeded ===`);
  return { done, total };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. WINDOWS UPDATES
// ═══════════════════════════════════════════════════════════════════════════

async function checkAndInstallUpdates() {
  log('=== CHECKING FOR WINDOWS UPDATES ===');

  // Use PowerShell PSWindowsUpdate module or built-in UsoClient
  const methods = [
    {
      name: 'UsoClient (built-in)',
      check: 'UsoClient StartScan',
      install: 'UsoClient StartInstall',
    },
    {
      name: 'PowerShell WindowsUpdate',
      check: 'powershell -Command "Install-Module PSWindowsUpdate -Force -Scope CurrentUser -ErrorAction SilentlyContinue; Get-WindowsUpdate"',
      install: 'powershell -Command "Install-WindowsUpdate -AcceptAll -AutoReboot:$false"',
    },
  ];

  for (const method of methods) {
    log(`Trying: ${method.name}...`);

    // Scan
    log('  Scanning for updates...');
    const scan = await runAsync(method.check, 120000);
    if (!scan.ok) { log(`  ${method.name} scan failed: ${scan.error}`, 'WARN'); continue; }
    log('  Scan complete.');
    if (scan.output) log('  ' + scan.output.slice(0, 500));

    // Install
    log('  Installing updates...');
    const install = await runAsync(method.install, 600000); // 10 min timeout
    if (install.ok) {
      log('  Updates installed successfully.');
      if (install.output) log('  ' + install.output.slice(0, 500));
    } else {
      log('  Install failed: ' + install.error, 'WARN');
    }

    log('=== WINDOWS UPDATE COMPLETE ===');
    return { ok: true, method: method.name };
  }

  log('=== NO UPDATE METHOD WORKED ===', 'ERROR');
  return { ok: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VIRUS SCAN
// ═══════════════════════════════════════════════════════════════════════════

async function runVirusScan(scanType = 'quick') {
  log(`=== WINDOWS DEFENDER ${scanType.toUpperCase()} SCAN ===`);

  const mpCmd = 'C:\\Program Files\\Windows Defender\\MpCmdRun.exe';
  if (!fs.existsSync(mpCmd)) {
    log('Windows Defender not found.', 'ERROR');
    return { ok: false, error: 'Defender not found' };
  }

  // Update definitions first
  log('  Updating virus definitions...');
  await runAsync(`"${mpCmd}" -SignatureUpdate`, 120000);

  // Run scan
  const scanFlag = scanType === 'full' ? '-Scan -ScanType 2' : '-Scan -ScanType 1';
  log(`  Running ${scanType} scan (this may take a while)...`);
  const result = await runAsync(`"${mpCmd}" ${scanFlag}`, scanType === 'full' ? 3600000 : 600000);

  if (result.ok) {
    log(`  ${scanType} scan completed.`);
    if (result.output) log('  ' + result.output.slice(0, 500));
  } else {
    log('  Scan error: ' + result.error, 'WARN');
  }

  // Get threat status
  const threats = run('powershell -Command "Get-MpThreatDetection | Select-Object -Last 5 | Format-Table -AutoSize"', { timeout: 15000 });
  if (threats.ok && threats.output) {
    log('  Recent threats: ' + threats.output.slice(0, 300));
  } else {
    log('  No recent threats detected.');
  }

  log(`=== VIRUS SCAN COMPLETE ===`);
  return { ok: true, type: scanType };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CLOSE SPECIFIC APPS
// ═══════════════════════════════════════════════════════════════════════════

function closeApps(appList) {
  const config = loadConfig();
  const apps = appList || config.appsToClose || [];
  log(`=== CLOSING ${apps.length} APP(S) ===`);

  let closed = 0;
  for (const app of apps) {
    const name = typeof app === 'string' ? app : app.name;
    log(`  Closing ${name}...`);
    const result = run(`taskkill /F /IM "${name}" /T 2>nul`, { shell: true, silent: true });
    if (result.ok) { closed++; log(`    ✓ ${name} closed`); }
    else { log(`    - ${name} not running`); }
  }

  log(`=== CLOSED ${closed}/${apps.length} APP(S) ===`);
  return { closed, total: apps.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. RESTART WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

function restartWindows(delay = 30) {
  log(`=== WINDOWS RESTART IN ${delay} SECONDS ===`);
  log('  Saving all work...');

  // Give apps time to save
  run(`shutdown /r /t ${delay} /c "Windows Optimizer: Scheduled restart for maintenance"`, { shell: true });

  log(`  Restart scheduled in ${delay} seconds.`);
  log('  To cancel: shutdown /a');
  return { ok: true, delay };
}

function cancelRestart() {
  run('shutdown /a');
  log('Restart cancelled.');
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. STARTUP APP MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function addStartupApp(name, appPath, args = '') {
  log(`Adding "${name}" to Windows startup...`);
  const regKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
  const value = args ? `"${appPath}" ${args}` : `"${appPath}"`;
  const result = run(`reg add "${regKey}" /v "${name}" /t REG_SZ /d "${value}" /f`);
  if (result.ok) log(`  ✓ "${name}" added to startup.`);
  else log(`  ✗ Failed: ${result.error}`, 'ERROR');
  return result.ok;
}

function removeStartupApp(name) {
  log(`Removing "${name}" from Windows startup...`);
  const regKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
  const result = run(`reg delete "${regKey}" /v "${name}" /f`);
  if (result.ok) log(`  ✓ "${name}" removed from startup.`);
  else log(`  ✗ Failed: ${result.error}`, 'ERROR');
  return result.ok;
}

function listStartupApps() {
  log('=== STARTUP APPS ===');
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const result = run(`reg query "${regKey}"`);
  if (result.ok) {
    const lines = result.output.split('\n').filter(l => l.includes('REG_SZ'));
    for (const line of lines) {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 3) log(`  ${parts[0]}: ${parts[2]}`);
    }
    log(`Total: ${lines.length} startup app(s)`);
    return lines.length;
  }
  return 0;
}

function setupStartupApps() {
  const config = loadConfig();
  log('=== SETTING UP STARTUP APPS ===');
  for (const app of config.startupApps) {
    if (app.path && fs.existsSync(app.path)) {
      addStartupApp(app.name, app.path, app.args || '');
    } else {
      log(`  Skipping "${app.name}" — path not found: ${app.path}`, 'WARN');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. SYSTEM STATUS
// ═══════════════════════════════════════════════════════════════════════════

function getStatus() {
  log('=== SYSTEM STATUS ===');

  // OS info
  const os = run('systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"System Boot Time"', { shell: true, timeout: 30000 });
  if (os.ok) log(os.output);

  // Uptime
  const uptime = run('powershell -Command "(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime | Select-Object Days, Hours, Minutes | Format-Table -AutoSize"', { timeout: 10000 });
  if (uptime.ok) log('Uptime: ' + uptime.output);

  // CPU
  const cpu = run('wmic cpu get LoadPercentage /value', { timeout: 10000 });
  if (cpu.ok) { const m = cpu.output.match(/LoadPercentage=(\d+)/); if (m) log('CPU: ' + m[1] + '%'); }

  // RAM
  const ram = run('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value', { timeout: 10000 });
  if (ram.ok) {
    const free = ram.output.match(/FreePhysicalMemory=(\d+)/);
    const total = ram.output.match(/TotalVisibleMemorySize=(\d+)/);
    if (free && total) {
      const freeGB = (parseInt(free[1]) / 1024 / 1024).toFixed(1);
      const totalGB = (parseInt(total[1]) / 1024 / 1024).toFixed(1);
      const usedPct = Math.round((1 - parseInt(free[1]) / parseInt(total[1])) * 100);
      log(`RAM: ${freeGB}/${totalGB} GB free (${usedPct}% used)`);
    }
  }

  // Disk
  const disk = run('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /value', { timeout: 10000 });
  if (disk.ok) {
    const free = disk.output.match(/FreeSpace=(\d+)/);
    const total = disk.output.match(/Size=(\d+)/);
    if (free && total) {
      const freeGB = (parseInt(free[1]) / 1024 / 1024 / 1024).toFixed(1);
      const totalGB = (parseInt(total[1]) / 1024 / 1024 / 1024).toFixed(1);
      const usedPct = Math.round((1 - parseInt(free[1]) / parseInt(total[1])) * 100);
      log(`Disk C: ${freeGB}/${totalGB} GB free (${usedPct}% used)`);
    }
  }

  // Defender status
  const defender = run('powershell -Command "Get-MpComputerStatus | Select-Object AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated | Format-List"', { timeout: 15000 });
  if (defender.ok) log('Defender: ' + defender.output.replace(/\n/g, ' | ').trim());

  // Running processes
  const procs = run('tasklist /FI "STATUS eq running" | find /c "Running"', { shell: true, timeout: 10000 });
  if (procs.ok) log('Running processes: ' + procs.output.trim());

  log('=== STATUS COMPLETE ===');
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. FULL RUN (all-in-one)
// ═══════════════════════════════════════════════════════════════════════════

async function fullRun() {
  requireAdmin();
  log('========== FULL WINDOWS OPTIMIZATION ==========');
  const start = Date.now();

  // 1. Status
  getStatus();

  // 2. Close apps
  closeApps();

  // 3. Optimize
  await optimize();

  // 4. Virus scan (quick)
  await runVirusScan('quick');

  // 5. Check updates
  await checkAndInstallUpdates();

  // 6. Setup startup apps
  setupStartupApps();

  // 7. Final status
  getStatus();

  const elapsed = Math.round((Date.now() - start) / 1000);
  log(`========== FULL RUN COMPLETE IN ${elapsed}s ==========`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

const command = process.argv[2] || 'status';

(async () => {
  switch (command) {
    case 'optimize': requireAdmin(); await optimize(); break;
    case 'update': requireAdmin(); await checkAndInstallUpdates(); break;
    case 'scan': requireAdmin(); await runVirusScan(process.argv[3] || 'quick'); break;
    case 'scan-full': requireAdmin(); await runVirusScan('full'); break;
    case 'close-apps': closeApps(process.argv.slice(3)); break;
    case 'restart': requireAdmin(); restartWindows(parseInt(process.argv[3]) || 30); break;
    case 'cancel-restart': cancelRestart(); break;
    case 'startup-list': listStartupApps(); break;
    case 'startup-add': addStartupApp(process.argv[3], process.argv[4], process.argv[5]); break;
    case 'startup-remove': removeStartupApp(process.argv[3]); break;
    case 'startup-setup': setupStartupApps(); break;
    case 'status': getStatus(); break;
    case 'full': await fullRun(); break;
    default:
      console.log(`
Windows Optimizer — Commands:
  status          System health report
  optimize        Full disk/memory/network cleanup
  update          Check and install Windows updates
  scan            Quick virus scan
  scan-full       Full virus scan
  close-apps      Close configured apps
  restart [sec]   Restart Windows (default 30s delay)
  cancel-restart  Cancel pending restart
  startup-list    List startup apps
  startup-add     Add app to startup (name, path, args)
  startup-remove  Remove app from startup (name)
  startup-setup   Apply config startup apps
  full            Run everything (optimize + scan + update)
`);
  }
})();
