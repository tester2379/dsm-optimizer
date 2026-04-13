const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  runOptimizer: (cmd) => ipcRenderer.invoke('run-optimizer', cmd),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  // Running apps
  getRunningApps: () => ipcRenderer.invoke('get-running-apps'),
  closeApp: (pid, gentle) => ipcRenderer.invoke('close-app', pid, gentle),
  closeAllNonSystem: () => ipcRenderer.invoke('close-all-non-system'),
  // Uninstaller
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
  uninstallApp: (cmd) => ipcRenderer.invoke('uninstall-app', cmd),
  deepCleanApp: (installPath, name) => ipcRenderer.invoke('deep-clean-app', installPath, name),
  // Scheduler
  getSchedules: () => ipcRenderer.invoke('get-schedules'),
  saveSchedules: (s) => ipcRenderer.invoke('save-schedules', s),
  onScheduleRan: (cb) => ipcRenderer.on('schedule-ran', (_, data) => cb(data)),
  // Startup Manager (real registry)
  getStartupEntries: () => ipcRenderer.invoke('get-startup-entries'),
  toggleStartupEntry: (name, hive, enabled) => ipcRenderer.invoke('toggle-startup-entry', name, hive, enabled),
  // Disk Space Analyzer
  getDiskAnalysis: () => ipcRenderer.invoke('get-disk-analysis'),
  // Network Monitor
  getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
  // Restore Point
  createRestorePoint: () => ipcRenderer.invoke('create-restore-point'),
  // Performance Max
  applyMaxPerformance: () => ipcRenderer.invoke('apply-max-performance'),
  // Window
  minimize: () => ipcRenderer.invoke('win-minimize'),
  maximize: () => ipcRenderer.invoke('win-maximize'),
  close: () => ipcRenderer.invoke('win-close'),
  onCommand: (cb) => ipcRenderer.on('run-command', (_, cmd) => cb(cmd)),
});
