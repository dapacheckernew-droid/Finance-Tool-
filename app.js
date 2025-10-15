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

    const autoBackupState = {
        enabled: true,
        fileHandle: null,
        lastRun: null
    };
    let autoBackupTimer = null;

    const moduleConfigs = {
        inventory: { formId: 'inventoryForm', tableId: 'inventoryTable', store: 'items', route: 'inventory', updateLabel: 'Update Item' },
        purchase: { formId: 'purchaseForm', tableId: 'purchaseTable', store: 'purchases', route: 'purchases', updateLabel: 'Update Purchase' },
        sale: { formId: 'salesForm', tableId: 'salesTable', store: 'sales', route: 'sales', updateLabel: 'Update Sale' },
        expense: { formId: 'expenseForm', tableId: 'expenseTable', store: 'expenses', route: 'expenses', updateLabel: 'Update Expense' },
        cash: { formId: 'cashForm', tableId: 'cashTable', store: 'ledgerEntries', route: 'cashbank', updateLabel: 'Update Entry', filter: (entry) => state.banks.some(bank => bank.id === entry.accountId) || entry.accountId === 'cash' },
        loan: { formId: 'loanForm', tableId: 'loanTable', store: 'ledgerEntries', route: 'loans', updateLabel: 'Update Loan/Capital', filter: (entry) => ['loans', 'capital'].includes(entry.accountId) }
    };

    const routes = [
        'dashboard', 'inventory', 'purchases', 'sales', 'expenses', 'cashbank', 'loans', 'receivables', 'payables', 'reports', 'settings', 'attachments'
    ];

    const upsertStateRecord = (collectionName, record) => {
        const list = state[collectionName];
        if (!Array.isArray(list)) return;
        const index = list.findIndex(item => item.id === record.id);
        if (index >= 0) {
            list[index] = record;
        } else {
            list.push(record);
        }
    };

    const setDefaultFormDates = (scope = document) => {
        const today = Utils.toISODate();
        scope.querySelectorAll('input[type="date"][data-default-today]').forEach(input => {
            if (!input.value) input.value = today;
        });
    };

    const resetFormWithDefaults = (module) => {
        const config = moduleConfigs[module];
        if (!config) return;
        const form = document.getElementById(config.formId);
        if (!form) return;
        form.reset();
        setDefaultFormDates(form);
        const hidden = form.querySelector('[name="recordId"]');
        if (hidden) hidden.value = '';
        const submit = form.querySelector('[type="submit"]');
        if (submit && form.dataset.defaultSubmitText) {
            submit.textContent = form.dataset.defaultSubmitText;
        }
        if (module === 'expense') {
            form.querySelector('.recurring-template')?.classList.add('hidden');
            const recurring = form.querySelector('input[name="recurring"]');
            if (recurring) recurring.checked = false;
        }
    };

    const finishFormSubmission = (module) => {
        resetFormWithDefaults(module);
        const config = moduleConfigs[module];
        if (config) {
            TablesUI.clearSelection(config.tableId);
        }
    };

    const ensureSelectOption = (select, value, label) => {
        if (!select || value == null) return;
        const exists = Array.from(select.options).some(option => option.value === value);
        if (!exists) {
            const option = new Option(label ?? value, value);
            select.appendChild(option);
        }
    };

    const populateFormForModule = (module, record) => {
        const config = moduleConfigs[module];
        if (!config) return;
        const form = document.getElementById(config.formId);
        if (!form) return;
        const submit = form.querySelector('[type="submit"]');
        if (submit) {
            if (!form.dataset.defaultSubmitText) form.dataset.defaultSubmitText = submit.textContent;
            submit.textContent = config.updateLabel;
        }
        const hidden = form.querySelector('[name="recordId"]');
        if (hidden) hidden.value = record.id;
        switch (module) {
            case 'inventory':
                form.name.value = record.name || '';
                form.sku.value = record.sku || '';
                form.category.value = record.category || '';
                form.cost.value = record.cost ?? '';
                form.stock.value = record.openingStock ?? '';
                form.reorder.value = record.reorder ?? '';
                break;
            case 'purchase':
                ensureSelectOption(form.party, record.partyId, state.parties.find(p => p.id === record.partyId)?.name || '');
                ensureSelectOption(form.item, record.itemId, state.items.find(i => i.id === record.itemId)?.name || '');
                form.party.value = record.partyId || '';
                form.item.value = record.itemId || '';
                form.quantity.value = record.quantity;
                form.rate.value = record.rate;
                form.payment.value = record.paid || 0;
                form.dueDate.value = record.dueDate || '';
                form.date.value = record.date || Utils.toISODate();
                break;
            case 'sale':
                ensureSelectOption(form.party, record.partyId, state.parties.find(p => p.id === record.partyId)?.name || '');
                ensureSelectOption(form.item, record.itemId, state.items.find(i => i.id === record.itemId)?.name || '');
                form.party.value = record.partyId || '';
                form.item.value = record.itemId || '';
                form.quantity.value = record.quantity;
                form.rate.value = record.rate;
                form.payment.value = record.received || 0;
                form.dueDate.value = record.dueDate || '';
                form.date.value = record.date || Utils.toISODate();
                break;
            case 'expense':
                ensureSelectOption(form.party, record.partyId, state.parties.find(p => p.id === record.partyId)?.name || '');
                form.party.value = record.partyId || '';
                form.category.value = record.category || '';
                form.amount.value = record.amount ?? '';
                form.date.value = record.date || Utils.toISODate();
                form.recurring.checked = !!record.recurring;
                const template = form.querySelector('.recurring-template');
                if (template) template.classList.toggle('hidden', !record.recurring);
                const frequency = form.querySelector('select[name="frequency"]');
                if (frequency && record.frequency) frequency.value = record.frequency;
                break;
            case 'cash':
                ensureSelectOption(form.bank, record.accountId, record.accountId === 'cash' ? 'Cash' : state.banks.find(b => b.id === record.accountId)?.name || record.accountId);
                form.bank.value = record.accountId || '';
                form.type.value = record.type || 'deposit';
                form.amount.value = record.amount ?? '';
                form.date.value = record.date || Utils.toISODate();
                form.description.value = record.description || '';
                break;
            case 'loan':
                ensureSelectOption(form.party, record.partyId, state.parties.find(p => p.id === record.partyId)?.name || '');
                form.party.value = record.partyId || '';
                form.type.value = record.accountId === 'loans' ? 'loan' : 'capital';
                form.amount.value = record.amount ?? '';
                form.date.value = record.date || Utils.toISODate();
                form.interest.value = record.interest ?? '';
                break;
            default:
                break;
        }
    };

    const ensureFileHandlePermission = async (handle) => {
        if (!handle || typeof handle.queryPermission !== 'function') return false;
        try {
            const current = await handle.queryPermission({ mode: 'readwrite' });
            if (current === 'granted') return true;
            if (current === 'prompt') {
                const granted = await handle.requestPermission({ mode: 'readwrite' });
                return granted === 'granted';
            }
        } catch (error) {
            console.warn('File handle permission error', error);
        }
        return false;
    };

    const updateAutoBackupIndicators = () => {
        const toggle = document.getElementById('autoBackupToggle');
        if (toggle) toggle.checked = !!autoBackupState.enabled;
        const status = document.getElementById('autoBackupStatus');
        if (status) {
            status.textContent = autoBackupState.lastRun ? Utils.formatDateTime(autoBackupState.lastRun) : 'Never';
        }
    };

    const saveAutoBackupConfig = async () => {
        await DB.setMeta('autoBackupConfig', {
            enabled: autoBackupState.enabled,
            lastRun: autoBackupState.lastRun,
            fileHandle: autoBackupState.fileHandle
        });
        updateAutoBackupIndicators();
    };

    const scheduleAutoBackup = (force = false) => {
        if (!autoBackupState.enabled) return;
        clearTimeout(autoBackupTimer);
        const runBackup = async () => {
            try {
                const snapshot = await DB.exportSnapshot();
                localStorage.setItem('finance-auto-backup', JSON.stringify(snapshot));
                autoBackupState.lastRun = snapshot.exportedAt;
                await saveAutoBackupConfig();
                if (autoBackupState.fileHandle && await ensureFileHandlePermission(autoBackupState.fileHandle)) {
                    await persistSnapshotToFile(autoBackupState.fileHandle, snapshot);
                }
            } catch (error) {
                console.error('Auto-backup failed', error);
                Utils.showToast('Auto-backup failed', 'error');
            }
        };
        autoBackupTimer = setTimeout(runBackup, force ? 0 : 1500);
    };

    const persistSnapshotToFile = async (handle, snapshot) => {
        if (!handle || typeof handle.createWritable !== 'function') return;
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(snapshot, null, 2));
        await writable.close();
    };

    const requestPersistentStorage = async () => {
        if (navigator.storage?.persist) {
            try {
                await navigator.storage.persist();
            } catch (error) {
                console.warn('Persistent storage request failed', error);
            }
        }
    };

    const loadAutoBackupConfig = async () => {
        try {
            const config = await DB.getMeta('autoBackupConfig');
            if (config) {
                autoBackupState.enabled = config.enabled !== false;
                autoBackupState.lastRun = config.lastRun || null;
                if (config.fileHandle && await ensureFileHandlePermission(config.fileHandle)) {
                    autoBackupState.fileHandle = config.fileHandle;
                }
            }
        } catch (error) {
            console.warn('Unable to load auto-backup config', error);
        }
        updateAutoBackupIndicators();
    };

    const maybeRestoreFromAutoBackup = async () => {
        if (!autoBackupState.enabled) return;
        try {
            const snapshotRaw = localStorage.getItem('finance-auto-backup');
            if (!snapshotRaw) return;
            const snapshot = JSON.parse(snapshotRaw);
            const existingItems = await DB.getAll('items');
            if (!existingItems.length) {
                const restoredAt = await DB.importSnapshot(snapshot);
                autoBackupState.lastRun = restoredAt;
                await saveAutoBackupConfig();
            }
        } catch (error) {
            console.warn('Auto-restore skipped', error);
        }
    };

    const bindAutoBackupControls = () => {
        const toggle = document.getElementById('autoBackupToggle');
        const downloadBtn = document.getElementById('btnDownloadAutoBackup');
        const linkBtn = document.getElementById('btnLinkAutoBackupFile');
        const importBtn = document.getElementById('btnImportAutoBackup');
        const importInput = document.getElementById('autoBackupImport');
        if (toggle) {
            toggle.addEventListener('change', async () => {
                autoBackupState.enabled = toggle.checked;
                await saveAutoBackupConfig();
                if (autoBackupState.enabled) {
                    await requestPersistentStorage();
                    scheduleAutoBackup(true);
                }
            });
        }
        downloadBtn?.addEventListener('click', async () => {
            try {
                const snapshot = await DB.exportSnapshot();
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `finance-tool-autobackup-${Date.now()}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
                Utils.showToast('Backup downloaded', 'success');
            } catch (error) {
                console.error(error);
                Utils.showToast('Download failed', 'error');
            }
        });
        linkBtn?.addEventListener('click', async () => {
            if (!window.showSaveFilePicker) {
                Utils.showToast('File-based backup not supported in this browser', 'warning');
                return;
            }
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'finance-tool-autobackup.json',
                    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
                });
                if (!(await ensureFileHandlePermission(handle))) {
                    Utils.showToast('File access denied', 'error');
                    return;
                }
                autoBackupState.fileHandle = handle;
                await saveAutoBackupConfig();
                scheduleAutoBackup(true);
                Utils.showToast('Auto-backup file linked', 'success');
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    console.error(error);
                    Utils.showToast('Unable to link file', 'error');
                }
            }
        });
        importBtn?.addEventListener('click', () => importInput?.click());
        importInput?.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
                const text = await file.text();
                const snapshot = JSON.parse(text);
                await DB.importSnapshot(snapshot);
                await loadState();
                renderAll();
                scheduleAutoBackup(true);
                Utils.showToast('Backup imported', 'success');
            } catch (error) {
                console.error(error);
                Utils.showToast('Import failed', 'error');
            }
        });
    };

    const removeLedgerEntriesForReference = async (referenceId) => {
        if (!referenceId) return;
        const matches = state.ledgerEntries.filter(entry => entry.description?.includes(referenceId));
        for (const entry of matches) {
            await DB.remove('ledgerEntries', entry.id);
        }
        state.ledgerEntries = state.ledgerEntries.filter(entry => !entry.description?.includes(referenceId));
    };

    const removeStockMovementsForTransaction = async (record, type) => {
        if (!record) return;
        const targetType = type === 'sale' ? 'sale' : type === 'purchase' ? 'purchase' : type;
        const matches = state.stockMovements.filter(m =>
            m.referenceId === record.id ||
            (!m.referenceId && m.itemId === record.itemId && m.type === targetType && m.date === record.date && Math.abs(m.quantity) === Math.abs(record.quantity))
        );
        for (const movement of matches) {
            await DB.remove('stockMovements', movement.id);
        }
        state.stockMovements = state.stockMovements.filter(m => !matches.some(match => match.id === m.id));
    };

    const removeAttachment = async (attachmentId) => {
        if (!attachmentId) return;
        await DB.remove('attachments', attachmentId);
        state.attachments = state.attachments.filter(att => att.id !== attachmentId);
    };

    const adjustBankBalance = (entry, direction = 1) => {
        if (!entry) return;
        const bank = state.banks.find(b => b.id === entry.accountId);
        if (!bank) return;
        if (['deposit', 'debit', 'transfer'].includes(entry.type)) {
            bank.balance += direction * entry.amount;
        } else if (['withdrawal', 'credit'].includes(entry.type)) {
            bank.balance -= direction * entry.amount;
        }
        DB.add('banks', bank);
    };

    const beginRecordEdit = async (module, id) => {
        const config = moduleConfigs[module];
        if (!config || !id) return;
        navigate(config.route);
        const form = document.getElementById(config.formId);
        if (!form) return;
        let record = null;
        const collection = state[config.store];
        if (Array.isArray(collection)) {
            record = collection.find(item => item.id === id);
        }
        if (config.store === 'ledgerEntries' && !record) {
            record = state.ledgerEntries.find(item => item.id === id);
        }
        if (!record || (config.filter && !config.filter(record))) {
            Utils.showToast('Record not available for editing', 'error');
            return;
        }
        populateFormForModule(module, record);
        TablesUI.setSelection(config.tableId, record.id);
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const bindRowSelection = () => {
        document.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-edit-record]');
            if (button) {
                event.preventDefault();
                await beginRecordEdit(button.dataset.editRecord, button.dataset.id);
                return;
            }
            const row = event.target.closest('tr[data-record-id]');
            if (row && !event.target.closest('button')) {
                await beginRecordEdit(row.dataset.module, row.dataset.recordId);
            }
        });
        document.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;
            const row = event.target.closest('tr[data-record-id]');
            if (row) {
                event.preventDefault();
                await beginRecordEdit(row.dataset.module, row.dataset.recordId);
            }
        });
    };

    const registerServiceWorker = async () => {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('./sw.js');
            } catch (error) {
                console.warn('Service worker registration failed', error);
            }
        }
    };

    const init = async () => {
        document.getElementById('year').textContent = new Date().getFullYear();
        await DB.init();
        await loadAutoBackupConfig();
        await maybeRestoreFromAutoBackup();
        await loadState();
        bindNavigation();
        bindForms();
        bindThemeToggle();
        bindBackupRestore();
        bindAutoBackupControls();
        bindRowSelection();
        setDefaultFormDates();
        if (autoBackupState.enabled) await requestPersistentStorage();
        renderAll();
        registerServiceWorker();
        runInBrowserTests();
        scheduleAutoBackup(true);
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
                scheduleAutoBackup(true);
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
        const recurringToggle = document.querySelector('#expenseForm input[name="recurring"]');
        recurringToggle?.addEventListener('change', (event) => {
            document.querySelector('.recurring-template')?.classList.toggle('hidden', !event.target.checked);
        });
        document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
        document.getElementById('btnPrintReport').addEventListener('click', () => window.print());
        document.querySelectorAll('form.card').forEach(form => {
            const submit = form.querySelector('[type="submit"]');
            if (submit) form.dataset.defaultSubmitText = submit.textContent;
        });
    };

    const handleInventorySubmit = async (event) => {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const recordId = formData.get('recordId');
        const payload = {
            sku: formData.get('sku'),
            name: formData.get('name'),
            category: formData.get('category'),
            cost: Utils.parseNumber(formData.get('cost')),
            openingStock: Utils.parseNumber(formData.get('stock')),
            reorder: Utils.parseNumber(formData.get('reorder'))
        };
        if (recordId) {
            const existing = state.items.find(item => item.id === recordId);
            if (!existing) {
                Utils.showToast('Item not found', 'error');
                return;
            }
            const updated = { ...existing, ...payload };
            await DB.add('items', updated);
            upsertStateRecord('items', updated);
            const openingMovement = state.stockMovements.find(m => (m.referenceId === updated.id) || (m.itemId === updated.id && m.type === 'opening'));
            if (openingMovement) {
                openingMovement.quantity = updated.openingStock;
                openingMovement.cost = updated.cost;
                await DB.add('stockMovements', openingMovement);
            } else {
                await addStockMovement({
                    itemId: updated.id,
                    type: 'opening',
                    quantity: updated.openingStock,
                    cost: updated.cost,
                    date: Utils.toISODate(),
                    referenceId: updated.id
                });
            }
            Utils.showToast('Item updated', 'success');
        } else {
            const item = {
                id: Utils.uuid(),
                ...payload,
                openingDate: Utils.toISODate()
            };
            await DB.add('items', item);
            state.items.push(item);
            await addStockMovement({
                itemId: item.id,
                type: 'opening',
                quantity: item.openingStock,
                cost: item.cost,
                date: item.openingDate,
                referenceId: item.id
            });
            Utils.showToast('Item saved', 'success');
        }
        renderAll();
        finishFormSubmission('inventory');
        scheduleAutoBackup();
    };

    const addStockMovement = async (movement) => {
        const record = { id: Utils.uuid(), referenceId: movement.referenceId || null, ...movement };
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
        const recordId = formData.get('recordId');
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
        const storeName = isSale ? 'sales' : 'purchases';
        const existing = recordId ? state[storeName].find(entry => entry.id === recordId) : null;
        const date = formData.get('date') || existing?.date || Utils.toISODate();
        const record = existing ? { ...existing } : { id: recordId || Utils.uuid() };
        record.itemId = itemId;
        record.partyId = formData.get('party');
        record.quantity = quantity;
        record.rate = rate;
        record.total = amount;
        record.dueDate = formData.get('dueDate') || null;
        record.date = date;
        record.balance = balance;
        if (isSale) {
            record.received = payment;
            delete record.paid;
        } else {
            record.paid = payment;
            delete record.received;
        }
        let attachmentId = existing?.attachmentId || null;
        const attachment = formData.get('attachment');
        if (attachment && attachment.size) {
            if (attachmentId) await removeAttachment(attachmentId);
            attachmentId = await saveAttachment(attachment, type, record.id);
        }
        record.attachmentId = attachmentId;
        await DB.add(storeName, record);
        upsertStateRecord(storeName, record);
        if (existing) {
            await removeStockMovementsForTransaction(existing, type);
            await removeLedgerEntriesForReference(record.id);
        }
        await addStockMovement({
            itemId,
            type: isSale ? 'sale' : 'purchase',
            quantity: isSale ? -quantity : quantity,
            cost: isSale ? (item?.cost || rate) : rate,
            date: record.date,
            referenceId: record.id
        });
        await registerLedgerEntries(record, type);
        renderAll();
        finishFormSubmission(isSale ? 'sale' : 'purchase');
        scheduleAutoBackup();
        Utils.showToast(`${isSale ? 'Sale' : 'Purchase'} ${existing ? 'updated' : 'recorded'}`, 'success');
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
        const form = event.target;
        const formData = new FormData(form);
        const recordId = formData.get('recordId');
        const amount = Utils.parseNumber(formData.get('amount'));
        const existing = recordId ? state.expenses.find(expense => expense.id === recordId) : null;
        const record = existing ? { ...existing } : { id: recordId || Utils.uuid() };
        record.category = formData.get('category');
        record.amount = amount;
        record.date = formData.get('date') || existing?.date || Utils.toISODate();
        record.partyId = formData.get('party') || null;
        record.recurring = formData.get('recurring') === 'on';
        record.frequency = record.recurring ? (formData.get('frequency') || existing?.frequency || 'monthly') : null;
        const attachment = formData.get('attachment');
        if (attachment && attachment.size) {
            if (record.attachmentId) await removeAttachment(record.attachmentId);
            record.attachmentId = await saveAttachment(attachment, 'expense', record.id);
        }
        await DB.add('expenses', record);
        upsertStateRecord('expenses', record);
        await removeLedgerEntriesForReference(record.id);
        await registerExpenseLedger(record);
        renderAll();
        finishFormSubmission('expense');
        scheduleAutoBackup();
        Utils.showToast(existing ? 'Expense updated' : 'Expense recorded', 'success');
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
        const form = event.target;
        const formData = new FormData(form);
        const recordId = formData.get('recordId');
        const amount = Utils.parseNumber(formData.get('amount'));
        const existing = recordId ? state.ledgerEntries.find(entry => entry.id === recordId) : null;
        const record = existing ? { ...existing } : { id: recordId || Utils.uuid() };
        record.accountId = formData.get('bank');
        record.type = formData.get('type');
        record.amount = amount;
        record.date = formData.get('date') || existing?.date || Utils.toISODate();
        record.description = formData.get('description');
        await DB.add('ledgerEntries', record);
        upsertStateRecord('ledgerEntries', record);
        if (existing) {
            adjustBankBalance(existing, -1);
        }
        adjustBankBalance(record, 1);
        renderAll();
        finishFormSubmission('cash');
        scheduleAutoBackup();
        Utils.showToast(existing ? 'Ledger entry updated' : 'Ledger entry added', 'success');
    };

    const handleLoanSubmit = async (event) => {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const recordId = formData.get('recordId');
        const amount = Utils.parseNumber(formData.get('amount'));
        const typeSelection = formData.get('type');
        const accountId = typeSelection === 'loan' ? 'loans' : 'capital';
        const partyId = formData.get('party');
        const partyName = state.parties.find(p => p.id === partyId)?.name || partyId;
        const existing = recordId ? state.ledgerEntries.find(entry => entry.id === recordId) : null;
        const record = existing ? { ...existing } : { id: recordId || Utils.uuid() };
        record.accountId = accountId;
        record.type = 'credit';
        record.amount = amount;
        record.date = formData.get('date') || existing?.date || Utils.toISODate();
        record.description = `${typeSelection} entry for ${partyName}`;
        record.partyId = partyId;
        record.interest = Utils.parseNumber(formData.get('interest'));
        await DB.add('ledgerEntries', record);
        upsertStateRecord('ledgerEntries', record);
        renderAll();
        finishFormSubmission('loan');
        scheduleAutoBackup();
        Utils.showToast(existing ? 'Loan/capital entry updated' : 'Loan/capital entry saved', 'success');
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
        scheduleAutoBackup();
        Utils.showToast('Settings updated', 'success');
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
