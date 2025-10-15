const LedgerUI = (() => {
    const render = (state) => {
        renderCashLedger(state);
        renderLoanTable(state);
    };

    const renderCashLedger = (state) => {
        const tableId = 'cashTable';
        const entries = state.ledgerEntries.filter(entry => state.banks.some(bank => bank.id === entry.accountId) || entry.accountId === 'cash');
        const renderer = () => TablesUI.render(tableId, entries, (entry, asHtml) => {
            const bankName = state.banks.find(bank => bank.id === entry.accountId)?.name || 'Cash';
            if (!asHtml) return `${bankName} ${entry.type} ${entry.date}`;
            const debit = entry.type === 'deposit' || entry.type === 'debit' ? Utils.formatCurrency(entry.amount, state.settings.currency) : '';
            const credit = entry.type === 'withdrawal' || entry.type === 'credit' ? Utils.formatCurrency(entry.amount, state.settings.currency) : '';
            return `<tr>
                <td>${Utils.formatDate(entry.date)}</td>
                <td>${bankName}</td>
                <td>${entry.type}</td>
                <td>${debit}</td>
                <td>${credit}</td>
                <td><button class="btn secondary" data-edit-record="cash" data-id="${entry.id}">Edit</button></td>
            </tr>`;
        }, { getId: (entry) => entry.id, module: 'cash' });
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    const renderLoanTable = (state) => {
        const tableId = 'loanTable';
        const entries = state.ledgerEntries.filter(entry => ['loans', 'capital'].includes(entry.accountId));
        const renderer = () => TablesUI.render(tableId, entries, (entry, asHtml) => {
            const party = state.parties.find(p => p.id === entry.partyId)?.name || entry.description?.split(' for ')[1] || '-';
            if (!asHtml) return `${entry.accountId} ${party} ${entry.date}`;
            const balance = entry.type === 'credit' ? entry.amount : -entry.amount;
            return `<tr>
                <td>${Utils.formatDate(entry.date)}</td>
                <td>${party}</td>
                <td>${entry.accountId === 'loans' ? 'Loan' : 'Capital'}</td>
                <td>${Utils.formatCurrency(entry.amount, state.settings.currency)}</td>
                <td>${Utils.formatCurrency(balance, state.settings.currency)}</td>
                <td><button class="btn secondary" data-edit-record="loan" data-id="${entry.id}">Edit</button></td>
            </tr>`;
        }, { getId: (entry) => entry.id, module: 'loan' });
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    return { render };
})();
