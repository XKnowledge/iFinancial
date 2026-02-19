const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = path.join(__dirname, 'data.json');

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, // 必须开启以保障安全
            nodeIntegration: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// 读取数据 API
ipcMain.handle('read-data', async () => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return {}; // 文件不存在返回空对象
        }
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取文件失败:', error);
        return {};
    }
});

// 保存数据 API
ipcMain.handle('save-data', async (event, data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (error) {
        console.error('保存文件失败:', error);
        return { success: false, error: error.message };
    }
});
