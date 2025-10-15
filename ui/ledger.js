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
            </tr>`;
        });
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    const renderLoanTable = (state) => {
        const tableId = 'loanTable';
        const entries = state.ledgerEntries.filter(entry => ['loans', 'capital'].includes(entry.accountId));
        const aggregated = entries.reduce((acc, entry) => {
            const key = entry.description;
            acc[key] = acc[key] || { description: entry.description, date: entry.date, type: entry.accountId, amount: 0 };
            acc[key].amount += entry.amount;
            return acc;
        }, {});
        const rows = Object.values(aggregated).map(entry => ({
            search: `${entry.description} ${entry.type}`,
            html: `<tr>
                <td>${Utils.formatDate(entry.date)}</td>
                <td>${entry.description}</td>
                <td>${entry.type === 'loans' ? 'Loan' : 'Capital'}</td>
                <td>${Utils.formatCurrency(entry.amount, state.settings.currency)}</td>
                <td>${Utils.formatCurrency(entry.amount, state.settings.currency)}</td>
            </tr>`
        }));
        const renderer = () => TablesUI.render(tableId, rows, (row, asHtml) => asHtml ? row.html : row.search);
        TablesUI.setRenderer(tableId, renderer);
        renderer();
    };

    return { render };
})();
