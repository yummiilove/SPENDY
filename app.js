// State Management
let transactions = [];
let budgets = {
    Food: 5000,
    Travel: 2500,
    Shopping: 4000,
    Bills: 3000,
    General: 2000
};
let pendingDeleteId = null;
let lastDeletedTx = null;
let activeTypeFilter = "all";

// Chart Instances
let categoryDonutChart = null;
let monthlyBarChart = null;
let spendingTrendChart = null;

const CATEGORY_ICONS = {
    Food: '🍔',
    Travel: '🚗',
    Shopping: '🛍️',
    Bills: '⚡',
    Salary: '💰',
    Investment: '📈',
    General: '📦'
};

// DOM Elements
const composerModal = document.getElementById("composerModal");
const openQuickAddDesktop = document.getElementById("openQuickAddDesktop");
const mobileFabAdd = document.getElementById("mobileFabAdd");
const closeComposerBtn = document.getElementById("closeComposerBtn");

const transactionForm = document.getElementById("transactionForm");
const formHeading = document.getElementById("formHeading");
const editTransactionId = document.getElementById("editTransactionId");
const addTransactionBtn = document.getElementById("addTransactionBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

const flowTabs = document.querySelectorAll(".flow-tab");
const transactionType = document.getElementById("transactionType");
const transactionTitle = document.getElementById("transactionTitle");
const transactionAmount = document.getElementById("transactionAmount");
const transactionCategory = document.getElementById("transactionCategory");
const transactionDate = document.getElementById("transactionDate");
const transactionNote = document.getElementById("transactionNote");

const previewBeforeBal = document.getElementById("previewBeforeBal");
const previewAfterBal = document.getElementById("previewAfterBal");

const titleError = document.getElementById("titleError");
const amountError = document.getElementById("amountError");
const dateError = document.getElementById("dateError");

const transactionList = document.getElementById("transactionList");
const filteredCount = document.getElementById("filteredCount");
const searchTransactions = document.getElementById("searchTransactions");
const segButtons = document.querySelectorAll(".seg-btn");
const toggleFilterDrawer = document.getElementById("toggleFilterDrawer");
const advancedFilters = document.getElementById("advancedFilters");
const filterCategory = document.getElementById("filterCategory");
const sortBy = document.getElementById("sortBy");
const filterFromDate = document.getElementById("filterFromDate");
const filterToDate = document.getElementById("filterToDate");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");

const totalIncome = document.getElementById("totalIncome");
const totalExpense = document.getElementById("totalExpense");
const totalBalance = document.getElementById("totalBalance");
const mobileBalanceHeader = document.getElementById("mobileBalanceHeader");
const savingsRate = document.getElementById("savingsRate");
const txCountBadge = document.getElementById("txCountBadge");

// Pulse elements
const currentMonthTag = document.getElementById("currentMonthTag");
const monthInflowVal = document.getElementById("monthInflowVal");
const monthOutflowVal = document.getElementById("monthOutflowVal");
const avgDailySpendVal = document.getElementById("avgDailySpendVal");
const topBudgetMini = document.getElementById("topBudgetMini");

// Budgets
const budgetForm = document.getElementById("budgetForm");
const budgetCategory = document.getElementById("budgetCategory");
const budgetLimit = document.getElementById("budgetLimit");
const budgetBarsList = document.getElementById("budgetBarsList");

// Reports
const reportMonthSelector = document.getElementById("reportMonthSelector");
const repIncome = document.getElementById("repIncome");
const repExpense = document.getElementById("repExpense");
const repNet = document.getElementById("repNet");
const repTopCategory = document.getElementById("repTopCategory");
const repComparisonDetails = document.getElementById("repComparisonDetails");

// Modal & Toast
const confirmModal = document.getElementById("confirmModal");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const toastUndoBtn = document.getElementById("toastUndoBtn");

// Navigation
const navButtons = document.querySelectorAll(".nav-item, .dock-btn");
const tabViews = document.querySelectorAll(".tab-view");

// Helpers
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

function formatCurrency(num, compact = false) {
    const val = Number(num) || 0;
    const sign = val < 0 ? "−" : "";
    const abs = Math.abs(val);
    if (compact && abs >= 100000) {
        return `${sign}₹${(abs / 100000).toFixed(2)}L`;
    }
    return `${sign}₹${abs.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

let toastTimer = null;
function showToast(message, allowUndo = false) {
    toastMsg.textContent = message;
    toastUndoBtn.classList.toggle("hidden", !allowUndo);
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("visible");
    }, allowUndo ? 4500 : 2800);
}

function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
}

// Storage
function loadData() {
    try {
        // Migrate v2 data automatically if v3 doesn't exist yet
        const storedV3 = localStorage.getItem("spendy_transactions_v3");
        const storedV2 = localStorage.getItem("spendy_transactions_v2");
        transactions = storedV3 ? JSON.parse(storedV3) : (storedV2 ? JSON.parse(storedV2) : []);

        const storedBudgets = localStorage.getItem("spendy_budgets_v3") || localStorage.getItem("spendy_budgets_v2");
        if (storedBudgets) {
            budgets = JSON.parse(storedBudgets);
        }
    } catch (err) {
        console.error("Storage load failed", err);
        transactions = [];
    }
}

function saveData() {
    localStorage.setItem("spendy_transactions_v3", JSON.stringify(transactions));
    localStorage.setItem("spendy_budgets_v3", JSON.stringify(budgets));
}

/**
 * CORE FEATURE: Chronological Running Balance Engine
 * Sorts transactions from oldest to newest (using date + createdAt order),
 * computes exact `prevBalance` and `afterBalance` for every single transaction,
 * and returns a Map keyed by transaction ID.
 */
function computeBalanceTrail(txList) {
    const chronological = [...txList].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    let running = 0;
    const trailMap = new Map();

    chronological.forEach(tx => {
        const prevBalance = running;
        const amt = Number(tx.amount) || 0;
        const afterBalance = tx.type === "income" ? prevBalance + amt : prevBalance - amt;
        running = afterBalance;

        trailMap.set(tx.id, {
            prevBalance,
            afterBalance,
            chronoIndex: trailMap.size
        });
    });

    return { trailMap, currentBalance: running };
}

// Init
function initApp() {
    loadData();
    const today = new Date().toISOString().split("T")[0];
    transactionDate.value = today;
    reportMonthSelector.value = today.slice(0, 7);

    setupNavigation();
    setupComposer();
    setupEventListeners();
    refreshUI();
    registerPWA();
}

function setupNavigation() {
    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            navButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === target));
            tabViews.forEach(v => v.classList.toggle("active", v.id === `tab-${target}`));

            if (target === "analytics") renderCharts();
            if (target === "budgets") renderBudgets();
            if (target === "reports") renderMonthlyReport(reportMonthSelector.value);
        });
    });
}

// Composer Sheet & Live Balance Preview
function openComposer(isEdit = false) {
    composerModal.classList.remove("hidden");
    updateLiveBalancePreview();
    if (!isEdit) {
        setTimeout(() => transactionAmount.focus(), 60);
    }
}

function closeComposer() {
    composerModal.classList.add("hidden");
    resetTransactionForm();
}

function setFlowType(type) {
    transactionType.value = type;
    flowTabs.forEach(tab => {
        tab.classList.toggle("active", tab.dataset.flow === type);
    });
    // Smart category default suggestion
    if (!editTransactionId.value) {
        if (type === "income" && transactionCategory.value === "Food") {
            transactionCategory.value = "Salary";
        } else if (type === "expense" && transactionCategory.value === "Salary") {
            transactionCategory.value = "Food";
        }
    }
    updateLiveBalancePreview();
}

function updateLiveBalancePreview() {
    const editId = editTransactionId.value;
    const baseList = editId ? transactions.filter(t => t.id !== editId) : transactions;
    const { currentBalance } = computeBalanceTrail(baseList);

    const enteredAmt = Number(transactionAmount.value) || 0;
    const type = transactionType.value;
    const afterVal = type === "income" ? currentBalance + enteredAmt : currentBalance - enteredAmt;

    previewBeforeBal.textContent = formatCurrency(currentBalance);
    previewAfterBal.textContent = formatCurrency(afterVal);
    previewAfterBal.style.color = afterVal < 0 ? "var(--expense)" : (type === "income" ? "var(--income)" : "var(--text-primary)");
}

function setupComposer() {
    openQuickAddDesktop.addEventListener("click", () => {
        resetTransactionForm();
        openComposer(false);
    });

    mobileFabAdd.addEventListener("click", () => {
        resetTransactionForm();
        openComposer(false);
    });

    closeComposerBtn.addEventListener("click", closeComposer);
    cancelEditBtn.addEventListener("click", closeComposer);

    composerModal.addEventListener("click", (e) => {
        if (e.target === composerModal) closeComposer();
    });

    flowTabs.forEach(tab => {
        tab.addEventListener("click", () => setFlowType(tab.dataset.flow));
    });

    transactionAmount.addEventListener("input", updateLiveBalancePreview);

    document.querySelectorAll(".amt-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const add = Number(chip.dataset.amt);
            const cur = Number(transactionAmount.value) || 0;
            transactionAmount.value = (cur + add).toFixed(0);
            updateLiveBalancePreview();
        });
    });
}

function setupEventListeners() {
    transactionForm.addEventListener("submit", handleTransactionSubmit);

    // Search & Filters
    searchTransactions.addEventListener("input", renderTransactions);

    segButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            segButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeTypeFilter = btn.dataset.type;
            renderTransactions();
        });
    });

    toggleFilterDrawer.addEventListener("click", () => {
        advancedFilters.classList.toggle("hidden");
        toggleFilterDrawer.classList.toggle("active");
    });

    filterCategory.addEventListener("change", renderTransactions);
    sortBy.addEventListener("change", renderTransactions);
    filterFromDate.addEventListener("change", renderTransactions);
    filterToDate.addEventListener("change", renderTransactions);

    resetFiltersBtn.addEventListener("click", () => {
        searchTransactions.value = "";
        activeTypeFilter = "all";
        segButtons.forEach(b => b.classList.toggle("active", b.dataset.type === "all"));
        filterCategory.value = "all";
        sortBy.value = "newest";
        filterFromDate.value = "";
        filterToDate.value = "";
        renderTransactions();
    });

    // Delete & Undo
    cancelModalBtn.addEventListener("click", () => {
        confirmModal.classList.add("hidden");
        pendingDeleteId = null;
    });

    confirmDeleteBtn.addEventListener("click", () => {
        if (pendingDeleteId) {
            const idx = transactions.findIndex(t => t.id === pendingDeleteId);
            if (idx !== -1) {
                lastDeletedTx = transactions[idx];
                transactions.splice(idx, 1);
                saveData();
                refreshUI();
                showToast("Transaction deleted", true);
            }
        }
        confirmModal.classList.add("hidden");
        pendingDeleteId = null;
    });

    toastUndoBtn.addEventListener("click", () => {
        if (lastDeletedTx) {
            transactions.push(lastDeletedTx);
            lastDeletedTx = null;
            saveData();
            refreshUI();
            toast.classList.remove("visible");
            showToast("Entry restored");
        }
    });

    // Budgets
    budgetForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const cat = budgetCategory.value;
        const limit = Number(budgetLimit.value);
        if (limit <= 0) return;

        budgets[cat] = limit;
        saveData();
        renderBudgets();
        updatePulseCard();
        budgetLimit.value = "";
        showToast(`${cat} monthly cap set to ${formatCurrency(limit)}`);
    });

    // Reports
    reportMonthSelector.addEventListener("change", (e) => {
        renderMonthlyReport(e.target.value);
    });

    // CSV Export & Sample Data
    document.getElementById("exportCsvBtn")?.addEventListener("click", exportToCSV);
    document.getElementById("mobileExportBtn")?.addEventListener("click", exportToCSV);
    document.getElementById("loadDemoBtn")?.addEventListener("click", loadSampleTransactions);
}

function handleTransactionSubmit(e) {
    e.preventDefault();
    titleError.textContent = "";
    amountError.textContent = "";
    dateError.textContent = "";

    const title = transactionTitle.value.trim();
    const amountVal = Number(transactionAmount.value);
    const type = transactionType.value;
    const category = transactionCategory.value;
    const date = transactionDate.value;
    const note = transactionNote.value.trim();
    const isEdit = Boolean(editTransactionId.value);

    let hasError = false;
    if (!title) {
        titleError.textContent = "Enter a title or merchant name.";
        hasError = true;
    }
    if (!amountVal || isNaN(amountVal) || amountVal <= 0) {
        amountError.textContent = "Enter an amount greater than ₹0.";
        hasError = true;
    }
    if (!date) {
        dateError.textContent = "Select a valid date.";
        hasError = true;
    }
    if (hasError) return;

    if (isEdit) {
        const id = editTransactionId.value;
        const idx = transactions.findIndex(t => t.id === id);
        if (idx !== -1) {
            transactions[idx] = {
                ...transactions[idx],
                title,
                amount: amountVal,
                type,
                category,
                date,
                note
            };
            showToast("Entry updated & balances recalculated");
        }
    } else {
        transactions.push({
            id: generateId(),
            title,
            amount: amountVal,
            type,
            category,
            date,
            note,
            createdAt: Date.now()
        });
        showToast("Transaction logged");
    }

    saveData();
    closeComposer();
    refreshUI();
}

function startEdit(id) {
    const item = transactions.find(t => t.id === id);
    if (!item) return;

    editTransactionId.value = item.id;
    transactionTitle.value = item.title;
    transactionAmount.value = item.amount;
    transactionCategory.value = item.category;
    transactionDate.value = item.date;
    transactionNote.value = item.note || "";
    setFlowType(item.type);

    formHeading.textContent = "Edit Transaction";
    addTransactionBtn.textContent = "Update Entry";
    cancelEditBtn.classList.remove("hidden");

    openComposer(true);
}

function resetTransactionForm() {
    editTransactionId.value = "";
    transactionForm.reset();
    setFlowType("expense");
    formHeading.textContent = "New Transaction";
    addTransactionBtn.textContent = "Save Transaction";
    cancelEditBtn.classList.add("hidden");
    titleError.textContent = "";
    amountError.textContent = "";
    dateError.textContent = "";
    transactionDate.value = new Date().toISOString().split("T")[0];
}

function refreshUI() {
    updateSummary();
    updatePulseCard();
    renderTransactions();
    renderBudgets();
    renderCharts();
    renderMonthlyReport(reportMonthSelector.value);
}

function updateSummary() {
    const income = transactions
        .filter(t => t.type === "income")
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = transactions
        .filter(t => t.type === "expense")
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const balance = income - expense;

    totalIncome.textContent = formatCurrency(income);
    totalExpense.textContent = formatCurrency(expense);
    totalBalance.textContent = formatCurrency(balance);
    mobileBalanceHeader.textContent = formatCurrency(balance, true);

    totalBalance.style.color = balance < 0 ? "var(--expense)" : "var(--text-primary)";

    const rate = income > 0 ? Math.max(0, Math.round(((income - expense) / income) * 100)) : 0;
    savingsRate.textContent = `${rate}% saved`;
    txCountBadge.textContent = `${transactions.length} ledger ${transactions.length === 1 ? 'entry' : 'entries'}`;
}

function updatePulseCard() {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    currentMonthTag.textContent = now.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

    const monthTxs = transactions.filter(t => t.date.startsWith(monthPrefix));
    const mIn = monthTxs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const mOut = monthTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const dayOfMonth = Math.max(1, now.getDate());
    const avgDaily = mOut / dayOfMonth;

    monthInflowVal.textContent = formatCurrency(mIn, true);
    monthOutflowVal.textContent = formatCurrency(mOut, true);
    avgDailySpendVal.textContent = formatCurrency(avgDaily);

    // Highest utilized budget bar preview
    const catSpend = {};
    monthTxs.filter(t => t.type === "expense").forEach(t => {
        catSpend[t.category] = (catSpend[t.category] || 0) + Number(t.amount);
    });

    let topCat = null;
    let highestRatio = -1;
    for (const [cat, limit] of Object.entries(budgets)) {
        const spent = catSpend[cat] || 0;
        const ratio = spent / limit;
        if (ratio > highestRatio) {
            highestRatio = ratio;
            topCat = { cat, spent, limit, pct: Math.min(100, Math.round(ratio * 100)) };
        }
    }

    if (topCat) {
        const color = topCat.spent > topCat.limit ? "var(--expense)" : (topCat.pct > 80 ? "#FBBF24" : "var(--lime)");
        topBudgetMini.innerHTML = `
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
                <span style="color:var(--text-secondary)">Top Budget: <strong style="color:var(--text-primary)">${topCat.cat}</strong></span>
                <span>${formatCurrency(topCat.spent)} / ${formatCurrency(topCat.limit)}</span>
            </div>
            <div class="b-track"><div class="b-fill" style="width:${topCat.pct}%;background:${color}"></div></div>
        `;
    }
}

// Render Ledger with Previous & After Balance per Transaction
function renderTransactions() {
    const query = searchTransactions.value.toLowerCase().trim();
    const cat = filterCategory.value;
    const order = sortBy.value;
    const from = filterFromDate.value;
    const to = filterToDate.value;

    // 1. Always compute running balances over ALL transactions chronologically first
    const { trailMap } = computeBalanceTrail(transactions);

    // 2. Apply user filters
    let filtered = transactions.filter(t => {
        const matchesQuery =
            t.title.toLowerCase().includes(query) ||
            t.category.toLowerCase().includes(query) ||
            (t.note && t.note.toLowerCase().includes(query));
        const matchesType = activeTypeFilter === "all" || t.type === activeTypeFilter;
        const matchesCat = cat === "all" || t.category === cat;
        const matchesFrom = !from || t.date >= from;
        const matchesTo = !to || t.date <= to;

        return matchesQuery && matchesType && matchesCat && matchesFrom && matchesTo;
    });

    // 3. Sort
    filtered.sort((a, b) => {
        const idxA = trailMap.get(a.id)?.chronoIndex ?? 0;
        const idxB = trailMap.get(b.id)?.chronoIndex ?? 0;
        if (order === "newest") return idxB - idxA;
        if (order === "oldest") return idxA - idxB;
        if (order === "highest") return Number(b.amount) - Number(a.amount);
        if (order === "lowest") return Number(a.amount) - Number(b.amount);
        return 0;
    });

    filteredCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`;
    transactionList.innerHTML = "";

    if (filtered.length === 0) {
        transactionList.innerHTML = `
            <div class="empty-box">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="4" width="18" height="16" rx="3"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="14" x2="13" y2="14"/>
                </svg>
                <p>No ledger entries found. Tap <strong>New Entry</strong> to log your first transaction.</p>
            </div>
        `;
        return;
    }

    let lastDateHeader = null;

    filtered.forEach(item => {
        // Group date headers when sorted chronologically
        if ((order === "newest" || order === "oldest") && item.date !== lastDateHeader) {
            lastDateHeader = item.date;
            const dateLabel = document.createElement("div");
            dateLabel.className = "date-group-label";
            dateLabel.textContent = formatReadableDate(item.date);
            transactionList.appendChild(dateLabel);
        }

        const trail = trailMap.get(item.id) || { prevBalance: 0, afterBalance: 0 };
        const icon = CATEGORY_ICONS[item.category] || '💸';
        const sign = item.type === "income" ? "+" : "−";

        const row = document.createElement("div");
        row.className = "ledger-row";
        row.innerHTML = `
            <div class="tx-main-left">
                <div class="cat-badge">${icon}</div>
                <div class="tx-info">
                    <div class="tx-title-row">
                        <span class="tx-title">${escapeHtml(item.title)}</span>
                        ${item.note ? `<span class="tx-note-tag">${escapeHtml(item.note)}</span>` : ""}
                    </div>
                    <div class="tx-submeta">
                        <span>${escapeHtml(item.category)}</span>
                        <span>•</span>
                        <span>${item.date}</span>
                    </div>
                </div>
            </div>

            <div class="tx-right-cluster">
                <div class="amount-and-trail">
                    <div class="tx-amt ${item.type}">${sign}${formatCurrency(item.amount)}</div>
                    <div class="balance-trail-pill" title="Balance before → Balance after">
                        <span class="bal-prev">Prev ${formatCurrency(trail.prevBalance)}</span>
                        <span class="bal-arrow">→</span>
                        <span class="bal-after ${trail.afterBalance < 0 ? 'negative' : ''}">After ${formatCurrency(trail.afterBalance)}</span>
                    </div>
                </div>

                <div class="row-actions">
                    <button class="mini-action-btn edit-btn" title="Edit" aria-label="Edit">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="mini-action-btn del del-btn" title="Delete" aria-label="Delete">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;

        row.querySelector(".edit-btn").addEventListener("click", () => startEdit(item.id));
        row.querySelector(".del-btn").addEventListener("click", () => {
            pendingDeleteId = item.id;
            confirmModal.classList.remove("hidden");
        });

        transactionList.appendChild(row);
    });
}

function formatReadableDate(isoDate) {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (isoDate === today) return "Today";
    if (isoDate === yesterday) return "Yesterday";
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Budgets
function renderBudgets() {
    budgetBarsList.innerHTML = "";
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const monthlySpend = {};
    transactions
        .filter(t => t.type === "expense" && t.date.startsWith(currentMonthPrefix))
        .forEach(t => {
            monthlySpend[t.category] = (monthlySpend[t.category] || 0) + Number(t.amount);
        });

    Object.keys(budgets).forEach(cat => {
        const spent = monthlySpend[cat] || 0;
        const limit = budgets[cat];
        const percent = Math.min(100, Math.round((spent / limit) * 100));
        const remaining = limit - spent;
        const isOver = remaining < 0;
        const barColor = isOver ? 'var(--expense)' : percent > 80 ? '#FBBF24' : 'var(--lime)';

        const card = document.createElement("div");
        card.className = "budget-card-row";
        card.innerHTML = `
            <div class="b-top">
                <span>${CATEGORY_ICONS[cat] || ''} ${cat}</span>
                <span>${formatCurrency(spent)} / ${formatCurrency(limit)}</span>
            </div>
            <div class="b-track">
                <div class="b-fill" style="width: ${percent}%; background: ${barColor}"></div>
            </div>
            <div class="b-foot">
                <span>${percent}% utilized</span>
                <span style="color: ${isOver ? 'var(--expense)' : 'var(--text-secondary)'}">
                    ${isOver ? `Over by ${formatCurrency(Math.abs(remaining))}` : `${formatCurrency(remaining)} left`}
                </span>
            </div>
        `;
        budgetBarsList.appendChild(card);
    });
}

// Charts
function renderCharts() {
    if (typeof Chart === 'undefined') return;

    const categoryTotals = {};
    transactions
        .filter(t => t.type === "expense")
        .forEach(t => {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + Number(t.amount);
        });

    const catLabels = Object.keys(categoryTotals);
    const catData = Object.values(categoryTotals);

    if (categoryDonutChart) categoryDonutChart.destroy();
    const donutCtx = document.getElementById("categoryDonutChart")?.getContext("2d");
    if (donutCtx) {
        categoryDonutChart = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: catLabels.length ? catLabels : ['No Expenses'],
                datasets: [{
                    data: catData.length ? catData : [1],
                    backgroundColor: ['#C5F82A', '#2EE59D', '#56CCF2', '#FBBF24', '#FF6B6B', '#A78BFA', '#F472B6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#8E9BAE', boxWidth: 10, padding: 14 } }
                }
            }
        });
    }

    const monthMap = {};
    transactions.forEach(t => {
        const m = t.date.slice(0, 7);
        if (!monthMap[m]) monthMap[m] = { income: 0, expense: 0 };
        if (t.type === "income") monthMap[m].income += Number(t.amount);
        if (t.type === "expense") monthMap[m].expense += Number(t.amount);
    });

    const sortedMonths = Object.keys(monthMap).sort().slice(-6);
    if (monthlyBarChart) monthlyBarChart.destroy();
    const barCtx = document.getElementById("monthlyBarChart")?.getContext("2d");
    if (barCtx) {
        monthlyBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: sortedMonths.length ? sortedMonths : ['Current'],
                datasets: [
                    { label: 'Income', data: sortedMonths.map(m => monthMap[m].income), backgroundColor: '#2EE59D', borderRadius: 6 },
                    { label: 'Expense', data: sortedMonths.map(m => monthMap[m].expense), backgroundColor: '#FF6B6B', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#8E9BAE' }, grid: { display: false } },
                    y: { ticks: { color: '#8E9BAE' }, grid: { color: 'rgba(255,255,255,0.06)' } }
                },
                plugins: { legend: { labels: { color: '#8E9BAE' } } }
            }
        });
    }

    const timelineTotals = {};
    transactions
        .filter(t => t.type === "expense")
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach(t => {
            timelineTotals[t.date] = (timelineTotals[t.date] || 0) + Number(t.amount);
        });

    const trendLabels = Object.keys(timelineTotals).slice(-14);
    if (spendingTrendChart) spendingTrendChart.destroy();
    const lineCtx = document.getElementById("spendingTrendChart")?.getContext("2d");
    if (lineCtx) {
        spendingTrendChart = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: trendLabels.length ? trendLabels : ['Today'],
                datasets: [{
                    label: 'Daily Spend (₹)',
                    data: trendLabels.length ? trendLabels.map(d => timelineTotals[d]) : [0],
                    borderColor: '#C5F82A',
                    backgroundColor: 'rgba(197, 248, 42, 0.12)',
                    fill: true,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#8E9BAE' }, grid: { display: false } },
                    y: { ticks: { color: '#8E9BAE' }, grid: { color: 'rgba(255,255,255,0.06)' } }
                },
                plugins: { legend: { labels: { color: '#8E9BAE' } } }
            }
        });
    }
}

// Monthly Audit Report
function renderMonthlyReport(selectedMonth) {
    if (!selectedMonth) return;

    const currentMonthTx = transactions.filter(t => t.date.startsWith(selectedMonth));
    const inc = currentMonthTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const exp = currentMonthTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const net = inc - exp;

    repIncome.textContent = formatCurrency(inc);
    repExpense.textContent = formatCurrency(exp);
    repNet.textContent = formatCurrency(net);
    repNet.style.color = net < 0 ? 'var(--expense)' : 'var(--income)';

    const catMap = {};
    currentMonthTx.filter(t => t.type === "expense").forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
    });

    let topCat = "—";
    let maxSpend = 0;
    for (const [c, amt] of Object.entries(catMap)) {
        if (amt > maxSpend) {
            maxSpend = amt;
            topCat = `${c} (${formatCurrency(amt)})`;
        }
    }
    repTopCategory.textContent = topCat;

    const [year, month] = selectedMonth.split("-").map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevExp = transactions
        .filter(t => t.type === "expense" && t.date.startsWith(prevMonthStr))
        .reduce((s, t) => s + Number(t.amount), 0);

    let diffText = "No expense data recorded in previous month.";
    if (prevExp > 0) {
        const delta = ((exp - prevExp) / prevExp) * 100;
        const higher = delta > 0;
        diffText = `<strong style="color:${higher ? 'var(--expense)' : 'var(--income)'}">${Math.abs(delta).toFixed(1)}% ${higher ? 'higher' : 'lower'}</strong> than ${prevMonthStr} (${formatCurrency(prevExp)})`;
    }

    repComparisonDetails.innerHTML = `
        <div class="bench-row">
            <span>Month-over-Month Outflow</span>
            <span>${diffText}</span>
        </div>
        <div class="bench-row">
            <span>Total Transactions Audited</span>
            <span>${currentMonthTx.length} entries in ${selectedMonth}</span>
        </div>
    `;
}

// Export CSV with Previous & After Balance columns
function exportToCSV() {
    if (transactions.length === 0) {
        showToast("No transactions to export");
        return;
    }

    const { trailMap } = computeBalanceTrail(transactions);
    const ordered = [...transactions].sort((a, b) => {
        return (trailMap.get(a.id)?.chronoIndex ?? 0) - (trailMap.get(b.id)?.chronoIndex ?? 0);
    });

    const headers = ["Date", "Title", "Category", "Type", "Amount (INR)", "Previous Balance (INR)", "After Balance (INR)", "Note"];
    const rows = ordered.map(tx => {
        const trail = trailMap.get(tx.id);
        return [
            tx.date,
            `"${(tx.title || "").replace(/"/g, '""')}"`,
            tx.category,
            tx.type,
            Number(tx.amount).toFixed(2),
            trail.prevBalance.toFixed(2),
            trail.afterBalance.toFixed(2),
            `"${(tx.note || "").replace(/"/g, '""')}"`
        ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spendy-ledger-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Ledger exported to CSV");
}

// Sample Data Loader for quick testing
function loadSampleTransactions() {
    const today = new Date();
    const fmt = (daysAgo) => {
        const d = new Date(today.getTime() - daysAgo * 86400000);
        return d.toISOString().split("T")[0];
    };

    transactions = [
        { id: generateId(), title: "Freelance Web Design Payout", amount: 18500, type: "income", category: "Salary", date: fmt(6), note: "Client milestone 1", createdAt: Date.now() - 600000 },
        { id: generateId(), title: "PG Rent & Maintenance", amount: 6500, type: "expense", category: "Bills", date: fmt(5), note: "UPI transfer", createdAt: Date.now() - 500000 },
        { id: generateId(), title: "Metro Smart Card Recharge", amount: 400, type: "expense", category: "Travel", date: fmt(4), note: "Kanpur Metro", createdAt: Date.now() - 400000 },
        { id: generateId(), title: "Dinner & Cold Coffee", amount: 680, type: "expense", category: "Food", date: fmt(2), note: "With friends", createdAt: Date.now() - 300000 },
        { id: generateId(), title: "UI Component Kit Sale", amount: 3200, type: "income", category: "Investment", date: fmt(1), note: "Gumroad payout", createdAt: Date.now() - 200000 },
        { id: generateId(), title: "Wireless Mouse & Desk Mat", amount: 1499, type: "expense", category: "Shopping", date: fmt(0), note: "Amazon", createdAt: Date.now() - 100000 }
    ];
    saveData();
    refreshUI();
    showToast("Sample fintech ledger loaded");
}

function registerPWA() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        });
    }
}

document.addEventListener("DOMContentLoaded", initApp);
