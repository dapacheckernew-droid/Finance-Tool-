const App = (() => {
    const state = {
        items: [],
        stockMovements: [],
        purchases: [],
        sales: [],
        expenses: [],
        ledgerEntries: [],
        parties: [],
        banks: [],
        attachments: [],
        settings: { currency: 'USD', orgName: 'Finance Tool', fiscalStart: Utils.toISODate(new Date()).slice(0, 7) }
    };

    const routes = [
        'dashboard', 'inventory', 'purchases', 'sales', 'expenses', 'cashbank', 'loans', 'receivables', 'payables', 'reports', 'settings', 'attachments'
    ];

    const init = async () => {
        document.getElementById('year').textContent = new Date().getFullYear();
        await DB.init();
        await loadState();
        bindNavigation();
        bindForms();
        bindThemeToggle();
        bindBackupRestore();
        renderAll();
        runInBrowserTests();
        Utils.showToast('Finance Tool ready for offline use', 'success');
    };

    const loadState = async () => {
        const [items, stockMovements, purchases, sales, expenses, ledgerEntries, parties, banks, attachments] = await Promise.all([
            DB.getAll('items'),
            DB.getAll('stockMovements'),
            DB.getAll('purchases'),
            DB.getAll('sales'),
            DB.getAll('expenses'),
            DB.getAll('ledgerEntries'),
            DB.getAll('parties'),
            DB.getAll('banks'),
            DB.getAll('attachments')
        ]);
        state.items = items;
        state.stockMovements = stockMovements;
        state.purchases = purchases;
        state.sales = sales;
        state.expenses = expenses;
        state.ledgerEntries = ledgerEntries;
        state.parties = parties;
        state.banks = banks;
        state.attachments = attachments;
    };

    const bindNavigation = () => {
        const navButtons = document.querySelectorAll('.nav-link');
        navButtons.forEach(button => {
            button.addEventListener('click', () => navigate(button.dataset.route));
        });
        navigate('dashboard');
        window.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            if (event.key === 'd') navigate('dashboard');
            if (event.key === 'i') navigate('inventory');
            if (event.key === 'p') navigate('purchases');
            if (event.key === 's') navigate('sales');
            if (event.key === 'e') navigate('expenses');
        });
    };

    const navigate = (route) => {
        if (!routes.includes(route)) return;
        document.querySelectorAll('.route').forEach(section => section.classList.remove('active'));
        document.getElementById(route)?.classList.add('active');
        document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.route === route));
        location.hash = route;
        if (route === 'reports') ReportsUI.renderReport('pl', state);
    };

    const bindThemeToggle = () => {
        const toggle = document.getElementById('themeSwitch');
        const savedTheme = localStorage.getItem('finance-theme') || 'light';
        document.documentElement.dataset.theme = savedTheme;
        toggle.checked = savedTheme === 'dark';
        toggle.addEventListener('change', () => {
            const theme = toggle.checked ? 'dark' : 'light';
            document.documentElement.dataset.theme = theme;
            localStorage.setItem('finance-theme', theme);
        });
    };

    const bindBackupRestore = () => {
        document.getElementById('btnBackup').addEventListener('click', async () => {
            const passphrase = prompt('Enter passphrase to encrypt backup');
            if (!passphrase) return;
            try {
                const encoded = await DB.backup(passphrase);
                const blob = new Blob([encoded], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `finance-tool-backup-${Date.now()}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
                Utils.showToast('Backup created successfully', 'success');
            } catch (error) {
                console.error(error);
                Utils.showToast('Backup failed', 'error');
            }
        });

        const restoreInput = document.getElementById('restoreFile');
        document.getElementById('btnRestore').addEventListener('click', () => restoreInput.click());
        restoreInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const passphrase = prompt('Enter passphrase used for backup');
            if (!passphrase) return;
            const text = await file.text();
            try {
                await DB.restore(passphrase, text);
                await loadState();
                renderAll();
                Utils.showToast('Restore completed', 'success');
            } catch (error) {
                console.error(error);
                Utils.showToast('Restore failed', 'error');
            }
        });
    };

    const bindForms = () => {
        document.getElementById('inventoryForm').addEventListener('submit', handleInventorySubmit);
        document.getElementById('purchaseForm').addEventListener('submit', (event) => handleTransactionSubmit(event, 'purchase'));
        document.getElementById('salesForm').addEventListener('submit', (event) => handleTransactionSubmit(event, 'sale'));
        document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);
        document.getElementById('cashForm').addEventListener('submit', handleCashSubmit);
        document.getElementById('loanForm').addEventListener('submit', handleLoanSubmit);
        document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
        document.querySelector('#expenseForm input[name="recurring"]').addEventListener('change', (event) => {
            document.querySelector('.recurring-template').classList.toggle('hidden', !event.target.checked);
        });
        document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
        document.getElementById('btnPrintReport').addEventListener('click', () => window.print());
    };

    const handleInventorySubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const item = {
            id: Utils.uuid(),
            sku: formData.get('sku'),
            name: formData.get('name'),
            category: formData.get('category'),
            cost: Utils.parseNumber(formData.get('cost')),
            openingStock: Utils.parseNumber(formData.get('stock')),
            reorder: Utils.parseNumber(formData.get('reorder')),
            openingDate: Utils.toISODate()
        };
        await DB.add('items', item);
        state.items.push(item);
        await addStockMovement({
            itemId: item.id,
            type: 'opening',
            quantity: item.openingStock,
            cost: item.cost,
            date: Utils.toISODate()
        });
        renderAll();
        event.target.reset();
        Utils.showToast('Item saved', 'success');
    };

    const addStockMovement = async (movement) => {
        const record = { id: Utils.uuid(), ...movement };
        await DB.add('stockMovements', record);
        state.stockMovements.push(record);
        if (movement.type === 'purchase' || movement.type === 'opening') {
            await recalculateItemCost(movement.itemId);
        }
    };

    const recalculateItemCost = async (itemId) => {
        const item = state.items.find(i => i.id === itemId);
        if (!item) return;
        const movements = state.stockMovements.filter(m => m.itemId === itemId && m.quantity > 0);
        const average = Utils.weightedAverageCost(movements.map(m => ({ quantity: m.quantity, cost: m.cost })));
        if (average > 0 && Math.abs(item.cost - average) > 0.01) {
            item.cost = Number(average.toFixed(2));
            await DB.add('items', item);
        }
    };

    const handleTransactionSubmit = async (event, type) => {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const isSale = type === 'sale';
        const quantity = Utils.parseNumber(formData.get('quantity'));
        if (quantity <= 0) {
            Utils.showToast('Quantity must be positive', 'error');
            return;
        }
        const itemId = formData.get('item');
        if (isSale) {
            const available = calculateAvailableStock(itemId);
            if (quantity > available) {
                Utils.showToast('Insufficient stock for sale', 'error');
                return;
            }
        }
        const rate = Utils.parseNumber(formData.get('rate'));
        const amount = quantity * rate;
        const payment = Utils.parseNumber(formData.get('payment'));
        if (payment > amount) {
            Utils.showToast('Payment cannot exceed total amount', 'error');
            return;
        }
        const balance = amount - payment;
        const item = state.items.find(i => i.id === itemId);
        const record = {
            id: Utils.uuid(),
            itemId,
            partyId: formData.get('party'),
            quantity,
            rate,
            total: amount,
            paid: isSale ? undefined : payment,
            received: isSale ? payment : undefined,
            balance,
            dueDate: formData.get('dueDate') || null,
            date: Utils.toISODate(),
            attachmentId: null
        };
        const attachment = formData.get('attachment');
        if (attachment && attachment.size) {
            record.attachmentId = await saveAttachment(attachment, type, record.id);
        }
        const storeName = isSale ? 'sales' : 'purchases';
        await DB.add(storeName, record);
        state[storeName].push(record);
        await addStockMovement({
            itemId,
            type: isSale ? 'sale' : 'purchase',
            quantity: isSale ? -quantity : quantity,
            cost: isSale ? (item?.cost || rate) : rate,
            date: record.date
        });
        await registerLedgerEntries(record, type);
        renderAll();
        form.reset();
        Utils.showToast(`${isSale ? 'Sale' : 'Purchase'} recorded`, 'success');
    };

    const registerLedgerEntries = async (record, type) => {
        const entries = [];
        if (type === 'purchase') {
            entries.push({ id: Utils.uuid(), accountId: 'inventory', type: 'debit', amount: record.total, date: record.date, description: `Purchase ${record.id}` });
            if (record.paid > 0) {
                entries.push({ id: Utils.uuid(), accountId: 'cash', type: 'credit', amount: record.paid, date: record.date, description: `Cash paid ${record.id}` });
            }
            if (record.balance > 0) {
                entries.push({ id: Utils.uuid(), accountId: 'accounts_payable', type: 'credit', amount: record.balance, date: record.date, description: `Payable ${record.id}` });
            }
        } else {
            entries.push({ id: Utils.uuid(), accountId: 'accounts_receivable', type: 'debit', amount: record.balance, date: record.date, description: `Receivable ${record.id}` });
            entries.push({ id: Utils.uuid(), accountId: 'sales_income', type: 'credit', amount: record.total, date: record.date, description: `Sale ${record.id}` });
            if (record.received > 0) {
                entries.push({ id: Utils.uuid(), accountId: 'cash', type: 'debit', amount: record.received, date: record.date, description: `Cash received ${record.id}` });
            }
        }
        for (const entry of entries) {
            await DB.add('ledgerEntries', entry);
            state.ledgerEntries.push(entry);
        }
    };

    const handleExpenseSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const amount = Utils.parseNumber(formData.get('amount'));
        const record = {
            id: Utils.uuid(),
            category: formData.get('category'),
            amount,
            date: formData.get('date') || Utils.toISODate(),
            partyId: formData.get('party') || null,
            recurring: formData.get('recurring') === 'on',
            frequency: formData.get('frequency') || null,
            attachmentId: null
        };
        const attachment = formData.get('attachment');
        if (attachment && attachment.size) {
            record.attachmentId = await saveAttachment(attachment, 'expense', record.id);
        }
        await DB.add('expenses', record);
        state.expenses.push(record);
        await registerExpenseLedger(record);
        event.target.reset();
        document.querySelector('.recurring-template').classList.add('hidden');
        renderAll();
        Utils.showToast('Expense recorded', 'success');
    };

    const registerExpenseLedger = async (record) => {
        const entries = [
            { id: Utils.uuid(), accountId: `expense:${record.category}`, type: 'debit', amount: record.amount, date: record.date, description: `Expense ${record.id}` },
            { id: Utils.uuid(), accountId: 'cash', type: 'credit', amount: record.amount, date: record.date, description: `Expense ${record.id}` }
        ];
        for (const entry of entries) {
            await DB.add('ledgerEntries', entry);
            state.ledgerEntries.push(entry);
        }
    };

    const handleCashSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const amount = Utils.parseNumber(formData.get('amount'));
        const record = {
            id: Utils.uuid(),
            accountId: formData.get('bank'),
            type: formData.get('type'),
            amount,
            date: formData.get('date') || Utils.toISODate(),
            description: formData.get('description')
        };
        await DB.add('ledgerEntries', record);
        state.ledgerEntries.push(record);
        updateBankBalance(record);
        renderAll();
        event.target.reset();
        Utils.showToast('Ledger entry added', 'success');
    };

    const handleLoanSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const amount = Utils.parseNumber(formData.get('amount'));
        const type = formData.get('type');
        const record = {
            id: Utils.uuid(),
            accountId: type === 'loan' ? 'loans' : 'capital',
            type: 'credit',
            amount,
            date: formData.get('date') || Utils.toISODate(),
            description: `${type} entry for ${formData.get('party')}`
        };
        await DB.add('ledgerEntries', record);
        state.ledgerEntries.push(record);
        renderAll();
        event.target.reset();
        Utils.showToast('Loan/capital entry saved', 'success');
    };

    const handleSettingsSubmit = (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        state.settings = {
            orgName: formData.get('orgName') || state.settings.orgName,
            fiscalStart: formData.get('fiscalStart') || state.settings.fiscalStart,
            currency: formData.get('currency') || state.settings.currency,
            offline: formData.get('offline') === 'on'
        };
        renderAll();
        Utils.showToast('Settings updated', 'success');
    };

    const updateBankBalance = (entry) => {
        const bank = state.banks.find(b => b.id === entry.accountId);
        if (!bank) return;
        if (entry.type === 'deposit') bank.balance += entry.amount;
        if (entry.type === 'withdrawal') bank.balance -= entry.amount;
        DB.add('banks', bank);
    };

    const saveAttachment = async (file, module, linkedId) => {
        const dataUrl = await Utils.compressToBase64(file);
        const attachment = {
            id: Utils.uuid(),
            name: file.name,
            size: file.size,
            type: file.type,
            module,
            linkedId,
            createdAt: new Date().toISOString(),
            dataUrl
        };
        await DB.add('attachments', attachment);
        state.attachments.push(attachment);
        return attachment.id;
    };

    const exportCsv = async () => {
        const rows = [['Type', 'Date', 'Description', 'Amount']];
        state.ledgerEntries.forEach(entry => rows.push([
            entry.type,
            entry.date,
            entry.description,
            entry.amount
        ]));
        const csv = rows.map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'finance-report.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderAll = () => {
        DashboardUI.render(state);
        TransactionsUI.render(state);
        LedgerUI.render(state);
        AttachmentsUI.render(state);
        TablesUI.bindSearch();
    };

    const calculateAvailableStock = (itemId) => {
        return state.stockMovements.filter(m => m.itemId === itemId).reduce((total, movement) => total + movement.quantity, 0);
    };

    const runInBrowserTests = () => {
        const results = [];
        const stockIntegrity = state.items.every(item => calculateAvailableStock(item.id) >= 0);
        results.push({ name: 'Non-negative stock levels', passed: stockIntegrity });

        const receivableBuckets = Reports.calculateReceivableAging(state);
        const receivableSum = Object.values(receivableBuckets).reduce((total, bucket) => total + bucket.total, 0);
        const salesBalances = state.sales.reduce((total, sale) => total + sale.balance, 0);
        results.push({ name: 'Receivable aging totals match balances', passed: Math.abs(receivableSum - salesBalances) < 0.01 });

        const pnl = Reports.calculateProfitAndLoss(state);
        results.push({ name: 'Profit & Loss net equals revenue - expenses', passed: Math.abs((pnl.revenue - pnl.expenses) - pnl.netIncome) < 0.01 });

        const ledgerCheck = Reports.calculateLedgerBalance(state);
        results.push({ name: 'Ledger debits equal credits', passed: Math.abs(ledgerCheck.debits - ledgerCheck.credits) < 0.01 });

        const testContainer = document.createElement('section');
        testContainer.className = 'card';
        testContainer.innerHTML = `<h3>Self-tests</h3>${results.map(result => `<p>${result.passed ? '✅' : '❌'} ${result.name}</p>`).join('')}`;
        document.getElementById('dashboard').appendChild(testContainer);
        console.group('Finance Tool Self-tests');
        results.forEach(result => console.log(`${result.passed ? '✅' : '❌'} ${result.name}`));
        console.groupEnd();
    };

    return { init, navigate, state };
})();

document.addEventListener('DOMContentLoaded', App.init);
