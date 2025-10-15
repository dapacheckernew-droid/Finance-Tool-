const DB = (() => {
    const DB_NAME = 'finance_tool';
    const DB_VERSION = 2;
    const STORE_NAMES = ['items', 'stockMovements', 'purchases', 'sales', 'expenses', 'ledgerEntries', 'parties', 'banks', 'attachments'];
    const META_STORE = 'meta';
    let dbPromise = null;

    const openDB = () => {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                createStores(db);
            };
            request.onsuccess = async () => {
                const db = request.result;
                await seedData(db);
                resolve(db);
            };
        });
        return dbPromise;
    };

    const createStores = (db) => {
        if (!db.objectStoreNames.contains('items')) {
            const store = db.createObjectStore('items', { keyPath: 'id' });
            store.createIndex('sku', 'sku', { unique: true });
            store.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('stockMovements')) {
            const store = db.createObjectStore('stockMovements', { keyPath: 'id' });
            store.createIndex('itemId', 'itemId');
            store.createIndex('type', 'type');
            store.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('purchases')) {
            const store = db.createObjectStore('purchases', { keyPath: 'id' });
            store.createIndex('partyId', 'partyId');
            store.createIndex('itemId', 'itemId');
            store.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('sales')) {
            const store = db.createObjectStore('sales', { keyPath: 'id' });
            store.createIndex('partyId', 'partyId');
            store.createIndex('itemId', 'itemId');
            store.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('expenses')) {
            const store = db.createObjectStore('expenses', { keyPath: 'id' });
            store.createIndex('partyId', 'partyId');
            store.createIndex('date', 'date');
            store.createIndex('category', 'category');
        }
        if (!db.objectStoreNames.contains('ledgerEntries')) {
            const store = db.createObjectStore('ledgerEntries', { keyPath: 'id' });
            store.createIndex('accountId', 'accountId');
            store.createIndex('type', 'type');
            store.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('parties')) {
            const store = db.createObjectStore('parties', { keyPath: 'id' });
            store.createIndex('type', 'type');
            store.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('banks')) {
            db.createObjectStore('banks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('attachments')) {
            const store = db.createObjectStore('attachments', { keyPath: 'id' });
            store.createIndex('linkedId', 'linkedId');
            store.createIndex('module', 'module');
            store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE);
        }
    };

    const withStore = async (storeName, mode, callback) => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = callback(store);
            tx.oncomplete = () => resolve(request?.result);
            tx.onerror = () => reject(tx.error);
        });
    };

    const getAll = async (storeName) => {
        return withStore(storeName, 'readonly', (store) => store.getAll());
    };

    const getById = async (storeName, id) => {
        return withStore(storeName, 'readonly', (store) => store.get(id));
    };

    const add = async (storeName, value) => {
        return withStore(storeName, 'readwrite', (store) => store.put(value));
    };

    const remove = async (storeName, id) => {
        return withStore(storeName, 'readwrite', (store) => store.delete(id));
    };

    const seedData = async (db) => {
        const tx = db.transaction(STORE_NAMES, 'readwrite');
        const itemsStore = tx.objectStore('items');
        const countRequest = itemsStore.count();
        return new Promise((resolve, reject) => {
            countRequest.onsuccess = () => {
                if (countRequest.result > 0) {
                    resolve();
                    return;
                }
                const parties = sampleParties();
                const items = sampleItems();
                const banks = sampleBanks();
                const expenses = sampleExpenses();
                const purchases = samplePurchases(items, parties);
                const sales = sampleSales(items, parties);
                const stockMovements = buildStockMovements(items, purchases, sales);
                const attachments = [];

                parties.forEach(p => tx.objectStore('parties').put(p));
                items.forEach(i => tx.objectStore('items').put(i));
                banks.forEach(b => tx.objectStore('banks').put(b));
                expenses.forEach(e => tx.objectStore('expenses').put(e));
                purchases.forEach(p => tx.objectStore('purchases').put(p));
                sales.forEach(s => tx.objectStore('sales').put(s));
                stockMovements.forEach(m => tx.objectStore('stockMovements').put(m));
                attachments.forEach(a => tx.objectStore('attachments').put(a));

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
            countRequest.onerror = () => reject(countRequest.error);
        });
    };

    const buildStockMovements = (items, purchases, sales) => {
        const movements = [];
        items.forEach(item => {
            movements.push({
                id: Utils.uuid(),
                itemId: item.id,
                type: 'opening',
                quantity: item.openingStock,
                cost: item.cost,
                date: Utils.toISODate(item.openingDate),
                referenceId: item.id
            });
        });
        purchases.forEach(purchase => {
            movements.push({
                id: Utils.uuid(),
                itemId: purchase.itemId,
                type: 'purchase',
                quantity: purchase.quantity,
                cost: purchase.rate,
                date: purchase.date,
                referenceId: purchase.id
            });
        });
        sales.forEach(sale => {
            const item = items.find(i => i.id === sale.itemId);
            movements.push({
                id: Utils.uuid(),
                itemId: sale.itemId,
                type: 'sale',
                quantity: -sale.quantity,
                cost: item?.cost || sale.rate,
                date: sale.date,
                referenceId: sale.id
            });
        });
        return movements;
    };

    const sampleItems = () => {
        const today = Utils.toISODate();
        return [
            { id: 'item-1', sku: 'SKU-001', name: 'Office Chair', category: 'Furniture', cost: 95, openingStock: 20, reorder: 5, openingDate: today },
            { id: 'item-2', sku: 'SKU-002', name: 'Standing Desk', category: 'Furniture', cost: 220, openingStock: 10, reorder: 2, openingDate: today },
            { id: 'item-3', sku: 'SKU-003', name: 'LED Monitor 24"', category: 'Electronics', cost: 130, openingStock: 18, reorder: 4, openingDate: today },
            { id: 'item-4', sku: 'SKU-004', name: 'Wireless Keyboard', category: 'Electronics', cost: 32, openingStock: 35, reorder: 10, openingDate: today },
            { id: 'item-5', sku: 'SKU-005', name: 'Wireless Mouse', category: 'Electronics', cost: 22, openingStock: 40, reorder: 12, openingDate: today },
            { id: 'item-6', sku: 'SKU-006', name: 'USB-C Hub', category: 'Accessories', cost: 28, openingStock: 25, reorder: 6, openingDate: today },
            { id: 'item-7', sku: 'SKU-007', name: 'Noise Cancelling Headphones', category: 'Electronics', cost: 160, openingStock: 12, reorder: 3, openingDate: today },
            { id: 'item-8', sku: 'SKU-008', name: 'Projector', category: 'Electronics', cost: 480, openingStock: 5, reorder: 1, openingDate: today },
            { id: 'item-9', sku: 'SKU-009', name: 'Printer Ink Cartridge', category: 'Supplies', cost: 18, openingStock: 50, reorder: 15, openingDate: today },
            { id: 'item-10', sku: 'SKU-010', name: 'Stationery Pack', category: 'Supplies', cost: 12, openingStock: 60, reorder: 20, openingDate: today }
        ];
    };

    const sampleParties = () => {
        return [
            { id: 'party-1', name: 'Acme Supplies', type: 'supplier', email: 'sales@acme.com' },
            { id: 'party-2', name: 'Blue Ocean Traders', type: 'supplier', email: 'hello@blueocean.com' },
            { id: 'party-3', name: 'Creative Solutions', type: 'customer', email: 'finance@creative.com' },
            { id: 'party-4', name: 'Delta Works', type: 'customer', email: 'accounts@delta.com' },
            { id: 'party-5', name: 'Evergreen Retail', type: 'customer', email: 'orders@evergreen.com' },
            { id: 'party-6', name: 'Future Tech Labs', type: 'supplier', email: 'accounts@futuretech.com' },
            { id: 'party-7', name: 'Green Leaf Stores', type: 'customer', email: 'billing@greenleaf.com' },
            { id: 'party-8', name: 'Horizon Partners', type: 'supplier', email: 'support@horizon.com' },
            { id: 'party-9', name: 'Insight Marketing', type: 'customer', email: 'finance@insight.com' },
            { id: 'party-10', name: 'Jetstream Logistics', type: 'supplier', email: 'info@jetstream.com' }
        ];
    };

    const sampleBanks = () => [
        { id: 'bank-1', name: 'Operating Account', balance: 5000 },
        { id: 'bank-2', name: 'Savings Account', balance: 15000 },
        { id: 'bank-3', name: 'Petty Cash', balance: 750 }
    ];

    const sampleExpenses = () => {
        const today = new Date();
        return [
            { id: Utils.uuid(), category: 'Rent', amount: 1200, date: Utils.toISODate(Utils.addDays(today, -20)), partyId: 'party-2', recurring: true, frequency: 'monthly' },
            { id: Utils.uuid(), category: 'Utilities', amount: 350, date: Utils.toISODate(Utils.addDays(today, -10)), partyId: 'party-1', recurring: true, frequency: 'monthly' },
            { id: Utils.uuid(), category: 'Software', amount: 220, date: Utils.toISODate(Utils.addDays(today, -15)), partyId: 'party-6', recurring: true, frequency: 'monthly' },
            { id: Utils.uuid(), category: 'Travel', amount: 540, date: Utils.toISODate(Utils.addDays(today, -5)), partyId: 'party-5', recurring: false },
            { id: Utils.uuid(), category: 'Maintenance', amount: 310, date: Utils.toISODate(Utils.addDays(today, -7)), partyId: 'party-8', recurring: false }
        ];
    };

    const samplePurchases = (items, parties) => {
        const suppliers = parties.filter(p => p.type === 'supplier');
        const today = new Date();
        return items.slice(0, 5).map((item, index) => {
            const supplier = suppliers[index % suppliers.length];
            const qty = 5 + index * 2;
            return {
                id: Utils.uuid(),
                itemId: item.id,
                partyId: supplier.id,
                quantity: qty,
                rate: item.cost * 0.95,
                total: qty * item.cost * 0.95,
                paid: qty * item.cost * 0.6,
                balance: qty * item.cost * 0.35,
                dueDate: Utils.toISODate(Utils.addDays(today, 14 - index * 3)),
                date: Utils.toISODate(Utils.addDays(today, -index * 3)),
                attachmentId: null
            };
        });
    };

    const sampleSales = (items, parties) => {
        const customers = parties.filter(p => p.type === 'customer');
        const today = new Date();
        return items.slice(3, 8).map((item, index) => {
            const customer = customers[index % customers.length];
            const qty = 3 + index;
            const rate = item.cost * 1.4;
            return {
                id: Utils.uuid(),
                itemId: item.id,
                partyId: customer.id,
                quantity: qty,
                rate,
                total: qty * rate,
                received: qty * rate * 0.7,
                balance: qty * rate * 0.3,
                dueDate: Utils.toISODate(Utils.addDays(today, 7 + index * 2)),
                date: Utils.toISODate(Utils.addDays(today, -index * 4)),
                attachmentId: null
            };
        });
    };

    const listAllData = async () => {
        const db = await openDB();
        const stores = await Promise.all(STORE_NAMES.map(store => new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const request = tx.objectStore(store).getAll();
            request.onsuccess = () => resolve({ store, data: request.result });
            request.onerror = () => reject(request.error);
        })));
        return stores.reduce((acc, { store, data }) => ({ ...acc, [store]: data }), {});
    };

    const exportSnapshot = async () => {
        const data = await listAllData();
        return { version: DB_VERSION, exportedAt: new Date().toISOString(), data };
    };

    const importSnapshot = async (snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') throw new Error('Invalid snapshot');
        const payload = snapshot.data ? snapshot : { data: snapshot };
        const db = await openDB();
        const tx = db.transaction(STORE_NAMES, 'readwrite');
        STORE_NAMES.forEach(store => {
            const objectStore = tx.objectStore(store);
            objectStore.clear();
            Utils.ensureArray(payload.data?.[store]).forEach(item => objectStore.put(item));
        });
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(payload.exportedAt || new Date().toISOString());
            tx.onerror = () => reject(tx.error);
        });
    };

    const setMeta = async (key, value) => withStore(META_STORE, 'readwrite', (store) => store.put(value, key));
    const getMeta = async (key) => withStore(META_STORE, 'readonly', (store) => store.get(key));
    const removeMeta = async (key) => withStore(META_STORE, 'readwrite', (store) => store.delete(key));

    const deriveKey = async (passphrase, salt) => {
        const enc = new TextEncoder();
        const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
        }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    };

    const backup = async (passphrase) => {
        if (!passphrase) throw new Error('Passphrase is required');
        const { data, exportedAt } = await exportSnapshot();
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(passphrase, salt);
        const encoded = encoder.encode(JSON.stringify({ exportedAt, data }));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        const payload = {
            version: DB_VERSION,
            salt: Array.from(salt),
            iv: Array.from(iv),
            cipher: Array.from(new Uint8Array(encrypted))
        };
        return btoa(JSON.stringify(payload));
    };

    const restore = async (passphrase, backupString) => {
        if (!passphrase || !backupString) throw new Error('Backup data missing');
        const payload = JSON.parse(atob(backupString));
        const salt = new Uint8Array(payload.salt);
        const iv = new Uint8Array(payload.iv);
        const cipher = new Uint8Array(payload.cipher);
        const key = await deriveKey(passphrase, salt);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
        const decoder = new TextDecoder();
        const { data } = JSON.parse(decoder.decode(decrypted));
        await importSnapshot({ data });
    };

    const api = {
        init: openDB,
        getAll,
        getById,
        add,
        remove,
        backup,
        restore,
        exportSnapshot,
        importSnapshot,
        setMeta,
        getMeta,
        removeMeta
    };

    window.DB = api;
    return api;
})();
