const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('financeAPI', {
    // 读取所有历史数据
    loadData: () => ipcRenderer.invoke('read-data'),
    
    // 保存当前数据 (数据结构建议为 { "2023-10": {...}, "2023-11": {...} })
    saveData: (data) => ipcRenderer.invoke('save-data', data)
});
