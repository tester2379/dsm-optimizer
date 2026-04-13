// ── Menu handling ───────────────────────────────────────────────────────────

let activeMenu = null;

function toggleMenu(name) {
  const dropdown = document.getElementById('dropdown-' + name);
  const menuItem = document.getElementById('menu-' + name);
  if (activeMenu === name) {
    dropdown.classList.remove('show');
    menuItem.classList.remove('active');
    activeMenu = null;
  } else {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    dropdown.classList.add('show');
    menuItem.classList.add('active');
    activeMenu = name;
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-item')) {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    activeMenu = null;
  }
});

// ── Panel switching ─────────────────────────────────────────────────────────

function showPanel(name) {
  document.querySelectorAll('.center').forEach(p => p.style.display = 'none');
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.style.display = 'block';

  if (name === 'settings') loadSettings();
  if (name === 'startup') loadStartupApps();
  if (name === 'scheduler') loadSchedules();
  if (name === 'running-apps') loadRunningApps();
  if (name === 'uninstaller') loadInstalledApps();
  if (name === 'disk-analyzer') loadDiskAnalysis();

  // Close menu
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
  activeMenu = null;
}

// ── Dashboard data ──────────────────────────────────────────────────────────

function colorForPct(pct) {
  if (pct < 50) return '#30d158';
  if (pct < 80) return '#f59e0b';
  return '#ff453a';
}

async function refreshData() {
  try {
    const info = await window.api.getSystemInfo();

    // CPU
    document.getElementById('cpu-value').textContent = info.cpu + '%';
    document.getElementById('cpu-name').textContent = (info.cpuName || '').slice(0, 40) + ' (' + info.cpuCores + ' cores)';
    document.getElementById('cpu-bar').style.width = info.cpu + '%';
    document.getElementById('cpu-bar').style.background = colorForPct(info.cpu);

    // RAM
    document.getElementById('ram-value').textContent = info.ramUsedPct + '%';
    document.getElementById('ram-sub').textContent = info.ramFreeGB + ' / ' + info.ramTotalGB + ' GB free';
    document.getElementById('ram-bar').style.width = info.ramUsedPct + '%';
    document.getElementById('ram-bar').style.background = colorForPct(info.ramUsedPct);

    // Disk
    document.getElementById('disk-value').textContent = info.diskUsedPct + '%';
    document.getElementById('disk-sub').textContent = info.diskFreeGB + ' / ' + info.diskTotalGB + ' GB free';
    document.getElementById('disk-bar').style.width = info.diskUsedPct + '%';
    document.getElementById('disk-bar').style.background = colorForPct(info.diskUsedPct);

    // Uptime
    const up = [];
    if (info.uptimeDays) up.push(info.uptimeDays + 'd');
    if (info.uptimeHours) up.push(info.uptimeHours + 'h');
    if (info.uptimeMinutes) up.push(info.uptimeMinutes + 'm');
    document.getElementById('uptime-value').textContent = up.join(' ') || '-';

    // Network
    document.getElementById('network-value').innerHTML = info.networkUp
      ? '<span class="status-dot green"></span>Online'
      : '<span class="status-dot red"></span>Offline';

    // Defender
    document.getElementById('defender-value').innerHTML = info.defenderActive
      ? '<span class="status-dot green"></span>Protected'
      : '<span class="status-dot red"></span>Disabled';
    document.getElementById('defender-sub').textContent = info.defenderLastUpdate ? 'Updated: ' + info.defenderLastUpdate : '';

    // Top processes
    const list = document.getElementById('process-list');
    list.innerHTML = '';
    const procs = Array.isArray(info.topProcesses) ? info.topProcesses : [];
    for (const p of procs) {
      const li = document.createElement('li');
      li.className = 'process-item';
      li.innerHTML = '<span class="process-name">' + (p.Name || p.name || '?') + '</span><span class="process-mem">' + (p.MB || p.mb || 0) + ' MB</span>';
      list.appendChild(li);
    }

    // Status indicator
    const indicator = document.getElementById('status-indicator');
    const healthy = info.cpu < 90 && info.ramUsedPct < 95 && info.diskUsedPct < 95 && info.defenderActive && info.networkUp;
    const warning = info.cpu > 80 || info.ramUsedPct > 85 || info.diskUsedPct > 85;
    if (healthy && !warning) indicator.innerHTML = '<span class="status-dot green"></span>Healthy';
    else if (!healthy) indicator.innerHTML = '<span class="status-dot red"></span>Critical';
    else indicator.innerHTML = '<span class="status-dot yellow"></span>Warning';

  } catch (e) {
    addLog('Refresh failed: ' + e.message, 'error');
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function runFullOptimize() {
  const btn = document.getElementById('big-optimize-btn');
  const prog = document.getElementById('optimize-progress');
  btn.style.opacity = '0.7';
  btn.style.pointerEvents = 'none';

  prog.textContent = 'Step 1/3: Cleaning system...';
  addLog('Full optimization started...', 'info');

  try {
    prog.textContent = 'Step 1/3: Cleaning system...';
    const opt = await window.api.runOptimizer('optimize');
    addLog('Cleanup done: ' + (opt.done || 0) + '/' + (opt.total || 0) + ' tasks', 'info');

    prog.textContent = 'Step 2/3: Virus scan...';
    const scan = await window.api.runOptimizer('scan');
    addLog('Virus scan done.', 'info');

    prog.textContent = 'Step 3/3: Checking updates...';
    const update = await window.api.runOptimizer('update');
    addLog('Update check done.', 'info');

    prog.textContent = 'Complete!';
    addLog('Full optimization complete!', 'info');
    refreshData();
  } catch (e) {
    prog.textContent = 'Failed!';
    addLog('Full optimization failed: ' + e.message, 'error');
  }

  setTimeout(() => { prog.textContent = ''; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }, 3000);
}

async function runAction(cmd) {
  // Close menu
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
  activeMenu = null;

  showPanel('dashboard');
  document.getElementById('action-status').textContent = 'Running: ' + cmd + '...';
  addLog('Starting: ' + cmd, 'info');

  try {
    const result = await window.api.runOptimizer(cmd);
    document.getElementById('action-status').textContent = cmd + ' complete.';
    addLog(cmd + ' completed: ' + JSON.stringify(result).slice(0, 100), 'info');
    refreshData();
  } catch (e) {
    document.getElementById('action-status').textContent = cmd + ' failed.';
    addLog(cmd + ' failed: ' + e.message, 'error');
  }
}

function addLog(msg, level = 'info') {
  const panel = document.getElementById('log-panel');
  const line = document.createElement('div');
  const ts = new Date().toLocaleTimeString('en-MT');
  line.className = 'log-line ' + level;
  line.textContent = '[' + ts + '] ' + msg;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
  // Keep last 100 lines
  while (panel.children.length > 100) panel.removeChild(panel.firstChild);
}

// ── Settings ────────────────────────────────────────────────────────────────

async function loadSettings() {
  const config = await window.api.getConfig();
  document.getElementById('setting-device-name').value = config.deviceName || '';
  document.getElementById('setting-close-apps').value = (config.appsToClose || []).join('\n');
  document.getElementById('setting-optimize-hour').value = config.autoOptimizeHour || 3;
  document.getElementById('setting-scan-day').value = config.autoScanDay || 'sunday';
}

async function saveSettings() {
  const config = await window.api.getConfig();
  config.deviceName = document.getElementById('setting-device-name').value.trim() || 'Unnamed';
  config.appsToClose = document.getElementById('setting-close-apps').value.split('\n').map(s => s.trim()).filter(Boolean);
  config.autoOptimizeHour = parseInt(document.getElementById('setting-optimize-hour').value) || 3;
  config.autoScanDay = document.getElementById('setting-scan-day').value || 'sunday';
  await window.api.saveConfig(config);
  addLog('Settings saved. Device: ' + config.deviceName, 'info');
}

// ── Startup Manager (registry-based) ────────────────────────────────────────

async function loadStartupApps() {
  const list = document.getElementById('startup-list');
  const status = document.getElementById('startup-status');
  list.innerHTML = '<div style="padding:12px; color:#555; font-size:12px;">Scanning registry...</div>';
  try {
    const entries = await window.api.getStartupEntries();
    list.innerHTML = '';
    if (entries.length === 0) {
      list.innerHTML = '<div style="padding:12px; color:#555; font-size:12px;">No startup entries found.</div>';
      return;
    }
    for (const entry of entries) {
      const div = document.createElement('div');
      div.className = 'startup-entry';
      div.innerHTML = `
        <div class="entry-info">
          <div class="entry-name">${escHtml(entry.name)}</div>
          <div class="entry-path">${escHtml(entry.path)}</div>
        </div>
        <span class="entry-hive">${entry.hive}</span>
        <button class="entry-toggle ${entry.enabled ? 'active' : ''}" onclick="toggleStartupEntry('${escHtml(entry.name)}', '${entry.hive}', ${entry.enabled})" title="${entry.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}"></button>
      `;
      list.appendChild(div);
    }
    const enabledCount = entries.filter(e => e.enabled).length;
    status.textContent = enabledCount + ' enabled / ' + entries.length + ' total startup entries';
  } catch (e) {
    list.innerHTML = '<div style="padding:12px; color:#ff453a; font-size:12px;">Error loading startup entries: ' + e.message + '</div>';
  }
}

async function toggleStartupEntry(name, hive, currentlyEnabled) {
  const action = currentlyEnabled ? 'Disabling' : 'Enabling';
  addLog(action + ' startup entry: ' + name + ' (' + hive + ')', 'info');
  const result = await window.api.toggleStartupEntry(name, hive, currentlyEnabled);
  if (result.ok) {
    addLog('Startup entry ' + (currentlyEnabled ? 'disabled' : 'enabled') + ': ' + name, 'info');
  } else {
    addLog('Failed to toggle startup entry: ' + (result.error || 'unknown error'), 'error');
  }
  loadStartupApps();
}

// ─�� Running Apps ────────────────────────────────────────────────────────────

let _runningApps = [];

async function loadRunningApps() {
  document.getElementById('running-apps-status').textContent = 'Scanning...';
  try {
    _runningApps = await window.api.getRunningApps();
    if (!Array.isArray(_runningApps)) _runningApps = [_runningApps];
    renderRunningApps(_runningApps);
    document.getElementById('running-apps-status').textContent = _runningApps.length + ' apps running';
  } catch (e) {
    document.getElementById('running-apps-status').textContent = 'Error: ' + e.message;
  }
}

function renderRunningApps(apps) {
  const list = document.getElementById('running-apps-list');
  list.innerHTML = '';
  for (const app of apps) {
    const div = document.createElement('div');
    div.className = 'app-item';
    div.dataset.name = (app.ProcessName || '').toLowerCase();
    div.innerHTML = `
      <input type="checkbox" class="app-checkbox" data-pid="${app.Id}">
      <div class="app-name">${app.MainWindowTitle || app.ProcessName}</div>
      <div class="app-detail">${app.ProcessName}.exe</div>
      <div class="app-mem">${app.MemMB || 0} MB</div>
      <div class="app-pid">PID ${app.Id}</div>
      <button class="app-close-btn" onclick="closeOneApp(${app.Id}, '${app.ProcessName}')">Close</button>
    `;
    list.appendChild(div);
  }
}

function filterApps() {
  const search = document.getElementById('app-search').value.toLowerCase();
  document.querySelectorAll('#running-apps-list .app-item').forEach(el => {
    el.style.display = el.dataset.name.includes(search) || el.querySelector('.app-name').textContent.toLowerCase().includes(search) ? '' : 'none';
  });
}

async function closeOneApp(pid, name) {
  addLog('Closing ' + name + ' (PID ' + pid + ') gently...', 'info');
  await window.api.closeApp(pid, true);
  setTimeout(loadRunningApps, 2000);
}

async function closeSelectedApps() {
  const checkboxes = document.querySelectorAll('.app-checkbox:checked');
  if (checkboxes.length === 0) return;
  addLog('Closing ' + checkboxes.length + ' selected app(s) gently...', 'info');
  for (const cb of checkboxes) {
    await window.api.closeApp(parseInt(cb.dataset.pid), true);
  }
  setTimeout(loadRunningApps, 3000);
}

async function closeAllNonSystem() {
  addLog('Closing all non-system apps gently...', 'warn');
  const count = await window.api.closeAllNonSystem();
  addLog('Closed ' + count + ' app(s).', 'info');
  setTimeout(loadRunningApps, 3000);
}

// ── Deep Uninstaller ────────────────────────────────────────────────────────

let _installedApps = [];

async function loadInstalledApps() {
  document.getElementById('uninstall-status').textContent = 'Scanning installed apps...';
  try {
    _installedApps = await window.api.getInstalledApps();
    renderInstalledApps(_installedApps);
    document.getElementById('uninstall-status').textContent = _installedApps.length + ' apps found';
  } catch (e) {
    document.getElementById('uninstall-status').textContent = 'Error: ' + e.message;
  }
}

function renderInstalledApps(apps) {
  const list = document.getElementById('installed-apps-list');
  list.innerHTML = '';
  for (const app of apps) {
    const div = document.createElement('div');
    div.className = 'app-item';
    div.dataset.name = (app.name || '').toLowerCase();
    div.innerHTML = `
      <div style="flex:1;">
        <div class="app-name">${app.name}</div>
        <div class="app-detail">${app.publisher || ''}${app.version ? ' v' + app.version : ''}</div>
      </div>
      <div class="app-size">${app.sizeMB ? app.sizeMB + ' MB' : ''}</div>
      <button class="app-uninstall-btn" onclick="uninstallApp('${escHtml(app.uninstallCmd)}', '${escHtml(app.name)}')">Uninstall</button>
      <button class="app-deep-btn" onclick="deepCleanApp('${escHtml(app.installPath)}', '${escHtml(app.name)}')">Deep Clean</button>
    `;
    list.appendChild(div);
  }
}

function escHtml(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function filterInstalledApps() {
  const search = document.getElementById('uninstall-search').value.toLowerCase();
  document.querySelectorAll('#installed-apps-list .app-item').forEach(el => {
    el.style.display = el.dataset.name.includes(search) ? '' : 'none';
  });
}

async function uninstallApp(cmd, name) {
  if (!confirm('Uninstall ' + name + '?')) return;
  addLog('Uninstalling ' + name + '...', 'warn');
  document.getElementById('uninstall-status').textContent = 'Uninstalling ' + name + '...';
  const result = await window.api.uninstallApp(cmd);
  if (result.ok) {
    addLog(name + ' uninstalled.', 'info');
    setTimeout(loadInstalledApps, 3000);
  } else {
    addLog('Uninstall failed: ' + (result.error || 'unknown'), 'error');
  }
}

async function deepCleanApp(installPath, name) {
  if (!confirm('Deep clean ' + name + '? This removes all traces (AppData, registry, temp files).')) return;
  addLog('Deep cleaning ' + name + '...', 'warn');
  document.getElementById('uninstall-status').textContent = 'Deep cleaning ' + name + '...';
  const result = await window.api.deepCleanApp(installPath, name);
  addLog('Deep clean complete: ' + (result.cleaned || []).join(', '), 'info');
  document.getElementById('uninstall-status').textContent = 'Deep clean done: ' + (result.cleaned || []).length + ' items removed';
}

// ── Scheduler ───────────────────────────────────────────────────────────────

const TASK_LABELS = {
  'full-optimize': 'FULL Optimize (Clean + Scan + Updates)',
  'optimize': 'Quick Clean',
  'scan': 'Quick Virus Scan',
  'scan-full': 'Full Virus Scan',
  'update': 'Windows Updates',
  'close-apps': 'Close Apps',
  'temp-cleanup': 'Temp Cleanup',
  'restart': 'Restart Windows',
};

async function loadSchedules() {
  const schedules = await window.api.getSchedules();
  renderSchedules(schedules);
}

function toggleScheduleMode() {
  const mode = document.getElementById('schedule-mode').value;
  document.getElementById('schedule-time-group').style.display = mode === 'daily' ? '' : 'none';
  document.getElementById('schedule-interval-group').style.display = mode === 'interval' ? '' : 'none';
}

function renderSchedules(schedules) {
  const list = document.getElementById('schedule-list');
  list.innerHTML = '';
  if (schedules.length === 0) {
    list.innerHTML = '<div style="padding:20px; text-align:center; color:#555; font-size:12px;">No scheduled tasks. Add one above.</div>';
    return;
  }

  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    const div = document.createElement('div');
    div.className = 'schedule-item';
    const label = s.intervalHours
      ? 'Every ' + s.intervalHours + 'h'
      : s.time;
    const desc = s.intervalHours
      ? 'Runs every ' + s.intervalHours + ' hour' + (s.intervalHours > 1 ? 's' : '')
      : 'Daily at ' + s.time;
    div.innerHTML = `
      <div class="schedule-time">${label}</div>
      <div>
        <div class="schedule-task">${TASK_LABELS[s.task] || s.task}</div>
        <div class="schedule-next">${desc}</div>
      </div>
      <button class="schedule-toggle ${s.enabled ? 'active' : ''}" onclick="toggleSchedule(${i})" title="${s.enabled ? 'Enabled' : 'Disabled'}"></button>
      <button class="schedule-remove" onclick="removeSchedule(${i})">Remove</button>
    `;
    list.appendChild(div);
  }
  document.getElementById('schedule-status').textContent = schedules.filter(s => s.enabled).length + ' active / ' + schedules.length + ' total';
}

async function addSchedule() {
  const mode = document.getElementById('schedule-mode').value;
  const task = document.getElementById('schedule-task').value;

  const schedules = await window.api.getSchedules();

  if (mode === 'interval') {
    const intervalHours = parseInt(document.getElementById('schedule-interval').value);
    if (schedules.some(s => s.intervalHours === intervalHours && s.task === task)) {
      addLog('Schedule already exists: every ' + intervalHours + 'h ' + task, 'warn');
      return;
    }
    schedules.push({ task, enabled: true, intervalHours, lastRun: 0 });
    await window.api.saveSchedules(schedules);
    renderSchedules(schedules);
    addLog('Schedule added: ' + task + ' every ' + intervalHours + 'h', 'info');
  } else {
    const time = document.getElementById('schedule-time').value;
    if (!time) return;
    if (schedules.some(s => s.time === time && s.task === task)) {
      addLog('Schedule already exists: ' + time + ' ' + task, 'warn');
      return;
    }
    schedules.push({ time, task, enabled: true });
    schedules.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    await window.api.saveSchedules(schedules);
    renderSchedules(schedules);
    addLog('Schedule added: ' + task + ' at ' + time, 'info');
    document.getElementById('schedule-time').value = '';
  }
}

async function toggleSchedule(index) {
  const schedules = await window.api.getSchedules();
  if (schedules[index]) {
    schedules[index].enabled = !schedules[index].enabled;
    await window.api.saveSchedules(schedules);
    renderSchedules(schedules);
  }
}

async function removeSchedule(index) {
  const schedules = await window.api.getSchedules();
  const removed = schedules.splice(index, 1);
  await window.api.saveSchedules(schedules);
  renderSchedules(schedules);
  if (removed[0]) addLog('Schedule removed: ' + removed[0].task + ' at ' + removed[0].time, 'info');
}

// Listen for scheduled task completion
window.api.onScheduleRan((data) => {
  addLog('Scheduled task ran: ' + data.task + ' at ' + data.time, 'info');
  refreshData();
});

// ── Disk Space Analyzer ─────────────────────────────────────────────────────

async function loadDiskAnalysis() {
  const content = document.getElementById('disk-analysis-content');
  content.innerHTML = '<div style="padding:20px; text-align:center; color:#888; font-size:12px;">Analyzing disk usage... this may take a moment.</div>';
  addLog('Disk analysis started...', 'info');

  try {
    const data = await window.api.getDiskAnalysis();
    let html = '';

    // Top folders
    const maxFolderSize = Math.max(...data.folders.map(f => f.sizeMB), 1);
    html += '<div class="disk-section"><div class="disk-section-title">Top Folders on C:</div>';
    for (const f of data.folders.sort((a, b) => b.sizeMB - a.sizeMB)) {
      const pct = Math.round((f.sizeMB / maxFolderSize) * 100);
      const color = f.sizeMB > 10000 ? '#ff453a' : f.sizeMB > 5000 ? '#f59e0b' : '#3b82f6';
      html += `<div class="disk-bar-item">
        <div class="bar-label">${f.path}</div>
        <div class="bar-wrapper"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
        <div class="bar-size">${f.sizeGB} GB</div>
      </div>`;
    }
    html += '</div>';

    // Browser caches
    html += '<div class="disk-section"><div class="disk-section-title">Browser Caches</div>';
    for (const c of data.browserCaches.sort((a, b) => b.sizeMB - a.sizeMB)) {
      const pct = Math.min(100, Math.round(c.sizeMB / 5));
      const color = c.sizeMB > 500 ? '#ff453a' : c.sizeMB > 100 ? '#f59e0b' : '#30d158';
      html += `<div class="disk-bar-item">
        <div class="bar-label">${c.name}</div>
        <div class="bar-wrapper"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
        <div class="bar-size">${c.sizeMB} MB</div>
      </div>`;
    }
    html += '</div>';

    // Temp folders
    html += '<div class="disk-section"><div class="disk-section-title">Temp / Cleanup Targets</div>';
    let totalTemp = 0;
    for (const t of data.tempFolders.sort((a, b) => b.sizeMB - a.sizeMB)) {
      totalTemp += t.sizeMB;
      const pct = Math.min(100, Math.round(t.sizeMB / 5));
      const color = t.sizeMB > 500 ? '#ff453a' : t.sizeMB > 100 ? '#f59e0b' : '#30d158';
      html += `<div class="disk-bar-item">
        <div class="bar-label">${t.name}</div>
        <div class="bar-wrapper"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
        <div class="bar-size">${t.sizeMB} MB</div>
      </div>`;
    }
    html += `<div style="text-align:right; font-size:12px; color:#f59e0b; margin-top:8px; font-weight:600;">Total cleanable: ~${totalTemp} MB</div>`;
    html += '</div>';

    content.innerHTML = html;
    addLog('Disk analysis complete.', 'info');
  } catch (e) {
    content.innerHTML = '<div style="padding:20px; color:#ff453a; font-size:12px;">Disk analysis failed: ' + e.message + '</div>';
    addLog('Disk analysis failed: ' + e.message, 'error');
  }
}

// ── Network Monitor (enhanced) ──────────────────────────────────────────────

async function refreshNetworkInfo() {
  try {
    const net = await window.api.getNetworkInfo();
    const adapterEl = document.getElementById('net-adapter');
    const bwEl = document.getElementById('net-bandwidth');
    if (adapterEl) adapterEl.textContent = (net.adapter || 'Unknown') + ' - ' + (net.speed || '?');
    if (bwEl) {
      const fmtRate = (bytes) => {
        if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB/s';
        if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB/s';
        return bytes + ' B/s';
      };
      bwEl.textContent = 'Up: ' + fmtRate(net.sendRate) + ' / Down: ' + fmtRate(net.recvRate);
    }
  } catch {}
}

// ── Restore Point ───────────────────────────────────────────────────────────

async function createRestorePoint() {
  addLog('Creating system restore point...', 'info');
  document.getElementById('action-status').textContent = 'Creating restore point...';
  try {
    const result = await window.api.createRestorePoint();
    if (result.ok) {
      addLog('System restore point created successfully.', 'info');
      document.getElementById('action-status').textContent = 'Restore point created.';
    } else {
      addLog('Restore point failed: ' + (result.error || 'unknown'), 'warn');
      document.getElementById('action-status').textContent = 'Restore point: ' + (result.error || 'failed');
    }
  } catch (e) {
    addLog('Restore point error: ' + e.message, 'error');
    document.getElementById('action-status').textContent = 'Restore point failed.';
  }
}

// ── Max Performance Toggle ──────────────────────────────────────────────────

async function loadPerfToggle() {
  try {
    const config = await window.api.getConfig();
    const btn = document.getElementById('perf-toggle');
    if (btn) {
      if (config.maxPerformance) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  } catch {}
}

async function toggleMaxPerformance() {
  const btn = document.getElementById('perf-toggle');
  const config = await window.api.getConfig();
  const newState = !config.maxPerformance;
  config.maxPerformance = newState;
  await window.api.saveConfig(config);

  if (newState) {
    btn.classList.add('active');
    addLog('Max Performance enabled — applying settings...', 'info');
    document.getElementById('action-status').textContent = 'Applying max performance...';
    const result = await window.api.applyMaxPerformance();
    addLog('Max Performance applied: ' + (result.done || 0) + '/' + (result.total || 0) + ' tasks', 'info');
    document.getElementById('action-status').textContent = 'Max Performance ON.';
  } else {
    btn.classList.remove('active');
    addLog('Max Performance disabled. Changes will not auto-apply on next startup.', 'info');
    document.getElementById('action-status').textContent = 'Max Performance OFF.';
  }
}

// ── Full Optimize with Restore Point ────────────────────────────────────────
// Override the existing runFullOptimize to create a restore point first

const _originalRunFullOptimize = runFullOptimize;

async function runFullOptimizeWithRestore() {
  const btn = document.getElementById('big-optimize-btn');
  const prog = document.getElementById('optimize-progress');
  btn.style.opacity = '0.7';
  btn.style.pointerEvents = 'none';

  // Step 0: Create restore point
  prog.textContent = 'Creating restore point...';
  addLog('Full optimization: creating restore point first...', 'info');
  try {
    const rp = await window.api.createRestorePoint();
    if (rp.ok) addLog('Restore point created.', 'info');
    else addLog('Restore point skipped: ' + (rp.error || ''), 'warn');
  } catch (e) {
    addLog('Restore point failed: ' + e.message, 'warn');
  }

  prog.textContent = 'Step 1/3: Cleaning system...';
  addLog('Full optimization started...', 'info');

  try {
    const opt = await window.api.runOptimizer('optimize');
    addLog('Cleanup done: ' + (opt.done || 0) + '/' + (opt.total || 0) + ' tasks', 'info');

    prog.textContent = 'Step 2/3: Virus scan...';
    const scan = await window.api.runOptimizer('scan');
    addLog('Virus scan done.', 'info');

    prog.textContent = 'Step 3/3: Checking updates...';
    const update = await window.api.runOptimizer('update');
    addLog('Update check done.', 'info');

    prog.textContent = 'Complete!';
    addLog('Full optimization complete!', 'info');
    refreshData();
  } catch (e) {
    prog.textContent = 'Failed!';
    addLog('Full optimization failed: ' + e.message, 'error');
  }

  setTimeout(() => { prog.textContent = ''; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }, 3000);
}

// Replace the original optimize button handler
document.getElementById('big-optimize-btn').onclick = runFullOptimizeWithRestore;

// ── Tray command handler ────────────────────────────────────────────────────

window.api.onCommand((cmd) => {
  runAction(cmd);
});

// ── Auto refresh ────────────────────────────────────────────────────────────

refreshData();
loadPerfToggle();
setInterval(refreshData, 10000); // Every 10 seconds
setInterval(refreshNetworkInfo, 5000); // Network bandwidth every 5 seconds
refreshNetworkInfo(); // Initial network info
