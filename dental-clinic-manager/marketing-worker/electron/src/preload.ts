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
});
