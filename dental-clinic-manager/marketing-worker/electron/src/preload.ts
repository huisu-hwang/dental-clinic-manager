import { contextBridge, ipcRenderer } from 'electron';

// ============================================
// Preload 스크립트
// contextBridge로 renderer에 electronAPI 노출
// ============================================

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  testConnection: (data: { dashboardUrl: string; workerApiKey: string }) =>
    ipcRenderer.invoke('test-connection', data),
  saveConfig: (data: { dashboardUrl: string; workerApiKey: string }) =>
    ipcRenderer.invoke('save-config', data),
  // 상태 창 IPC
  getWorkerStatus: () => ipcRenderer.invoke('get-worker-status'),
  toggleWorker: () => ipcRenderer.invoke('toggle-worker'),
  getVersionInfo: () => ipcRenderer.invoke('get-version-info'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
});
