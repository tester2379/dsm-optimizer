/**
 * optimizer-api.js — Programmatic interface for optimizer commands
 * Used by both CLI (optimizer.js) and GUI (main.js)
 */

'use strict';

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function cmd(command, timeout = 30000) {
  try {
    return { ok: true, output: execSync(command, { encoding: 'utf8', timeout, shell: true, stdio: 'pipe' }).trim() };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

function cmdAsync(command, timeout = 300000) {
  return new Promise(resolve => {
    exec(command, { timeout, shell: true }, (err, stdout) => {
      resolve({ ok: !err, output: (stdout || '').trim(), error: err ? err.message.slice(0, 200) : '' });
    });
  });
}

async function run(command) {
  switch (command) {
    case 'optimize': {
      const tasks = [
        // Network
        { name: 'Flush DNS', cmd: 'ipconfig /flushdns' },
        { name: 'Reset Winsock', cmd: 'netsh winsock reset' },
        { name: 'Flush ARP cache', cmd: 'netsh interface ip delete arpcache' },
        // Temp files
        { name: 'Clean Windows temp', cmd: 'del /q /s /f "C:\\Windows\\Temp\\*" 2>nul' },
        { name: 'Clean user temp', cmd: 'del /q /s /f "%TEMP%\\*" 2>nul' },
        { name: 'Clean prefetch', cmd: 'del /q /s /f "C:\\Windows\\Prefetch\\*.pf" 2>nul' },
        { name: 'Clean crash dumps', cmd: 'del /q /s /f "%LOCALAPPDATA%\\CrashDumps\\*" 2>nul' },
        { name: 'Clean Windows Update cache', cmd: 'del /q /s /f "C:\\Windows\\SoftwareDistribution\\Download\\*" 2>nul' },
        { name: 'Clean thumbnail cache', cmd: 'del /q /s /f "%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\thumbcache_*" 2>nul' },
        // Browser caches
        { name: 'Clean Chrome cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cache" 2>nul & rd /s /q "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Code Cache" 2>nul' },
        { name: 'Clean Edge cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Cache" 2>nul & rd /s /q "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Code Cache" 2>nul' },
        { name: 'Clean Firefox cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Mozilla\\Firefox\\Profiles\\*\\cache2" 2>nul' },
        // Memory
        { name: 'Process idle tasks', cmd: 'rundll32.exe advapi32.dll,ProcessIdleTasks' },
        // Disk
        { name: 'Empty Recycle Bin', cmd: 'rd /s /q C:\\$Recycle.Bin 2>nul' },
        { name: 'Disable hibernation', cmd: 'powercfg -h off' },
        { name: 'Clear event logs', cmd: 'wevtutil cl Application 2>nul & wevtutil cl System 2>nul' },
        // Performance
        { name: 'High performance power', cmd: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>nul' },
        { name: 'Disable visual effects', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f 2>nul' },
        { name: 'Disable search indexing', cmd: 'net stop WSearch 2>nul' },
        { name: 'Disable Superfetch', cmd: 'net stop SysMain 2>nul' },
      ];
      let done = 0;
      for (const t of tasks) {
        const r = await cmdAsync(t.cmd, 30000);
        if (r.ok) done++;
      }
      return { action: 'optimize', done, total: tasks.length };
    }

    case 'scan-full': {
      const mpCmd = '"C:\\Program Files\\Windows Defender\\MpCmdRun.exe"';
      await cmdAsync(mpCmd + ' -SignatureUpdate', 60000);
      const result = await cmdAsync(mpCmd + ' -Scan -ScanType 2', 3600000);
      return { action: 'scan-full', type: 'full', ok: result.ok };
    }

    case 'deep-optimize': {
      // Heavy system maintenance — runs DISM + SFC async (takes 5-15 min)
      const results = [];
      const dism = await cmdAsync('DISM /Online /Cleanup-Image /StartComponentCleanup /ResetBase', 600000);
      results.push({ name: 'DISM cleanup', ok: dism.ok });
      const sfc = await cmdAsync('sfc /scannow', 600000);
      results.push({ name: 'SFC scan', ok: sfc.ok });
      return { action: 'deep-optimize', results };
    }

    case 'scan': {
      const mpCmd = '"C:\\Program Files\\Windows Defender\\MpCmdRun.exe"';
      await cmdAsync(mpCmd + ' -SignatureUpdate', 60000);
      const result = await cmdAsync(mpCmd + ' -Scan -ScanType 1', 600000);
      return { action: 'scan', type: 'quick', ok: result.ok };
    }

    case 'update': {
      await cmdAsync('UsoClient StartScan', 60000);
      const result = await cmdAsync('UsoClient StartInstall', 300000);
      return { action: 'update', ok: result.ok };
    }

    case 'close-apps': {
      let config = {};
      try { config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch (e) { console.error('Error: ' + e.message); }
      let closed = 0;
      for (const app of (config.appsToClose || [])) {
        const r = await cmdAsync('taskkill /F /IM "' + app + '" /T 2>nul', 10000);
        if (r.ok) closed++;
      }
      return { action: 'close-apps', closed };
    }

    case 'restart': {
      await cmdAsync('shutdown /r /t 30 /c "Windows Optimizer: Restart"', 5000);
      return { action: 'restart', delay: 30 };
    }

    case 'temp-cleanup': {
      const tasks = [
        // Windows temp
        { name: 'Clean Windows temp', cmd: 'del /q /s /f "C:\\Windows\\Temp\\*" 2>nul' },
        // User temp
        { name: 'Clean user temp', cmd: 'del /q /s /f "%TEMP%\\*" 2>nul' },
        // Prefetch
        { name: 'Clean prefetch', cmd: 'del /q /s /f "C:\\Windows\\Prefetch\\*.pf" 2>nul' },
        // Crash dumps
        { name: 'Clean crash dumps', cmd: 'del /q /s /f "%LOCALAPPDATA%\\CrashDumps\\*" 2>nul' },
        // Thumbnail cache
        { name: 'Clean thumbnail cache', cmd: 'del /q /s /f "%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\thumbcache_*" 2>nul' },
        // Browser caches
        { name: 'Clean Chrome cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cache" 2>nul & rd /s /q "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Code Cache" 2>nul' },
        { name: 'Clean Edge cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Cache" 2>nul & rd /s /q "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Code Cache" 2>nul' },
        { name: 'Clean Firefox cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\Mozilla\\Firefox\\Profiles\\*\\cache2" 2>nul' },
        { name: 'Clean Brave cache', cmd: 'rd /s /q "%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache" 2>nul & rd /s /q "%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Code Cache" 2>nul' },
        // Windows Update cache
        { name: 'Clean WU cache', cmd: 'del /q /s /f "C:\\Windows\\SoftwareDistribution\\Download\\*" 2>nul' },
      ];
      let done = 0;
      for (const t of tasks) {
        const r = await cmdAsync(t.cmd, 30000);
        if (r.ok) done++;
      }
      return { action: 'temp-cleanup', done, total: tasks.length };
    }

    case 'full-optimize': {
      // Run everything: optimize + scan + updates
      const opt = await run('optimize');
      const scan = await run('scan');
      const update = await run('update');
      return { action: 'full-optimize', optimize: opt, scan: scan, update: update };
    }

    case 'speed-boost': {
      // Aggressive Windows speed optimizations — safe but impactful
      const tasks = [
        // Disable unnecessary startup services
        { name: 'Disable Connected User Experiences', cmd: 'sc config DiagTrack start= disabled & net stop DiagTrack 2>nul' },
        { name: 'Disable WAP Push Service', cmd: 'sc config dmwappushservice start= disabled & net stop dmwappushservice 2>nul' },
        { name: 'Disable Windows Tips', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SoftLandingEnabled /t REG_DWORD /d 0 /f 2>nul' },
        { name: 'Disable background apps', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 1 /f 2>nul' },
        // Network speed
        { name: 'Disable Nagle algorithm', cmd: 'powershell -NoProfile -Command "Get-ChildItem HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces | ForEach-Object { Set-ItemProperty $_.PSPath -Name TcpAckFrequency -Value 1 -ErrorAction SilentlyContinue; Set-ItemProperty $_.PSPath -Name TCPNoDelay -Value 1 -ErrorAction SilentlyContinue }" 2>nul' },
        { name: 'Optimize TCP settings', cmd: 'netsh int tcp set global autotuninglevel=normal 2>nul & netsh int tcp set global chimney=enabled 2>nul' },
        // Disk performance
        { name: 'Disable last access timestamps', cmd: 'fsutil behavior set disablelastaccess 1 2>nul' },
        { name: 'Increase NTFS memory usage', cmd: 'fsutil behavior set memoryusage 2 2>nul' },
        // Memory optimization
        { name: 'Clear standby memory', cmd: 'powershell -NoProfile -Command "[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()" 2>nul' },
        { name: 'Optimize paging', cmd: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f 2>nul' },
        // UI responsiveness
        { name: 'Reduce menu show delay', cmd: 'reg add "HKCU\\Control Panel\\Desktop" /v MenuShowDelay /t REG_SZ /d "50" /f 2>nul' },
        { name: 'Disable animations', cmd: 'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d "0" /f 2>nul' },
        { name: 'Disable transparency', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v EnableTransparency /t REG_DWORD /d 0 /f 2>nul' },
        // GPU scheduling
        { name: 'Enable hardware GPU scheduling', cmd: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f 2>nul' },
        // Power
        { name: 'Ultimate performance power plan', cmd: 'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>nul & powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61 2>nul' },
        // Disable telemetry
        { name: 'Disable telemetry', cmd: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f 2>nul' },
        { name: 'Disable Cortana', cmd: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" /v AllowCortana /t REG_DWORD /d 0 /f 2>nul' },
      ];
      let done = 0;
      for (const t of tasks) {
        const r = await cmdAsync(t.cmd, 30000);
        if (r.ok) done++;
      }
      return { action: 'speed-boost', done, total: tasks.length };
    }

    case 'memory-free': {
      // Free up RAM immediately
      const tasks = [
        { name: 'Process idle tasks', cmd: 'rundll32.exe advapi32.dll,ProcessIdleTasks' },
        { name: 'Clear standby list', cmd: 'powershell -NoProfile -Command "[System.GC]::Collect()" 2>nul' },
        { name: 'Flush working sets', cmd: 'powershell -NoProfile -Command "Get-Process | Where-Object {$_.WorkingSet64 -gt 100MB -and $_.ProcessName -ne \'System\'} | ForEach-Object { $_.MinWorkingSet = 1MB }" 2>nul' },
        { name: 'Clear DNS cache', cmd: 'ipconfig /flushdns' },
        { name: 'Clear ARP cache', cmd: 'netsh interface ip delete arpcache 2>nul' },
      ];
      let done = 0;
      for (const t of tasks) {
        const r = await cmdAsync(t.cmd, 30000);
        if (r.ok) done++;
      }
      const os = require('os');
      const freeGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
      return { action: 'memory-free', done, total: tasks.length, freeGB };
    }

    case 'network-optimize': {
      // Optimize network for speed
      const tasks = [
        { name: 'Flush DNS', cmd: 'ipconfig /flushdns' },
        { name: 'Reset Winsock', cmd: 'netsh winsock reset' },
        { name: 'Reset TCP/IP stack', cmd: 'netsh int ip reset 2>nul' },
        { name: 'Flush ARP', cmd: 'netsh interface ip delete arpcache 2>nul' },
        { name: 'Set DNS to Cloudflare', cmd: 'netsh interface ipv4 set dns "Ethernet" static 1.1.1.1 primary 2>nul & netsh interface ipv4 add dns "Ethernet" 1.0.0.1 index=2 2>nul' },
        { name: 'Disable auto-tuning', cmd: 'netsh int tcp set global autotuninglevel=disabled 2>nul' },
        { name: 'Enable RSS', cmd: 'netsh int tcp set global rss=enabled 2>nul' },
      ];
      let done = 0;
      for (const t of tasks) {
        const r = await cmdAsync(t.cmd, 30000);
        if (r.ok) done++;
      }
      return { action: 'network-optimize', done, total: tasks.length };
    }

    case 'privacy-lockdown': {
      // Disable Windows telemetry and tracking
      const tasks = [
        { name: 'Disable telemetry', cmd: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f 2>nul' },
        { name: 'Disable advertising ID', cmd: 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo" /v Enabled /t REG_DWORD /d 0 /f 2>nul' },
        { name: 'Disable activity history', cmd: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" /v EnableActivityFeed /t REG_DWORD /d 0 /f 2>nul' },
        { name: 'Disable location tracking', cmd: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors" /v DisableLocation /t REG_DWORD /d 1 /f 2>nul' },
        { name: 'Disable feedback', cmd: 'reg add "HKCU\\Software\\Microsoft\\Siuf\\Rules" /v NumberOfSIUFInPeriod /t REG_DWORD /d 0 /f 2>nul' },
        { name: 'Disable WiFi Sense', cmd: 'reg add "HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config" /v AutoConnectAllowedOEM /t REG_DWORD /d 0 /f 2>nul' },
        { name: 'Disable diagnostic data', cmd: 'sc config DiagTrack start= disabled & net stop DiagTrack 2>nul' },
        { name: 'Disable compatibility telemetry', cmd: 'schtasks /Change /TN "\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser" /Disable 2>nul' },
      ];
      let done = 0;
      for (const t of tasks) {
        const r = await cmdAsync(t.cmd, 30000);
        if (r.ok) done++;
      }
      return { action: 'privacy-lockdown', done, total: tasks.length };
    }

    default:
      return { action: command, error: 'Unknown command' };
  }
}

module.exports = { run };
