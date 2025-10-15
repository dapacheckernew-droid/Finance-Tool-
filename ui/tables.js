const TablesUI = (() => {
    const tableState = {};

    const render = (tableId, data, renderRow, options = {}) => {
        const pageSize = options.pageSize || 10;
        const state = tableState[tableId] || { page: 1, query: '', selectedId: null };
        const filtered = data.filter(item => renderRow(item).toLowerCase().includes(state.query.toLowerCase()));
        const { items, page, pages } = Utils.paginate(filtered, state.page, pageSize);
        tableState[tableId] = { ...state, page };
        const tbody = document.querySelector(`#${tableId} tbody`);
        if (!tbody) return;
        tbody.innerHTML = items.map(item => renderRow(item, true)).join('');
        if (options.getId) {
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.forEach((row, index) => {
                const recordId = options.getId(items[index]);
                row.dataset.recordId = recordId;
                row.dataset.module = options.module || tableId;
                row.tabIndex = 0;
                if (tableState[tableId].selectedId === recordId) {
                    row.classList.add('table-row-selected');
                }
            });
        }
        renderPagination(tableId, pages);
    };

    const renderPagination = (tableId, pages) => {
        const container = document.querySelector(`.pagination[data-table="${tableId}"]`);
        if (!container) return;
        const state = tableState[tableId];
        if (pages <= 1) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = '';
        for (let i = 1; i <= pages; i++) {
            const button = document.createElement('button');
            button.textContent = i;
            if (i === state.page) button.disabled = true;
            button.addEventListener('click', () => {
                tableState[tableId].page = i;
                state.onRender();
            });
            container.appendChild(button);
        }
    };

    const bindSearch = () => {
        document.querySelectorAll('[id$="Search"]').forEach(input => {
            if (input.dataset.bound) return;
            const tableId = input.id.replace('Search', 'Table');
            input.dataset.bound = 'true';
            input.addEventListener('input', Utils.debounce((event) => {
                const query = event.target.value;
                tableState[tableId] = tableState[tableId] || { page: 1, query: '' };
                tableState[tableId].query = query;
                tableState[tableId].page = 1;
                tableState[tableId].onRender();
            }, 200));
        });
    };

    const setRenderer = (tableId, renderer) => {
        tableState[tableId] = tableState[tableId] || { page: 1, query: '', selectedId: null };
        tableState[tableId].onRender = renderer;
    };

    const setSelection = (tableId, recordId) => {
        tableState[tableId] = tableState[tableId] || { page: 1, query: '', selectedId: null };
        tableState[tableId].selectedId = recordId;
        tableState[tableId].onRender?.();
    };

    const clearSelection = (tableId) => {
        if (!tableState[tableId]) return;
        tableState[tableId].selectedId = null;
        tableState[tableId].onRender?.();
    };

    return { render, bindSearch, setRenderer, setSelection, clearSelection };
})();
