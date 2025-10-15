const Reports = (() => {
    const calculateProfitAndLoss = (state) => {
        const revenue = state.sales.reduce((total, sale) => total + sale.total, 0);
        const cogs = calculateCOGS(state);
        const expenses = state.expenses.reduce((total, expense) => total + expense.amount, 0);
        const grossProfit = revenue - cogs;
        const netIncome = grossProfit - expenses;
        return { revenue, cogs, grossProfit, expenses, netIncome };
    };

    const calculateCOGS = (state) => {
        const movements = state.stockMovements.filter(m => m.type !== 'opening');
        const sales = movements.filter(m => m.type === 'sale');
        return sales.reduce((total, sale) => total + Math.abs(sale.quantity) * sale.cost, 0);
    };

    const calculateCashFlow = (state) => {
        const inflows = state.sales.reduce((total, sale) => total + (sale.received || 0), 0) +
            state.ledgerEntries.filter(e => e.accountId === 'cash' && e.type === 'debit').reduce((total, entry) => total + entry.amount, 0);
        const outflows = state.purchases.reduce((total, purchase) => total + (purchase.paid || 0), 0) +
            state.expenses.reduce((total, expense) => total + expense.amount, 0) +
            state.ledgerEntries.filter(e => e.accountId === 'cash' && e.type === 'credit').reduce((total, entry) => total + entry.amount, 0);
        return { inflows, outflows, net: inflows - outflows };
    };

    const calculateInventoryValuation = (state) => {
        const valuation = state.items.map(item => {
            const quantity = state.stockMovements.filter(m => m.itemId === item.id).reduce((total, m) => total + m.quantity, 0);
            return { ...item, quantity, value: quantity * item.cost };
        });
        const totalValue = valuation.reduce((total, item) => total + item.value, 0);
        return { valuation, totalValue };
    };

    const calculateSalesAnalysis = (state) => {
        const byCustomer = Utils.groupBy(state.sales, sale => sale.partyId);
        const byItem = Utils.groupBy(state.sales, sale => sale.itemId);
        const topCustomers = Object.entries(byCustomer).map(([partyId, sales]) => ({
            name: state.parties.find(p => p.id === partyId)?.name || 'Unknown',
            total: sales.reduce((sum, sale) => sum + sale.total, 0)
        })).sort((a, b) => b.total - a.total);
        const topItems = Object.entries(byItem).map(([itemId, sales]) => ({
            name: state.items.find(item => item.id === itemId)?.name || 'Unknown',
            quantity: sales.reduce((sum, sale) => sum + sale.quantity, 0),
            total: sales.reduce((sum, sale) => sum + sale.total, 0)
        })).sort((a, b) => b.total - a.total);
        return { topCustomers, topItems };
    };

    const calculateExpenseAnalysis = (state) => {
        const byCategory = Utils.groupBy(state.expenses, expense => expense.category || 'Other');
        const categories = Object.entries(byCategory).map(([category, expenses]) => ({
            category,
            total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
            recurring: expenses.filter(expense => expense.recurring).length
        })).sort((a, b) => b.total - a.total);
        return { categories };
    };

    const calculateTaxSummary = (state, rate = 0.18) => {
        const taxableSales = state.sales.reduce((total, sale) => total + sale.total, 0);
        const taxablePurchases = state.purchases.reduce((total, purchase) => total + purchase.total, 0);
        const outputTax = taxableSales * rate;
        const inputTax = taxablePurchases * rate;
        return { rate, taxableSales, taxablePurchases, outputTax, inputTax, netTax: outputTax - inputTax };
    };

    const calculateDashboardKPIs = (state) => {
        const pnl = calculateProfitAndLoss(state);
        const cash = calculateCashFlow(state);
        const inventory = calculateInventoryValuation(state);
        const receivables = state.sales.reduce((total, sale) => total + sale.balance, 0);
        const payables = state.purchases.reduce((total, purchase) => total + purchase.balance, 0);
        return [
            { label: 'Revenue', value: pnl.revenue },
            { label: 'Net Income', value: pnl.netIncome },
            { label: 'Cash Position', value: cash.net },
            { label: 'Inventory Value', value: inventory.totalValue },
            { label: 'Receivables', value: receivables },
            { label: 'Payables', value: payables }
        ];
    };

    const calculateReceivableAging = (state) => {
        const buckets = {
            Current: { label: 'Current', total: 0 },
            '1-30 Days': { label: '1-30 Days', total: 0 },
            '31-60 Days': { label: '31-60 Days', total: 0 },
            '61-90 Days': { label: '61-90 Days', total: 0 },
            '90+ Days': { label: '90+ Days', total: 0 }
        };
        state.sales.forEach(sale => {
            const bucket = Utils.agingBucket(sale.dueDate);
            buckets[bucket].total += sale.balance;
        });
        return buckets;
    };

    const calculatePayableAging = (state) => {
        const buckets = {
            Current: { label: 'Current', total: 0 },
            '1-30 Days': { label: '1-30 Days', total: 0 },
            '31-60 Days': { label: '31-60 Days', total: 0 },
            '61-90 Days': { label: '61-90 Days', total: 0 },
            '90+ Days': { label: '90+ Days', total: 0 }
        };
        state.purchases.forEach(purchase => {
            const bucket = Utils.agingBucket(purchase.dueDate);
            buckets[bucket].total += purchase.balance;
        });
        return buckets;
    };

    const calculateLedgerBalance = (state) => {
        const debits = state.ledgerEntries.filter(entry => entry.type === 'debit').reduce((sum, entry) => sum + entry.amount, 0);
        const credits = state.ledgerEntries.filter(entry => entry.type === 'credit').reduce((sum, entry) => sum + entry.amount, 0);
        return { debits, credits, balanced: Math.abs(debits - credits) < 0.01 };
    };

    return {
        calculateProfitAndLoss,
        calculateCashFlow,
        calculateInventoryValuation,
        calculateSalesAnalysis,
        calculateExpenseAnalysis,
        calculateTaxSummary,
        calculateDashboardKPIs,
        calculateReceivableAging,
        calculatePayableAging,
        calculateLedgerBalance
    };
})();

const ReportsUI = (() => {
    const renderDashboardKPIs = (state) => {
        const kpiContainer = document.getElementById('dashboardKPIs');
        kpiContainer.innerHTML = '';
        Reports.calculateDashboardKPIs(state).forEach(kpi => {
            const card = document.createElement('div');
            card.className = 'kpi-card';
            card.innerHTML = `<p>${kpi.label}</p><p class="value">${Utils.formatCurrency(kpi.value, state.settings.currency)}</p>`;
            kpiContainer.appendChild(card);
        });
        renderAlerts(state);
        renderCharts(state);
    };

    const renderAlerts = (state) => {
        const alerts = [];
        state.items.forEach(item => {
            const quantity = state.stockMovements.filter(m => m.itemId === item.id).reduce((total, m) => total + m.quantity, 0);
            if (quantity <= item.reorder) {
                alerts.push({ level: 'warning', message: `${item.name} is below reorder level` });
            }
        });
        const receivables = Reports.calculateReceivableAging(state);
        if (receivables['61-90 Days'].total + receivables['90+ Days'].total > 0) {
            alerts.push({ level: 'danger', message: 'Aged receivables require attention' });
        }
        const alertContainer = document.getElementById('dashboardAlerts');
        alertContainer.innerHTML = alerts.map(alert => `<div class="alert-card ${alert.level === 'warning' ? 'warning' : ''}">${alert.message}</div>`).join('');
    };

    const renderCharts = (state) => {
        renderLineChart('salesChart', state.sales.map(sale => ({ date: sale.date, value: sale.total })), '#2563eb');
        const cashFlow = Reports.calculateCashFlow(state);
        renderBarChart('cashFlowChart', [
            { label: 'Inflows', value: cashFlow.inflows },
            { label: 'Outflows', value: cashFlow.outflows },
            { label: 'Net', value: cashFlow.net }
        ], '#10b981');
        const inventory = Reports.calculateInventoryValuation(state);
        renderBarChart('inventoryChart', inventory.valuation.slice(0, 5).map(item => ({ label: item.name, value: item.value })), '#f59e0b');
    };

    const renderLineChart = (canvasId, data, color) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (data.length === 0) return;
        const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
        const values = sorted.map(entry => entry.value);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const padding = 20;
        const denominator = Math.max(sorted.length - 1, 1);
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        sorted.forEach((entry, index) => {
            const x = padding + (index / denominator) * Math.max(canvas.width - padding * 2, 1);
            const y = canvas.height - padding - ((entry.value - min) / (max - min || 1)) * (canvas.height - padding * 2);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    };

    const renderBarChart = (canvasId, data, color) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (data.length === 0) return;
        const max = Math.max(...data.map(entry => entry.value), 1);
        const barWidth = (canvas.width / data.length) * 0.6;
        data.forEach((entry, index) => {
            const x = (index + 0.2) * (canvas.width / data.length);
            const height = (entry.value / max) * (canvas.height - 20);
            ctx.fillStyle = color;
            ctx.fillRect(x, canvas.height - height - 10, barWidth, height);
            ctx.fillStyle = '#555';
            ctx.font = '10px sans-serif';
            ctx.fillText(entry.label, x, canvas.height - 2);
        });
    };

    const renderReport = (type, state) => {
        const container = document.getElementById('reportOutput');
        let html = '';
        switch (type) {
            case 'pl': {
                const pnl = Reports.calculateProfitAndLoss(state);
                html = `
                    <h3>Profit &amp; Loss</h3>
                    <p>Revenue: ${Utils.formatCurrency(pnl.revenue, state.settings.currency)}</p>
                    <p>Cost of Goods Sold: ${Utils.formatCurrency(pnl.cogs, state.settings.currency)}</p>
                    <p>Gross Profit: ${Utils.formatCurrency(pnl.grossProfit, state.settings.currency)}</p>
                    <p>Expenses: ${Utils.formatCurrency(pnl.expenses, state.settings.currency)}</p>
                    <p><strong>Net Income: ${Utils.formatCurrency(pnl.netIncome, state.settings.currency)}</strong></p>
                `;
                break;
            }
            case 'cashflow': {
                const cash = Reports.calculateCashFlow(state);
                html = `
                    <h3>Cash Flow</h3>
                    <p>Inflows: ${Utils.formatCurrency(cash.inflows, state.settings.currency)}</p>
                    <p>Outflows: ${Utils.formatCurrency(cash.outflows, state.settings.currency)}</p>
                    <p><strong>Net: ${Utils.formatCurrency(cash.net, state.settings.currency)}</strong></p>
                `;
                break;
            }
            case 'inventory': {
                const inventory = Reports.calculateInventoryValuation(state);
                html = `
                    <h3>Inventory Valuation</h3>
                    <p>Total Value: ${Utils.formatCurrency(inventory.totalValue, state.settings.currency)}</p>
                    <ul>${inventory.valuation.map(item => `<li>${item.name}: ${item.quantity} units (${Utils.formatCurrency(item.value, state.settings.currency)})</li>`).join('')}</ul>
                `;
                break;
            }
            case 'sales': {
                const sales = Reports.calculateSalesAnalysis(state);
                html = `
                    <h3>Sales Analysis</h3>
                    <h4>Top Customers</h4>
                    <ul>${sales.topCustomers.map(customer => `<li>${customer.name}: ${Utils.formatCurrency(customer.total, state.settings.currency)}</li>`).join('')}</ul>
                    <h4>Top Items</h4>
                    <ul>${sales.topItems.map(item => `<li>${item.name}: ${item.quantity} units (${Utils.formatCurrency(item.total, state.settings.currency)})</li>`).join('')}</ul>
                `;
                break;
            }
            case 'expenses': {
                const expenses = Reports.calculateExpenseAnalysis(state);
                html = `
                    <h3>Expense Analysis</h3>
                    <ul>${expenses.categories.map(category => `<li>${category.category}: ${Utils.formatCurrency(category.total, state.settings.currency)} (${category.recurring} recurring)</li>`).join('')}</ul>
                `;
                break;
            }
            case 'tax': {
                const tax = Reports.calculateTaxSummary(state);
                html = `
                    <h3>Tax Summary</h3>
                    <p>Output Tax: ${Utils.formatCurrency(tax.outputTax, state.settings.currency)}</p>
                    <p>Input Tax: ${Utils.formatCurrency(tax.inputTax, state.settings.currency)}</p>
                    <p><strong>Net Tax: ${Utils.formatCurrency(tax.netTax, state.settings.currency)}</strong></p>
                `;
                break;
            }
        }
        container.innerHTML = html;
    };

    const bind = () => {
        document.querySelectorAll('#reports .btn[data-report]').forEach(button => {
            button.addEventListener('click', () => {
                ReportsUI.renderReport(button.dataset.report, App.state);
            });
        });
    };

    bind();

    return {
        renderDashboardKPIs,
        renderReport
    };
})();
