const TransactionsUI = (() => {
    const render = (state) => {
        populateSelects(state);
        renderInventoryTable(state);
        renderPurchaseTable(state);
        renderSalesTable(state);
        renderExpenseTable(state);
        renderReceivableTable(state);
        renderPayableTable(state);
    };

    const populateSelects = (state) => {
        const supplierOptions = state.parties.filter(p => p.type === 'supplier').map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const customerOptions = state.parties.filter(p => p.type === 'customer').map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const itemOptions = state.items.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
        document.querySelector('#purchaseForm select[name="party"]').innerHTML = supplierOptions;
        document.querySelector('#salesForm select[name="party"]').innerHTML = customerOptions;
        document.querySelector('#purchaseForm select[name="item"]').innerHTML = itemOptions;
        document.querySelector('#salesForm select[name="item"]').innerHTML = itemOptions;
        document.querySelector('#expenseForm select[name="party"]').innerHTML = supplierOptions;
        document.querySelector('#cashForm select[name="bank"]').innerHTML = state.banks.map(bank => `<option value="${bank.id}">${bank.name}</option>`).join('');
        document.querySelector('#loanForm select[name="party"]').innerHTML = state.parties.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    };

    const renderInventoryTable = (state) => {
        const tableId = 'inventoryTable';
        const renderer = () => TablesUI.render(tableId, state.items, (item, asHtml) => {
            const quantity = state.stockMovements.filter(m => m.itemId === item.id).reduce((total, m) => total + m.quantity, 0);
            const value = quantity * item.cost;
            if (!asHtml) return `${item.sku} ${item.name} ${item.category}`;
            const reorderFlag = quantity <= item.reorder ? '<span class="badge danger">Low</span>' : '';
            return `<tr>
                <td>${item.sku}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${quantity.toFixed(2)} ${reorderFlag}</td>
                <td>${Utils.formatCurrency(value, state.settings.currency)}</td>
                <td><button class="btn secondary" data-edit-record="inventory" data-id="${item.id}">Edit</button></td>
            </tr>`;
        }, { getId: (item) => item.id, module: 'inventory' });
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    const renderPurchaseTable = (state) => {
        const tableId = 'purchaseTable';
        const renderer = () => TablesUI.render(tableId, state.purchases, (purchase, asHtml) => {
            const supplier = state.parties.find(p => p.id === purchase.partyId)?.name || 'Unknown';
            const item = state.items.find(i => i.id === purchase.itemId)?.name || 'Unknown';
            if (!asHtml) return `${supplier} ${item} ${purchase.date}`;
            const dueClass = Utils.agingBucket(purchase.dueDate).includes('90') ? 'badge danger' : 'badge';
            return `<tr>
                <td>${Utils.formatDate(purchase.date)}</td>
                <td>${supplier}</td>
                <td>${item}</td>
                <td>${purchase.quantity.toFixed(2)}</td>
                <td>${Utils.formatCurrency(purchase.total, state.settings.currency)}</td>
                <td>${Utils.formatCurrency(purchase.paid || 0, state.settings.currency)}</td>
                <td><span class="${dueClass}">${Utils.formatCurrency(purchase.balance, state.settings.currency)}</span></td>
                <td><button class="btn secondary" data-edit-record="purchase" data-id="${purchase.id}">Edit</button></td>
            </tr>`;
        }, { getId: (purchase) => purchase.id, module: 'purchase' });
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    const renderSalesTable = (state) => {
        const tableId = 'salesTable';
        const renderer = () => TablesUI.render(tableId, state.sales, (sale, asHtml) => {
            const customer = state.parties.find(p => p.id === sale.partyId)?.name || 'Unknown';
            const item = state.items.find(i => i.id === sale.itemId)?.name || 'Unknown';
            if (!asHtml) return `${customer} ${item} ${sale.date}`;
            const dueClass = Utils.agingBucket(sale.dueDate).includes('90') ? 'badge danger' : 'badge';
            return `<tr>
                <td>${Utils.formatDate(sale.date)}</td>
                <td>${customer}</td>
                <td>${item}</td>
                <td>${sale.quantity.toFixed(2)}</td>
                <td>${Utils.formatCurrency(sale.total, state.settings.currency)}</td>
                <td>${Utils.formatCurrency(sale.received || 0, state.settings.currency)}</td>
                <td><span class="${dueClass}">${Utils.formatCurrency(sale.balance, state.settings.currency)}</span></td>
                <td><button class="btn secondary" data-edit-record="sale" data-id="${sale.id}">Edit</button></td>
            </tr>`;
        }, { getId: (sale) => sale.id, module: 'sale' });
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    const renderExpenseTable = (state) => {
        const tableId = 'expenseTable';
        const renderer = () => TablesUI.render(tableId, state.expenses, (expense, asHtml) => {
            const vendor = state.parties.find(p => p.id === expense.partyId)?.name || '-';
            if (!asHtml) return `${vendor} ${expense.category} ${expense.date}`;
            return `<tr>
                <td>${Utils.formatDate(expense.date)}</td>
                <td>${expense.category}</td>
                <td>${Utils.formatCurrency(expense.amount, state.settings.currency)}</td>
                <td>${vendor}</td>
                <td>${expense.recurring ? '<span class="badge">Recurring</span>' : '-'}</td>
                <td><button class="btn secondary" data-edit-record="expense" data-id="${expense.id}">Edit</button></td>
            </tr>`;
        }, { getId: (expense) => expense.id, module: 'expense' });
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    const renderReceivableTable = (state) => {
        const tableId = 'receivableTable';
        const rows = state.sales.map(sale => {
            const customer = state.parties.find(p => p.id === sale.partyId)?.name || 'Unknown';
            const bucket = Utils.agingBucket(sale.dueDate);
            return {
                search: `${customer} ${sale.id} ${sale.dueDate}`,
                html: `<tr>
                    <td>${customer}</td>
                    <td>${sale.id}</td>
                    <td>${Utils.formatDate(sale.dueDate)}</td>
                    <td>${Utils.formatCurrency(sale.balance, state.settings.currency)}</td>
                    <td><span class="badge ${bucket.includes('90') ? 'danger' : ''}">${bucket}</span></td>
                </tr>`
            };
        });
        const renderer = () => TablesUI.render(tableId, rows, (row, asHtml) => asHtml ? row.html : row.search);
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    const renderPayableTable = (state) => {
        const tableId = 'payableTable';
        const rows = state.purchases.map(purchase => {
            const supplier = state.parties.find(p => p.id === purchase.partyId)?.name || 'Unknown';
            const bucket = Utils.agingBucket(purchase.dueDate);
            return {
                search: `${supplier} ${purchase.id} ${purchase.dueDate}`,
                html: `<tr>
                    <td>${supplier}</td>
                    <td>${purchase.id}</td>
                    <td>${Utils.formatDate(purchase.dueDate)}</td>
                    <td>${Utils.formatCurrency(purchase.balance, state.settings.currency)}</td>
                    <td><span class="badge ${bucket.includes('90') ? 'danger' : ''}">${bucket}</span></td>
                </tr>`
            };
        });
        const renderer = () => TablesUI.render(tableId, rows, (row, asHtml) => asHtml ? row.html : row.search);
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    return { render };
})();
