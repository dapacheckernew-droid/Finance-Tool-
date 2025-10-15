const Utils = (() => {
    const currencyFormatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD'
    });

    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: 'short', day: '2-digit'
    });

    const toISODate = (date = new Date()) => {
        const d = (date instanceof Date) ? date : new Date(date);
        const tz = d.getTimezoneOffset();
        const normalized = new Date(d.getTime() - (tz * 60 * 1000));
        return normalized.toISOString().split('T')[0];
    };

    const diffInDays = (from, to = new Date()) => {
        const start = (from instanceof Date) ? from : new Date(from);
        const end = (to instanceof Date) ? to : new Date(to);
        return Math.floor((end - start) / (1000 * 60 * 60 * 24));
    };

    const addDays = (date, days) => {
        const d = (date instanceof Date) ? new Date(date) : new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    };

    const agingBucket = (dueDate) => {
        if (!dueDate) return 'Current';
        const days = diffInDays(dueDate);
        if (days <= 0) return 'Current';
        if (days <= 30) return '1-30 Days';
        if (days <= 60) return '31-60 Days';
        if (days <= 90) return '61-90 Days';
        return '90+ Days';
    };

    const formatCurrency = (value, currency = 'USD') => {
        if (!Number.isFinite(value)) return '-';
        return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
    };

    const parseNumber = (value) => {
        if (typeof value === 'number') return value;
        if (!value) return 0;
        const normalized = String(value).replace(/[^0-9.-]/g, '');
        return parseFloat(normalized) || 0;
    };

    const toastContainer = () => document.getElementById('toastContainer');

    const showToast = (message, type = 'info') => {
        const container = toastContainer();
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
            toast.remove();
        }, 4000);
    };

    const weightedAverageCost = (movements) => {
        if (!Array.isArray(movements) || movements.length === 0) return 0;
        let totalQty = 0;
        let totalCost = 0;
        movements.forEach(({ quantity, cost }) => {
            totalQty += quantity;
            totalCost += quantity * cost;
        });
        return totalQty === 0 ? 0 : totalCost / totalQty;
    };

    const groupBy = (list, keyFn) => list.reduce((acc, item) => {
        const key = keyFn(item);
        acc[key] = acc[key] || [];
        acc[key].push(item);
        return acc;
    }, {});

    const sum = (list, selector = x => x) => list.reduce((total, item) => total + selector(item), 0);

    const debounce = (fn, wait = 200) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    };

    const paginate = (items, page = 1, pageSize = 10) => {
        const total = items.length;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        const current = Math.min(Math.max(page, 1), pages);
        const start = (current - 1) * pageSize;
        const end = start + pageSize;
        return {
            items: items.slice(start, end),
            page: current,
            pages,
            total
        };
    };

    const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxx-4xxx-yxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const compressToBase64 = async (file) => {
        if (!file) return null;
        const dataUrl = await readFileAsDataURL(file);
        const [meta, base64] = dataUrl.split(',');
        const compressedBinary = rleCompress(atob(base64));
        const marker = 'RLE1';
        const binaryString = String.fromCharCode(...compressedBinary);
        return `${meta};${marker},${btoa(binaryString)}`;
    };

    const decompressFromBase64 = (dataUrl) => {
        if (!dataUrl) return null;
        const [metaPart, base64] = dataUrl.split(',');
        const [meta, marker] = metaPart.split(';');
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const decompressed = marker === 'RLE1' ? rleDecompress(bytes) : binary;
        return `${meta},${btoa(decompressed)}`;
    };

    const rleCompress = (input) => {
        const bytes = [];
        let count = 1;
        for (let i = 1; i <= input.length; i++) {
            if (input[i] === input[i - 1] && count < 255) {
                count++;
            } else {
                bytes.push(input.charCodeAt(i - 1));
                bytes.push(count);
                count = 1;
            }
        }
        return Uint8Array.from(bytes);
    };

    const rleDecompress = (bytes) => {
        let result = '';
        for (let i = 0; i < bytes.length; i += 2) {
            const char = String.fromCharCode(bytes[i]);
            const count = bytes[i + 1];
            result += char.repeat(count);
        }
        return result;
    };

    const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const ensureArray = (value) => Array.isArray(value) ? value : [];

    const formatPercent = (value, fractionDigits = 1) => `${(value * 100).toFixed(fractionDigits)}%`;

    return {
        formatCurrency,
        parseNumber,
        formatDate: (date) => date ? dateFormatter.format(new Date(date)) : '',
        toISODate,
        diffInDays,
        addDays,
        agingBucket,
        showToast,
        weightedAverageCost,
        groupBy,
        sum,
        debounce,
        paginate,
        uuid,
        compressToBase64,
        decompressFromBase64,
        readFileAsDataURL,
        ensureArray,
        formatPercent
    };
})();

window.Utils = Utils;
