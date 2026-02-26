// --- Constants & State ---
const STORAGE_KEY = 'finance_data_v1';
const DEFAULT_MONTH = '2026-02';

// 全局数据缓存
let allDataCache = {};
// 记录当前加载的月份，用于切换时保存
let lastLoadedMonth = null;

// DOM Elements
const els = {
    pageInput: document.getElementById('page-input'),
    pageCharts: document.getElementById('page-charts'),
    monthSelector: document.getElementById('month-selector'),
    btnSave: document.getElementById('btn-save'),
    btnDelete: document.getElementById('btn-delete'),
    btnViewHistory: document.getElementById('btn-view-history'),
    btnBack: document.getElementById('btn-back'),

    // Inputs
    inputs: {
        assets: document.querySelectorAll('input[data-calc="asset"]'),
        liabilities: document.querySelectorAll('input[data-calc="liability"]'),
        incomes: document.querySelectorAll('input[data-calc="income"]'),
        equity: document.getElementById('input-equity'),
        salary: document.getElementById('input-salary'),
        newInvestment: document.getElementById('input-new-investment')
    },

    // Outputs
    outputs: {
        totalAssets: document.getElementById('val-total-assets'),
        totalLiabilities: document.getElementById('val-total-liabilities'),
        netWorth: document.getElementById('val-net-worth'),
        investmentIncome: document.getElementById('val-investment-income'),
        totalIncome: document.getElementById('val-total-income'),
        totalExpenses: document.getElementById('val-total-expenses'),
        netIncome: document.getElementById('val-net-income'),
        invIncomeCheck: document.getElementById('val-inv-income-check'),
        roe: document.getElementById('val-roe')
    },

    // Charts
    chartLine: document.getElementById('chart-line'),
    chartBar: document.getElementById('chart-bar')
};

let chartInstances = {
    line: null,
    bar: null
};

// Flag to ensure resize event is only bound once
let resizeEventBound = false;

// --- Theme Management ---
function initTheme() {
    setTheme('dark');
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#btn-theme svg');
    if (icon) {
        icon.classList.remove('fa-moon', 'fa-sun');
        icon.classList.add(theme === 'dark' ? 'fa-moon' : 'fa-sun');
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    // Re-render charts if they're visible
    if (!els.pageCharts.classList.contains('hidden')) {
        renderCharts();
    }
}

function getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
        text: style.getPropertyValue('--chart-text').trim(),
        tooltipBg: style.getPropertyValue('--chart-tooltip-bg').trim(),
        tooltipBorder: style.getPropertyValue('--chart-tooltip-border').trim(),
        tooltipText: style.getPropertyValue('--chart-tooltip-text').trim(),
        axisLine: style.getPropertyValue('--chart-axis-line').trim(),
        splitLine: style.getPropertyValue('--chart-split-line').trim(),
        emerald: style.getPropertyValue('--chart-emerald').trim(),
        red: style.getPropertyValue('--chart-red').trim(),
        gold: style.getPropertyValue('--chart-gold').trim(),
        goldAreaStart: style.getPropertyValue('--chart-gold-area-start').trim(),
        goldAreaEnd: style.getPropertyValue('--chart-gold-area-end').trim()
    };
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme
    initTheme();
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);

    // Set default month to current month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const defaultMonth = `${currentYear}-${currentMonth}`;
    els.monthSelector.value = defaultMonth;

    // Bind Events
    els.monthSelector.addEventListener('change', handleMonthChange);
    els.btnSave.addEventListener('click', saveData);
    els.btnDelete.addEventListener('click', deleteMonthData);
    els.btnViewHistory.addEventListener('click', showChartsPage);
    els.btnBack.addEventListener('click', showInputPage);

    // 窗口控制按钮事件
    document.getElementById('btn-minimize').addEventListener('click', async () => {
        if (window.financeAPI && window.financeAPI.minimizeWindow) {
            await window.financeAPI.minimizeWindow();
        }
    });

    document.getElementById('btn-maximize').addEventListener('click', async () => {
        if (window.financeAPI && window.financeAPI.maximizeWindow) {
            await window.financeAPI.maximizeWindow();
            // 更新最大化图标
            const isMax = await window.financeAPI.isMaximized();
            const icon = document.querySelector('#btn-maximize svg');
            if (icon) {
                if (isMax) {
                    icon.classList.remove('fa-square');
                    icon.classList.add('fa-down-left-and-up-right-to-center');
                } else {
                    icon.classList.remove('fa-down-left-and-up-right-to-center');
                    icon.classList.add('fa-square');
                }
                icon.style.color = 'var(--window-btn-icon)';
            }
        }
    });

    document.getElementById('btn-close').addEventListener('click', async () => {
        if (window.financeAPI && window.financeAPI.closeWindow) {
            await window.financeAPI.closeWindow();
        }
    });

    // Bind input events for auto-calculation
    const allInputs = document.querySelectorAll('input[type="number"]');
    allInputs.forEach(input => {
        input.addEventListener('input', calculate);
    });

    // Ctrl+S 快捷键保存
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveData();
        }
    });

    // 窗口关闭前自动保存
    window.addEventListener('beforeunload', async () => {
        if (lastLoadedMonth && checkHasAnyInput()) {
            await saveDataSilent(lastLoadedMonth);
        }
    });

    // 从 JSON 文件加载数据
    await loadAllData();
    // Initial Load
    loadMonthData(defaultMonth);
});

// 从 JSON 文件加载所有数据
async function loadAllData() {
    try {
        if (window.financeAPI && window.financeAPI.loadData) {
            allDataCache = await window.financeAPI.loadData();
            // 按时间顺序排序数据
            allDataCache = sortDataByMonth(allDataCache);
            // 重新计算所有月份的数据并保存
            await recalculateAllMonths();
        } else {
            allDataCache = {};
        }
    } catch (error) {
        allDataCache = {};
    }
}

// 辅助函数：保留2位小数
function round2(val) {
    return Math.round(val * 100) / 100;
}

// 重新计算所有月份的数据
async function recalculateAllMonths() {
    const months = Object.keys(allDataCache).sort();
    if (months.length === 0) return;

    for (const month of months) {
        const data = allDataCache[month];

        // 计算资产负债表
        const totalAssets = round2(parseNum(data.cash) + parseNum(data.bankDeposit) + parseNum(data.equity) + parseNum(data.realEstate));
        const totalLiabilities = round2(parseNum(data.creditCard) + parseNum(data.bankLoan));
        const netWorth = round2(totalAssets - totalLiabilities);

        // 获取上月数据
        const prevMonth = getPrevMonth(month);
        const prevData = allDataCache[prevMonth];

        // 计算投资收入
        let investmentIncome = null;
        if (prevData && prevData.equity !== undefined) {
            const prevEquity = parseNum(prevData.equity);
            const newInvestment = parseNum(data.newInvestment);
            const equity = parseNum(data.equity);
            investmentIncome = round2(equity - prevEquity - newInvestment);
        }

        // 计算总收入
        const salary = parseNum(data.salary);
        const otherIncome = parseNum(data.otherIncome);
        let totalIncome = round2(salary + otherIncome);
        if (investmentIncome !== null) {
            totalIncome = round2(totalIncome + investmentIncome);
        }

        // 计算生活支出
        let totalExpenses = null;
        if (prevData && prevData.netWorth !== undefined && investmentIncome !== null) {
            const prevNetWorth = parseNum(prevData.netWorth);
            totalExpenses = round2(prevNetWorth + totalIncome - netWorth);
        }

        // 计算净收入
        let netIncome = null;
        if (totalExpenses !== null) {
            netIncome = round2(totalIncome - totalExpenses);
        }

        // 计算 ROE
        let roe = null;
        if (netWorth !== 0) {
            roe = round2((salary * 12) / netWorth);
        }

        // 更新数据
        allDataCache[month] = {
            ...data,
            totalAssets,
            totalLiabilities,
            netWorth,
            investmentIncome,
            totalIncome,
            totalExpenses,
            netIncome,
            roe
        };
    }

    // 保存更新后的数据
    try {
        if (window.financeAPI && window.financeAPI.saveData) {
            const sortedCache = sortDataByMonth(allDataCache);
            await window.financeAPI.saveData(sortedCache);
        }
    } catch (error) {
        console.error('重新计算后保存失败:', error);
    }
}

// --- Core Logic ---

// Helper: Get previous month string (YYYY-MM)
function getPrevMonth(ym) {
    const [year, month] = ym.split('-').map(Number);
    let prevDate = new Date(year, month - 2, 1); // month-1 is 0-indexed, so subtract 2 to go back one
    const prevYear = prevDate.getFullYear();
    const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
    return `${prevYear}-${prevMonth}`;
}

// Helper: Safe number parsing (handles formatted numbers with commas)
function parseNum(val) {
    if (val === null || val === undefined || val === '' || val === 'NA') return 0;
    // Remove thousand separators (commas) before parsing
    const cleanVal = String(val).replace(/,/g, '');
    const n = parseFloat(cleanVal);
    return isNaN(n) ? 0 : n;
}

// Helper: Format number
function formatNum(val) {
    if (val === null || val === undefined || isNaN(val)) return 'NA';
    return val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Load data for a specific month
function loadMonthData(month) {
    const monthData = allDataCache[month] || {};
    // 更新当前加载的月份
    lastLoadedMonth = month;

    // Helper: 如果值为 undefined 或 null，返回 0，否则返回原值
    const defaultZero = (val) => (val !== undefined && val !== null && val !== '') ? val : 0;

    // Map specific fields based on order or IDs if needed
    // Order defined in HTML: Cash, Bank, Equity, RealEstate
    const assetInputs = Array.from(els.inputs.assets);
    assetInputs[0].value = defaultZero(monthData.cash);
    assetInputs[1].value = defaultZero(monthData.bankDeposit);
    assetInputs[2].value = defaultZero(monthData.equity);
    assetInputs[3].value = defaultZero(monthData.realEstate);

    // Order: CreditCard, BankLoan
    const liabilityInputs = Array.from(els.inputs.liabilities);
    liabilityInputs[0].value = defaultZero(monthData.creditCard);
    liabilityInputs[1].value = defaultZero(monthData.bankLoan);

    // Order: Salary, OtherIncome
    const incomeInputs = Array.from(els.inputs.incomes);
    incomeInputs[0].value = defaultZero(monthData.salary);
    incomeInputs[1].value = defaultZero(monthData.otherIncome);

    els.inputs.newInvestment.value = defaultZero(monthData.newInvestment);

    // 执行计算获取基础值
    calculate();

    // 如果有保存的计算值且不是 null，则使用保存的值覆盖显示
    // 这样即使上月数据缺失，也能显示已保存的计算结果
    if (monthData.totalAssets !== undefined && monthData.totalAssets !== null) {
        els.outputs.totalAssets.textContent = formatNum(monthData.totalAssets);
    }
    if (monthData.totalLiabilities !== undefined && monthData.totalLiabilities !== null) {
        els.outputs.totalLiabilities.textContent = formatNum(monthData.totalLiabilities);
    }
    if (monthData.netWorth !== undefined && monthData.netWorth !== null) {
        els.outputs.netWorth.textContent = formatNum(monthData.netWorth);
    }
    if (monthData.investmentIncome !== undefined && monthData.investmentIncome !== null) {
        els.outputs.investmentIncome.textContent = formatNum(monthData.investmentIncome);
        els.outputs.invIncomeCheck.textContent = formatNum(monthData.investmentIncome);
    }
    if (monthData.totalIncome !== undefined && monthData.totalIncome !== null) {
        els.outputs.totalIncome.textContent = formatNum(monthData.totalIncome);
    }
    if (monthData.totalExpenses !== undefined && monthData.totalExpenses !== null) {
        els.outputs.totalExpenses.textContent = formatNum(monthData.totalExpenses);
    }
    if (monthData.netIncome !== undefined && monthData.netIncome !== null) {
        els.outputs.netIncome.textContent = formatNum(monthData.netIncome);
    }
    if (monthData.roe !== undefined && monthData.roe !== null) {
        els.outputs.roe.textContent = (monthData.roe * 100).toFixed(2) + '%';
    }
}

// Handle Month Selector Change
async function handleMonthChange(e) {
    const newMonth = e.target.value;
    if (!newMonth) return;

    // 如果新月份与当前加载的月份相同，不需要操作
    if (newMonth === lastLoadedMonth) {
        return;
    }

    // 保存当前正在编辑的月份的数据（在切换之前）
    if (lastLoadedMonth) {
        await autoSaveCurrentMonth(lastLoadedMonth);
    }

    // 加载新月份的数据
    loadMonthData(newMonth);
}

// 切换月份前自动保存当前月份的数据
async function autoSaveCurrentMonth(month) {
    // 检查是否有任何输入值
    const hasAnyInput = checkHasAnyInput();

    if (!hasAnyInput) {
        return; // 没有输入内容，跳过保存
    }

    // 保存数据（静默保存，不显示提示）
    await saveDataSilent(month);
}

// 检查是否有任何输入值
function checkHasAnyInput() {
    const allInputs = document.querySelectorAll('input[type="number"]');
    for (const input of allInputs) {
        if (input.value && input.value.trim() !== '') {
            return true;
        }
    }
    return false;
}

// 静默保存数据（不显示 toast）
async function saveDataSilent(month) {
    // Gather inputs
    const assetInputs = Array.from(els.inputs.assets).map(el => parseNum(el.value));
    const liabilityInputs = Array.from(els.inputs.liabilities).map(el => parseNum(el.value));
    const incomeInputs = Array.from(els.inputs.incomes).map(el => parseNum(el.value));
    const newInvestment = parseNum(els.inputs.newInvestment.value);

    // Get calculated values directly from calculate function
    const calcResults = calculate();

    const dataToSave = {
        cash: assetInputs[0],
        bankDeposit: assetInputs[1],
        equity: assetInputs[2],
        realEstate: assetInputs[3],
        creditCard: liabilityInputs[0],
        bankLoan: liabilityInputs[1],
        salary: incomeInputs[0],
        otherIncome: incomeInputs[1],
        newInvestment: newInvestment,
        // Store calculated results directly from calculation
        totalAssets: calcResults.totalAssets,
        totalLiabilities: calcResults.totalLiabilities,
        netWorth: calcResults.netWorth,
        investmentIncome: calcResults.investmentIncome,
        totalIncome: calcResults.totalIncome,
        totalExpenses: calcResults.totalExpenses,
        netIncome: calcResults.netIncome,
        roe: calcResults.roe,
        updatedAt: new Date().toISOString()
    };

    // 更新缓存
    allDataCache[month] = dataToSave;

    // 按时间顺序排序数据
    const sortedCache = sortDataByMonth(allDataCache);

    // 保存到 JSON 文件
    try {
        if (window.financeAPI && window.financeAPI.saveData) {
            await window.financeAPI.saveData(sortedCache);
        }
    } catch (error) {
        // 静默失败，不显示错误提示
        console.error('自动保存失败:', error);
    }
}

// 按月份时间顺序排序数据
function sortDataByMonth(data) {
    const sortedKeys = Object.keys(data).sort();
    const sortedData = {};
    for (const key of sortedKeys) {
        sortedData[key] = data[key];
    }
    return sortedData;
}

// Calculation Engine
function calculate() {
    // 1. Get Inputs
    const assetInputs = Array.from(els.inputs.assets).map(el => parseNum(el.value));
    const [cash, bankDeposit, equity, realEstate] = assetInputs;

    const liabilityInputs = Array.from(els.inputs.liabilities).map(el => parseNum(el.value));
    const [creditCard, bankLoan] = liabilityInputs;

    const incomeInputs = Array.from(els.inputs.incomes).map(el => parseNum(el.value));
    const [salary, otherIncome] = incomeInputs;

    const newInvestment = parseNum(els.inputs.newInvestment.value);

    // 2. Basic Calculations
    const totalAssets = round2(cash + bankDeposit + equity + realEstate);
    const totalLiabilities = round2(creditCard + bankLoan);
    const netWorth = round2(totalAssets - totalLiabilities);

    // Update UI for basic calcs
    els.outputs.totalAssets.textContent = formatNum(totalAssets);
    els.outputs.totalLiabilities.textContent = formatNum(totalLiabilities);
    els.outputs.netWorth.textContent = formatNum(netWorth);

    // 3. Advanced Calculations (Need Previous Month Data)
    const currentMonth = els.monthSelector.value;
    const prevMonth = getPrevMonth(currentMonth);

    const prevData = allDataCache[prevMonth];

    let investmentIncome = 'NA';
    let totalExpenses = 'NA';
    let netIncome = 'NA';
    let roe = 'NA';

    // Investment Income = CurrEquity - PrevEquity - NewInvestment
    if (prevData && prevData.equity !== undefined) {
        const prevEquity = parseNum(prevData.equity);
        const calcInvIncome = round2(equity - prevEquity - newInvestment);
        investmentIncome = calcInvIncome; // Keep as number for further calc
        els.outputs.investmentIncome.textContent = formatNum(calcInvIncome);
        els.outputs.invIncomeCheck.textContent = formatNum(calcInvIncome);
    } else {
        els.outputs.investmentIncome.textContent = 'NA';
        els.outputs.invIncomeCheck.textContent = 'NA';
    }

    // Total Income = Salary + OtherIncome + InvestmentIncome
    let totalIncome = round2(salary + otherIncome);
    if (typeof investmentIncome === 'number') {
        totalIncome = round2(totalIncome + investmentIncome);
    }
    els.outputs.totalIncome.textContent = formatNum(totalIncome);

    // Total Expenses = PrevNetWorth + CurrTotalIncome - CurrNetWorth
    if (prevData && prevData.netWorth !== undefined && typeof investmentIncome === 'number') {
        const prevNetWorth = parseNum(prevData.netWorth);
        const calcExpenses = round2(prevNetWorth + totalIncome - netWorth);
        totalExpenses = calcExpenses;
        els.outputs.totalExpenses.textContent = formatNum(calcExpenses);
    } else {
        els.outputs.totalExpenses.textContent = 'NA';
    }

    // Net Income = TotalIncome - TotalExpenses
    if (typeof totalExpenses === 'number') {
        netIncome = round2(totalIncome - totalExpenses);
        els.outputs.netIncome.textContent = formatNum(netIncome);
    } else {
        els.outputs.netIncome.textContent = 'NA';
    }

    // ROE = (Salary * 12) / NetWorth (display as percentage)
    if (netWorth !== 0) {
        const calcRoe = round2((salary * 12) / netWorth);
        roe = calcRoe;
        els.outputs.roe.textContent = (calcRoe * 100).toFixed(2) + '%';
    } else {
        els.outputs.roe.textContent = 'NA';
    }

    // Return calculated values for saveData to use directly
    return {
        totalAssets,
        totalLiabilities,
        netWorth,
        investmentIncome: typeof investmentIncome === 'number' ? investmentIncome : null,
        totalIncome,
        totalExpenses: typeof totalExpenses === 'number' ? totalExpenses : null,
        netIncome: typeof netIncome === 'number' ? netIncome : null,
        roe
    };
}

// Save Data
async function saveData() {
    const currentMonth = els.monthSelector.value;
    if (!currentMonth) {
        showToast('请选择有效的月份', 'error');
        return;
    }

    // Gather inputs
    const assetInputs = Array.from(els.inputs.assets).map(el => parseNum(el.value));
    const liabilityInputs = Array.from(els.inputs.liabilities).map(el => parseNum(el.value));
    const incomeInputs = Array.from(els.inputs.incomes).map(el => parseNum(el.value));
    const newInvestment = parseNum(els.inputs.newInvestment.value);

    // Get calculated values directly from calculate function
    const calcResults = calculate();

    const dataToSave = {
        cash: assetInputs[0],
        bankDeposit: assetInputs[1],
        equity: assetInputs[2],
        realEstate: assetInputs[3],
        creditCard: liabilityInputs[0],
        bankLoan: liabilityInputs[1],
        salary: incomeInputs[0],
        otherIncome: incomeInputs[1],
        newInvestment: newInvestment,
        // Store calculated results directly from calculation
        totalAssets: calcResults.totalAssets,
        totalLiabilities: calcResults.totalLiabilities,
        netWorth: calcResults.netWorth,
        investmentIncome: calcResults.investmentIncome,
        totalIncome: calcResults.totalIncome,
        totalExpenses: calcResults.totalExpenses,
        netIncome: calcResults.netIncome,
        roe: calcResults.roe,
        updatedAt: new Date().toISOString()
    };

    // 更新缓存
    allDataCache[currentMonth] = dataToSave;

    // 按时间顺序排序数据
    const sortedCache = sortDataByMonth(allDataCache);

    // 保存到 JSON 文件
    try {
        if (window.financeAPI && window.financeAPI.saveData) {
            const result = await window.financeAPI.saveData(sortedCache);
            if (result.success) {
                showToast(`${currentMonth} 数据已保存到文件`, 'success');
            } else {
                showToast(`保存失败: ${result.error}`, 'error');
            }
        } else {
            showToast(`保存失败: ${error.message}`, 'error');
        }
    } catch (error) {
        showToast(`保存失败: ${error.message}`, 'error');
    }
}

// Delete Month Data
async function deleteMonthData() {
    const currentMonth = els.monthSelector.value;
    if (!currentMonth) {
        showToast('请选择有效的月份', 'error');
        return;
    }

    // Check if data exists for this month
    if (!allDataCache[currentMonth]) {
        showToast(`${currentMonth} 没有数据`, 'warning');
        return;
    }

    // Show custom confirm modal
    const confirmed = await showConfirmModal(`确定要删除 ${currentMonth} 的数据吗？此操作不可恢复。`);
    if (!confirmed) {
        return;
    }

    // Delete the month data from cache
    delete allDataCache[currentMonth];

    // 按时间顺序排序数据
    const sortedCache = sortDataByMonth(allDataCache);

    // Save to JSON file
    try {
        if (window.financeAPI && window.financeAPI.saveData) {
            const result = await window.financeAPI.saveData(sortedCache);
            if (result.success) {
                showToast(`${currentMonth} 数据已删除`, 'success');
                // Clear input fields
                els.inputs.assets.forEach(el => el.value = '');
                els.inputs.liabilities.forEach(el => el.value = '');
                els.inputs.incomes.forEach(el => el.value = '');
                els.inputs.newInvestment.value = '';
                calculate();
            } else {
                showToast(`删除失败: ${result.error}`, 'error');
            }
        } else {
            showToast(`删除失败: ${error.message}`, 'error');
        }
    } catch (error) {
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

// --- Navigation & Charts ---

function showInputPage() {
    els.pageInput.classList.remove('hidden');
    els.pageCharts.classList.add('hidden');
    // 显示输入页面控制栏，隐藏图表页面头部
    document.querySelector('.sticky-controls').classList.remove('hidden');
    document.getElementById('charts-header').classList.add('hidden');
    // Recalculate just in case
    calculate();
}

async function showChartsPage() {
    // 先保存当前正在编辑的月份数据到缓存
    if (lastLoadedMonth && checkHasAnyInput()) {
        await saveDataSilent(lastLoadedMonth);
    }
    els.pageInput.classList.add('hidden');
    els.pageCharts.classList.remove('hidden');
    // 隐藏输入页面控制栏，显示图表页面头部
    document.querySelector('.sticky-controls').classList.add('hidden');
    document.getElementById('charts-header').classList.remove('hidden');
    // 在显示图表之前重新计算数据
    await recalculateAllMonths();
    renderCharts();
}

function renderCharts() {
    if (!allDataCache || Object.keys(allDataCache).length === 0) {
        showToast('暂无历史数据', 'warning');
        return;
    }

    const allMonths = Object.keys(allDataCache).sort();

    if (allMonths.length === 0) return;

    // 跳过第一个月（初始月），从第二个月开始绘制
    const months = allMonths.slice(1);

    if (months.length === 0) {
        showToast('只有初始月数据，暂无可绘制的历史数据', 'warning');
        return;
    }

    const tc = getThemeColors();

    // Prepare Data Arrays
    const totalExpensesData = []; // 生活支出
    const totalIncomeData = [];   // 总收入
    const investmentIncomeData = []; // 投资收入
    const netWorthData = [];

    months.forEach(m => {
        const d = allDataCache[m];
        // 生活支出
        totalExpensesData.push(d.totalExpenses !== null ? d.totalExpenses : null);
        // 总收入
        totalIncomeData.push(d.totalIncome !== null && d.totalIncome !== undefined ? d.totalIncome : null);
        // 投资收入
        investmentIncomeData.push(d.investmentIncome !== null ? d.investmentIncome : null);
        // 净资产
        netWorthData.push(d.netWorth !== null && d.netWorth !== undefined ? d.netWorth : null);
    });

    // Init Chart 1: Line
    if (chartInstances.line) chartInstances.line.dispose();
    chartInstances.line = echarts.init(els.chartLine);

    const optionLine = {
        backgroundColor: 'transparent',
        textStyle: { color: tc.text },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: tc.tooltipBg,
            borderColor: tc.tooltipBorder,
            textStyle: { color: tc.tooltipText }
        },
        legend: {
            data: ['生活支出', '总收入', '投资收入'],
            textStyle: { color: tc.text }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: months,
            axisLine: { lineStyle: { color: tc.axisLine } },
            axisLabel: { color: tc.text }
        },
        yAxis: {
            type: 'value',
            name: '金额 (元)',
            nameTextStyle: { color: tc.text },
            axisLabel: { formatter: '{value}', color: tc.text },
            splitLine: { lineStyle: { color: tc.splitLine } },
            axisLine: { lineStyle: { color: tc.axisLine } }
        },
        series: [
            {
                name: '生活支出',
                type: 'line',
                data: totalExpensesData,
                smooth: true,
                itemStyle: { color: tc.red }
            },
            {
                name: '总收入',
                type: 'line',
                data: totalIncomeData,
                smooth: true,
                itemStyle: { color: tc.emerald }
            },
            {
                name: '投资收入',
                type: 'line',
                data: investmentIncomeData,
                smooth: true,
                itemStyle: { color: tc.gold }
            }
        ]
    };
    chartInstances.line.setOption(optionLine);

    // Init Chart 2: Line (Net Worth)
    if (chartInstances.bar) chartInstances.bar.dispose();
    chartInstances.bar = echarts.init(els.chartBar);

    const optionBar = {
        backgroundColor: 'transparent',
        textStyle: { color: tc.text },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: tc.tooltipBg,
            borderColor: tc.tooltipBorder,
            textStyle: { color: tc.tooltipText }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: months,
            axisLine: { lineStyle: { color: tc.axisLine } },
            axisLabel: { color: tc.text }
        },
        yAxis: {
            type: 'value',
            name: '净资产 (元)',
            nameTextStyle: { color: tc.text },
            axisLabel: { color: tc.text },
            splitLine: { lineStyle: { color: tc.splitLine } },
            axisLine: { lineStyle: { color: tc.axisLine } }
        },
        series: [
            {
                name: '净资产',
                type: 'line',
                data: netWorthData,
                smooth: true,
                itemStyle: { color: tc.gold },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: tc.goldAreaStart },
                        { offset: 1, color: tc.goldAreaEnd }
                    ])
                }
            }
        ]
    };
    chartInstances.bar.setOption(optionBar);

    // Resize handling - only bind once
    if (!resizeEventBound) {
        window.addEventListener('resize', () => {
            chartInstances.line && chartInstances.line.resize();
            chartInstances.bar && chartInstances.bar.resize();
        });
        resizeEventBound = true;
    }
}

// --- Utilities ---

// Custom Confirm Modal
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const modalMessage = document.getElementById('modal-message');
        const btnConfirm = document.getElementById('modal-confirm');
        const btnCancel = document.getElementById('modal-cancel');

        modalMessage.textContent = message;
        modal.classList.remove('hidden');

        const cleanup = () => {
            modal.classList.add('hidden');
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
        };

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        btnConfirm.addEventListener('click', handleConfirm);
        btnCancel.addEventListener('click', handleCancel);
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    // Colors based on type - Dark Gold theme
    let bgClass = 'bg-emerald-700';
    let icon = '<i class="fa-solid fa-check-circle"></i>';

    if (type === 'error') {
        bgClass = 'bg-rose-700';
        icon = '<i class="fa-solid fa-circle-exclamation"></i>';
    } else if (type === 'warning') {
        bgClass = 'bg-amber-600';
        icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    }

    toast.className = `toast flex items-center gap-3 px-4 py-3 rounded shadow-lg text-white ${bgClass} min-w-[300px] border border-amber-900/30`;
    toast.innerHTML = `
        <span class="text-lg">${icon}</span>
        <span class="font-medium">${message}</span>
    `;

    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}
