// --- Constants & State ---
const STORAGE_KEY = 'finance_data_v1';
const THEME_KEY = 'finance_theme';
const DEFAULT_MONTH = '2026-02';

// 全局数据缓存
let allDataCache = {};

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

// --- Theme Management ---
function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    setTheme(saved || 'dark');
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const icon = document.querySelector('#btn-theme i');
    if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
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
            const icon = document.querySelector('#btn-maximize i');
            if (isMax) {
                icon.className = 'fa-solid fa-down-left-and-up-right-to-center text-sm';
                icon.style.color = 'var(--window-btn-icon)';
            } else {
                icon.className = 'fa-regular fa-square text-sm';
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
        } else {
            // 降级到 localStorage（开发环境或非 Electron 环境）
            const stored = localStorage.getItem(STORAGE_KEY);
            allDataCache = stored ? JSON.parse(stored) : {};
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        allDataCache = {};
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

    // Reset inputs
    els.inputs.assets.forEach(el => el.value = '');
    els.inputs.liabilities.forEach(el => el.value = '');
    els.inputs.incomes.forEach(el => el.value = '');
    els.inputs.newInvestment.value = '';

    // Map specific fields based on order or IDs if needed
    // Order defined in HTML: Cash, Bank, Equity, RealEstate
    const assetInputs = Array.from(els.inputs.assets);
    if (monthData.cash !== undefined) assetInputs[0].value = monthData.cash;
    if (monthData.bankDeposit !== undefined) assetInputs[1].value = monthData.bankDeposit;
    if (monthData.equity !== undefined) assetInputs[2].value = monthData.equity;
    if (monthData.realEstate !== undefined) assetInputs[3].value = monthData.realEstate;

    // Order: CreditCard, BankLoan
    const liabilityInputs = Array.from(els.inputs.liabilities);
    if (monthData.creditCard !== undefined) liabilityInputs[0].value = monthData.creditCard;
    if (monthData.bankLoan !== undefined) liabilityInputs[1].value = monthData.bankLoan;

    // Order: Salary, OtherIncome
    const incomeInputs = Array.from(els.inputs.incomes);
    if (monthData.salary !== undefined) incomeInputs[0].value = monthData.salary;
    if (monthData.otherIncome !== undefined) incomeInputs[1].value = monthData.otherIncome;

    if (monthData.newInvestment !== undefined) els.inputs.newInvestment.value = monthData.newInvestment;

    calculate();
}

// Handle Month Selector Change
function handleMonthChange(e) {
    const newMonth = e.target.value;
    if (newMonth) {
        loadMonthData(newMonth);
    }
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
    const totalAssets = cash + bankDeposit + equity + realEstate;
    const totalLiabilities = creditCard + bankLoan;
    const netWorth = totalAssets - totalLiabilities;

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
        const calcInvIncome = equity - prevEquity - newInvestment;
        investmentIncome = calcInvIncome; // Keep as number for further calc
        els.outputs.investmentIncome.textContent = formatNum(calcInvIncome);
        els.outputs.invIncomeCheck.textContent = formatNum(calcInvIncome);
    } else {
        els.outputs.investmentIncome.textContent = 'NA';
        els.outputs.invIncomeCheck.textContent = 'NA';
    }

    // Total Income = Salary + OtherIncome + InvestmentIncome
    let totalIncome = salary + otherIncome;
    if (typeof investmentIncome === 'number') {
        totalIncome += investmentIncome;
    }
    els.outputs.totalIncome.textContent = formatNum(totalIncome);

    // Total Expenses = PrevNetWorth + CurrTotalIncome - CurrNetWorth
    if (prevData && prevData.netWorth !== undefined && typeof investmentIncome === 'number') {
        const prevNetWorth = parseNum(prevData.netWorth);
        const calcExpenses = prevNetWorth + totalIncome - netWorth;
        totalExpenses = calcExpenses;
        els.outputs.totalExpenses.textContent = formatNum(calcExpenses);
    } else {
        els.outputs.totalExpenses.textContent = 'NA';
    }

    // Net Income = TotalIncome - TotalExpenses
    if (typeof totalExpenses === 'number') {
        netIncome = totalIncome - totalExpenses;
        els.outputs.netIncome.textContent = formatNum(netIncome);
    } else {
        els.outputs.netIncome.textContent = 'NA';
    }

    // ROE = (Salary * 12) / NetWorth (display as percentage)
    if (netWorth !== 0) {
        const calcRoe = (salary * 12) / netWorth;
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

    // 保存到 JSON 文件
    try {
        if (window.financeAPI && window.financeAPI.saveData) {
            const result = await window.financeAPI.saveData(allDataCache);
            if (result.success) {
                showToast(`${currentMonth} 数据已保存到文件`, 'success');
            } else {
                showToast(`保存失败: ${result.error}`, 'error');
            }
        } else {
            // 降级到 localStorage（开发环境或非 Electron 环境）
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allDataCache));
            showToast(`${currentMonth} 数据已保存到 localStorage`, 'success');
        }
    } catch (error) {
        console.error('保存数据失败:', error);
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

    // Save to JSON file
    try {
        if (window.financeAPI && window.financeAPI.saveData) {
            const result = await window.financeAPI.saveData(allDataCache);
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allDataCache));
            showToast(`${currentMonth} 数据已删除`, 'success');
            els.inputs.assets.forEach(el => el.value = '');
            els.inputs.liabilities.forEach(el => el.value = '');
            els.inputs.incomes.forEach(el => el.value = '');
            els.inputs.newInvestment.value = '';
            calculate();
        }
    } catch (error) {
        console.error('删除数据失败:', error);
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

function showChartsPage() {
    els.pageInput.classList.add('hidden');
    els.pageCharts.classList.remove('hidden');
    // 隐藏输入页面控制栏，显示图表页面头部
    document.querySelector('.sticky-controls').classList.add('hidden');
    document.getElementById('charts-header').classList.remove('hidden');
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
    const netIncomeData = [];
    const totalExpensesData = [];
    const netWorthGrowthData = [];
    const netWorthData = [];

    months.forEach(m => {
        const d = allDataCache[m];
        // Use null for missing data to break the line in ECharts (shows gap instead of misleading 0)
        netIncomeData.push(d.netIncome !== null ? d.netIncome : null);
        totalExpensesData.push(d.totalExpenses !== null ? d.totalExpenses : null);
        netWorthData.push(d.netWorth);

        // Calculate Growth (absolute value)
        const prevMonth = getPrevMonth(m);
        let growth = null;
        if (allDataCache[prevMonth]) {
            const prevNW = allDataCache[prevMonth].netWorth;
            growth = d.netWorth - prevNW;
        }
        netWorthGrowthData.push(growth);
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
            data: ['净收入', '总支出', '净资产增幅'],
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
                name: '净收入',
                type: 'line',
                data: netIncomeData,
                smooth: true,
                itemStyle: { color: tc.emerald }
            },
            {
                name: '总支出',
                type: 'line',
                data: totalExpensesData,
                smooth: true,
                itemStyle: { color: tc.red }
            },
            {
                name: '净资产增幅',
                type: 'line',
                data: netWorthGrowthData,
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

    // Resize handling
    window.addEventListener('resize', () => {
        chartInstances.line && chartInstances.line.resize();
        chartInstances.bar && chartInstances.bar.resize();
    });
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
