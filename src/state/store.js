// src/state/store.js
import { fetchCloudData, pushCloudData } from '../services/api.js';

const UI_PREF_KEY = 'budget_tracker_is_masked';
const THEME_PREF_KEY = 'theme';
const LOCAL_CACHE_KEY = 'budget_tracker_local_cache';

/**
 * Membaca data tersimpan (accounts, categories, transactions) dari cache localStorage.
 * @returns {{ accounts: Array|null, categories: Array|null, transactions: Array|null }}
 */
function getInitialLocalData() {
  try {
    const saved = localStorage.getItem(LOCAL_CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : null,
        categories: Array.isArray(parsed.categories) ? parsed.categories : null,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : null,
      };
    }
  } catch (err) {
    console.warn('Gagal membaca cache lokal dari localStorage:', err);
  }
  return { accounts: null, categories: null, transactions: null };
}

/**
 * Menyimpan data accounts, categories, dan transactions ke cache localStorage secara langsung.
 * @param {Object} state
 */
function saveLocalCache(state) {
  try {
    const payload = {
      accounts: state.accounts || [],
      categories: state.categories || [],
      transactions: state.transactions || [],
    };
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Gagal menyimpan cache lokal ke localStorage:', err);
  }
}

/**
 * Membaca preferensi sensor saldo (isMasked) dari localStorage.
 * @returns {boolean}
 */
function getInitialMaskedPreference() {
  try {
    const saved = localStorage.getItem(UI_PREF_KEY);
    return saved !== null ? JSON.parse(saved) : false;
  } catch {
    return false;
  }
}

/**
 * Membaca preferensi tema dari localStorage (default 'light').
 * @returns {'dark' | 'light'}
 */
function getInitialThemePreference() {
  try {
    const saved = localStorage.getItem(THEME_PREF_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const defaultMonth = new Date().toISOString().slice(0, 7);
const initialTheme = getInitialThemePreference();
const initialCache = getInitialLocalData();

/**
 * Menerapkan tema gelap / terang ke elemen document HTML
 * @param {'dark' | 'light'} theme
 */
export function applyTheme(theme) {
  if (typeof document !== 'undefined') {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}

// Terapkan tema awal langsung
applyTheme(initialTheme);

/**
 * Initial state awal aplikasi dengan dukungan Local-First cache.
 */
const initialDefaultState = {
  accounts: initialCache.accounts || [],
  categories: initialCache.categories || [],
  transactions: initialCache.transactions || [],
  selectedMonth: defaultMonth,
  selectedDate: null,
  isMasked: getInitialMaskedPreference(),
  theme: initialTheme,
  activeTab: 'home', // 'home' | 'wallets' | 'activity' | 'report'
  syncStatus: 'online', // 'online' | 'syncing' | 'error' | 'connecting'
  user: null,
  token: null,
};

// State lokal aktif
let currentState = { ...initialDefaultState };

// Kumpulan subscriber / listener
const subscribers = new Set();

// Variabel kontrol debounced cloud sync
let syncTimer = null;
let isSyncing = false;
let pendingSync = false;
let hasPulledFromCloud = false;

/**
 * Mengambil snapshot state aplikasi saat ini.
 * @returns {typeof initialDefaultState}
 */
export function getState() {
  return { ...currentState };
}

/**
 * Menjadwalkan background push sync ke Cloudflare Worker D1 dengan debouncing 1 detik (1000ms).
 * @param {number} [delayMs=1000]
 */
export function scheduleCloudSync(delayMs = 1000) {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    triggerImmediateSync();
  }, delayMs);
}

/**
 * Memicu sinkronisasi langsung (immediate sync) ke Cloudflare Worker D1.
 * Dapat dipanggil manual lewat klik tombol status di Navbar atau otomatis saat reconnect / initial load.
 */
export async function triggerImmediateSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  // Jika browser dalam mode offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState({ syncStatus: 'error' });
    return;
  }

  // Jika sedang sinkronisasi, jadwalkan satu kali lagi setelah selesai
  if (isSyncing) {
    pendingSync = true;
    return;
  }

  isSyncing = true;
  setState({ syncStatus: 'syncing' });

  try {
    // Jika belum pernah berhasil mengambil data cloud, coba pull data terlebih dahulu
    if (!hasPulledFromCloud) {
      const cloudData = await fetchCloudData();
      const hasWallets = Array.isArray(cloudData.wallets) && cloudData.wallets.length > 0;
      const hasTransactions = Array.isArray(cloudData.transactions) && cloudData.transactions.length > 0;
      const hasBudgets = Array.isArray(cloudData.budgets) && cloudData.budgets.length > 0;

      if (hasWallets || hasTransactions || hasBudgets) {
        const mappedAccounts = (cloudData.wallets || []).map((w) => ({
          id: w.id,
          name: w.name,
          balance: Number(w.balance) || 0,
          type: 'bank',
          provider: w.name,
          theme: w.color || 'default',
        }));

        const mappedTransactions = (cloudData.transactions || []).map((t) => ({
          id: t.id,
          wallet_id: t.wallet_id,
          amount: Number(t.amount) || 0,
          type: t.type,
          category: t.category,
          note: t.note || '',
          date: t.date,
        }));

        const mappedCategories = (cloudData.budgets || []).map((b) => ({
          id: b.id,
          name: b.category,
          budget: Number(b.allocated) || 0,
          spent: 0,
          icon: 'wallet',
        }));

        const updates = {};
        if (mappedAccounts.length > 0) updates.accounts = mappedAccounts;
        if (mappedTransactions.length > 0) updates.transactions = mappedTransactions;
        if (mappedCategories.length > 0) updates.categories = mappedCategories;

        currentState = {
          ...currentState,
          ...updates,
          syncStatus: 'online',
        };
        saveLocalCache(currentState);

        subscribers.forEach((listener) => {
          try {
            listener(currentState);
          } catch (e) {
            console.error(e);
          }
        });
      } else {
        // Jika database D1 cloud masih kosong, push data lokal awal ke D1
        if (currentState.accounts.length > 0 || currentState.transactions.length > 0) {
          await pushCloudData(currentState);
        }
      }
      hasPulledFromCloud = true;
      setState({ syncStatus: 'online' });
    } else {
      // Push perubahan data lokal ke Cloudflare D1
      await pushCloudData(currentState);
      setState({ syncStatus: 'online' });
    }
  } catch (err) {
    console.warn('[Sync] Gagal menyinkronkan data ke Cloudflare D1:', err);
    setState({ syncStatus: 'error' });
  } finally {
    isSyncing = false;
    if (pendingSync) {
      pendingSync = false;
      triggerImmediateSync();
    }
  }
}

/**
 * Menginisialisasi listener online/offline dan memicu sinkronisasi awal saat aplikasi dibuka.
 */
let isSyncInitialized = false;
export async function initCloudSync() {
  if (isSyncInitialized) return;
  isSyncInitialized = true;

  // Pasang event listener deteksi jaringan browser
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('[Sync] Koneksi internet online. Melakukan auto-sync...');
      triggerImmediateSync();
    });

    window.addEventListener('offline', () => {
      console.warn('[Sync] Koneksi offline. Mengubah status ke error...');
      setState({ syncStatus: 'error' });
    });
  }

  // Jalankan sinkronisasi awal
  triggerImmediateSync();
}

/**
 * Memperbarui state aplikasi dan memberi notifikasi ke semua subscriber.
 * @param {Partial<typeof initialDefaultState> | ((prevState: typeof initialDefaultState) => Partial<typeof initialDefaultState>)} updater
 */
export function setState(updater) {
  const previousState = currentState;
  const updates = typeof updater === 'function' ? updater(currentState) : updater;

  currentState = {
    ...currentState,
    ...updates,
  };

  // Simpan ke localStorage & jadwalkan background sync jika ada mutasi data akun, kategori, atau transaksi
  const hasDataMutation =
    updates &&
    (updates.accounts !== undefined ||
      updates.categories !== undefined ||
      updates.transactions !== undefined);

  if (hasDataMutation) {
    saveLocalCache(currentState);
    scheduleCloudSync(1000);
  }

  // Simpan preferensi UI jika isMasked diperbarui
  if (updates && updates.isMasked !== undefined) {
    try {
      localStorage.setItem(UI_PREF_KEY, JSON.stringify(currentState.isMasked));
    } catch (error) {
      console.warn('Gagal menyimpan preferensi isMasked ke localStorage:', error);
    }
  }

  // Simpan preferensi Tema jika tema diperbarui
  if (updates && updates.theme !== undefined) {
    try {
      localStorage.setItem(THEME_PREF_KEY, currentState.theme);
      applyTheme(currentState.theme);
    } catch (error) {
      console.warn('Gagal menyimpan preferensi tema ke localStorage:', error);
    }
  }

  // Notifikasi seluruh subscriber (pub-sub)
  subscribers.forEach((listener) => {
    try {
      listener(currentState, previousState);
    } catch (error) {
      console.error('Error pada subscriber listener store:', error);
    }
  });
}

/**
 * Mendaftarkan fungsi listener yang akan dipanggil setiap state berubah.
 * @param {(state: typeof initialDefaultState, prevState: typeof initialDefaultState) => void} listener
 * @returns {() => void} Fungsi untuk berhenti berlangganan (unsubscribe).
 */
export function subscribe(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('Subscriber harus berupa function');
  }

  subscribers.add(listener);

  // Return fungsi cleanup / unsubscribe
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Mengembalikan state ke kondisi awal (misal saat logout).
 */
export function resetState() {
  setState({
    accounts: [],
    categories: [],
    transactions: [],
    selectedMonth: new Date().toISOString().slice(0, 7),
    selectedDate: null,
    isMasked: getInitialMaskedPreference(),
    theme: getInitialThemePreference(),
    activeTab: 'home',
    syncStatus: 'online',
    user: null,
    token: null,
  });
}

/**
 * Menghapus akun/rekening berdasarkan ID dari state.
 * @param {string|number} accountId
 */
export function removeAccount(accountId) {
  if (accountId === undefined || accountId === null) return;
  const filteredAccounts = (currentState.accounts || []).filter(
    (account) => String(account.id) !== String(accountId)
  );
  setState({ accounts: filteredAccounts });
}

/**
 * Memperbarui nama dompet/rekening bank berdasarkan ID.
 * @param {string|number} walletId
 * @param {string} newName
 */
export function updateWalletName(walletId, newName) {
  if (!walletId || !newName || !newName.trim()) return;
  const trimmedName = newName.trim();
  const accounts = currentState.accounts || [];
  const updatedAccounts = accounts.map((acc) => {
    if (String(acc.id) === String(walletId)) {
      return { ...acc, name: trimmedName };
    }
    return acc;
  });

  setState({ accounts: updatedAccounts });
}

/**
 * Menambahkan rekening/dompet baru ke state secara manual tanpa gacha/random.
 * @param {{ name: string, balance?: number, type?: string, provider?: string, theme?: string }} account
 * @returns {Object|null}
 */
export function addAccount({ name, balance = 0, type = 'bank', provider = '', theme = 'default' }) {
  if (!name || !name.trim()) return null;
  const trimmedName = name.trim();
  const safeBalance = Math.max(0, Number(balance) || 0);

  // Deteksi provider dan tema warna otomatis jika tidak ditentukan
  let resolvedTheme = theme;
  let resolvedProvider = provider || trimmedName;
  const nameLower = trimmedName.toLowerCase();

  if (!theme || theme === 'default') {
    if (nameLower.includes('bca')) resolvedTheme = 'bca';
    else if (nameLower.includes('mandiri')) resolvedTheme = 'mandiri';
    else if (nameLower.includes('bni')) resolvedTheme = 'bni';
    else if (nameLower.includes('bri')) resolvedTheme = 'bri';
    else if (nameLower.includes('dana')) resolvedTheme = 'dana';
    else if (nameLower.includes('shopee')) resolvedTheme = 'shopeepay';
    else if (nameLower.includes('gopay')) resolvedTheme = 'gopay';
    else if (nameLower.includes('tunai') || nameLower.includes('cash')) resolvedTheme = 'cash';
    else resolvedTheme = 'default';
  }

  const newAcc = {
    id: `acc-${Date.now()}`,
    name: trimmedName,
    balance: safeBalance,
    type: type || 'bank',
    provider: resolvedProvider,
    theme: resolvedTheme,
  };

  setState({
    accounts: [...(currentState.accounts || []), newAcc],
  });

  return newAcc;
}

/**
 * Menambahkan pos kategori anggaran baru.
 * @param {{ name: string, budget: number, color?: string, icon?: string }} category
 */
export function addCategory({ name, budget, color = 'indigo', icon = 'wallet' }) {
  if (!name || Number(budget) <= 0) return;
  const newCat = {
    id: `cat-${Date.now()}`,
    name: name.trim(),
    budget: Number(budget),
    spent: 0,
    color,
    icon,
  };
  setState({
    categories: [...(currentState.categories || []), newCat],
  });
}

/**
 * Memperbarui target plafon anggaran pos kategori tertentu.
 * @param {string|number} categoryId
 * @param {number} newBudget
 */
export function updateCategoryBudget(categoryId, newBudget) {
  const budgetNum = Number(newBudget);
  if (budgetNum < 0) return;

  const updatedCategories = (currentState.categories || []).map((cat) => {
    if (String(cat.id) === String(categoryId) || cat.name === categoryId) {
      return { ...cat, budget: budgetNum };
    }
    return cat;
  });

  setState({ categories: updatedCategories });
}

/**
 * Menghapus pos kategori anggaran.
 * @param {string|number} categoryId
 */
export function removeCategory(categoryId) {
  const filtered = (currentState.categories || []).filter(
    (cat) => String(cat.id) !== String(categoryId) && cat.name !== categoryId
  );
  setState({ categories: filtered });
}

/**
 * Melakukan transfer antar rekening (debit asal, kredit tujuan, catat transaksi transfer).
 * @param {{ fromWalletId: string, toWalletId: string, amount: number, note?: string, date?: string }} param0
 */
export function transferBalance({ fromWalletId, toWalletId, amount, note = '', date = new Date().toISOString() }) {
  const transferAmount = Number(amount);
  if (transferAmount <= 0) {
    throw new Error('Nominal transfer harus lebih besar dari 0.');
  }
  if (String(fromWalletId) === String(toWalletId)) {
    throw new Error('Rekening sumber dan rekening tujuan tidak boleh sama.');
  }

  const accounts = currentState.accounts || [];
  const fromAcc = accounts.find((a) => String(a.id) === String(fromWalletId));
  const toAcc = accounts.find((a) => String(a.id) === String(toWalletId));

  if (!fromAcc || !toAcc) {
    throw new Error('Rekening tidak ditemukan.');
  }

  // Update saldo akun
  const updatedAccounts = accounts.map((acc) => {
    if (String(acc.id) === String(fromWalletId)) {
      return { ...acc, balance: (Number(acc.balance) || 0) - transferAmount };
    }
    if (String(acc.id) === String(toWalletId)) {
      return { ...acc, balance: (Number(acc.balance) || 0) + transferAmount };
    }
    return acc;
  });

  // Catat transaksi transfer
  const newTx = {
    id: `tx-tf-${Date.now()}`,
    note: note ? note.trim() : `Transfer dari ${fromAcc.name} ke ${toAcc.name}`,
    category: 'Transfer Saldo',
    accountName: `${fromAcc.name} ➔ ${toAcc.name}`,
    fromWalletId,
    toWalletId,
    amount: transferAmount,
    type: 'transfer',
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
  };

  setState({
    accounts: updatedAccounts,
    transactions: [newTx, ...(currentState.transactions || [])],
  });

  return newTx;
}

/**
 * Menghapus transaksi berdasarkan ID, menyesuaikan saldo rekening dan anggaran kategori terkait.
 * @param {string} transactionId
 * @returns {Object|null} Transaksi yang dihapus
 */
export function deleteTransaction(transactionId) {
  const state = getState();
  const txList = state.transactions || [];
  const targetTx = txList.find((t) => String(t.id) === String(transactionId));
  if (!targetTx) return null;

  const updatedTransactions = txList.filter((t) => String(t.id) !== String(transactionId));

  // Sesuaikan saldo rekening
  const accounts = state.accounts || [];
  const accountId = targetTx.accountId || targetTx.wallet_id || targetTx.wallet;
  const amount = Number(targetTx.amount) || 0;
  const isExpense = targetTx.type === 'expense';
  const isIncome = targetTx.type === 'income';

  const updatedAccounts = accounts.map((acc) => {
    if (String(acc.id) === String(accountId)) {
      const currentBal = Number(acc.balance) || 0;
      // Pengeluaran dihapus: kembalikan saldo (+)
      // Pemasukan dihapus: kurangi saldo (-)
      const newBal = isExpense ? currentBal + amount : (isIncome ? currentBal - amount : currentBal);
      return {
        ...acc,
        balance: newBal,
      };
    }
    return acc;
  });

  // Sesuaikan pemakaian anggaran kategori (spent) jika pos pengeluaran
  const categories = state.categories || [];
  const updatedCategories = categories.map((c) => {
    if (c.name === targetTx.category && isExpense) {
      return {
        ...c,
        spent: Math.max(0, (Number(c.spent) || 0) - amount),
      };
    }
    return c;
  });

  setState({
    transactions: updatedTransactions,
    accounts: updatedAccounts,
    categories: updatedCategories,
  });

  return targetTx;
}

/**
 * Toggle tema gelap / terang.
 */
export function toggleTheme() {
  const nextTheme = currentState.theme === 'dark' ? 'light' : 'dark';
  setState({ theme: nextTheme });
}

/**
 * Menetapkan tema aktif secara eksplisit ('dark' | 'light').
 * @param {'dark' | 'light'} theme
 */
export function setTheme(theme) {
  if (theme === 'dark' || theme === 'light') {
    setState({ theme });
  }
}

/**
 * Mengubah tab navigasi aktif ('home' | 'wallets' | 'activity' | 'report').
 * @param {'home' | 'wallets' | 'activity' | 'report'} tab
 */
export function setActiveTab(tab) {
  if (['home', 'wallets', 'activity', 'report'].includes(tab)) {
    setState({ activeTab: tab });
  }
}

/**
 * Mengubah status sinkronisasi cloud ('online' | 'connecting' | 'syncing' | 'error').
 * @param {'online' | 'connecting' | 'syncing' | 'error'} status
 */
export function setSyncStatus(status) {
  if (['online', 'connecting', 'syncing', 'error'].includes(status)) {
    setState({ syncStatus: status });
  }
}

/**
 * Mengubah periode bulan terpilih (format: YYYY-MM).
 * @param {string} monthStr
 */
export function setSelectedMonth(monthStr) {
  if (monthStr && typeof monthStr === 'string') {
    setState({ selectedMonth: monthStr });
  }
}

/**
 * Mengubah filter tanggal aktif untuk mutasi harian (format: YYYY-MM-DD atau null).
 * @param {string | null} dateStr
 */
export function setSelectedDate(dateStr) {
  setState({ selectedDate: dateStr || null });
}

export const store = {
  getState,
  setState,
  subscribe,
  resetState,
  addAccount,
  removeAccount,
  updateWalletName,
  addCategory,
  updateCategoryBudget,
  removeCategory,
  transferBalance,
  deleteTransaction,
  toggleTheme,
  setTheme,
  setActiveTab,
  setSyncStatus,
  setSelectedMonth,
  setSelectedDate,
  applyTheme,
  scheduleCloudSync,
  triggerImmediateSync,
  initCloudSync,
};

Object.defineProperty(store, 'state', {
  get() {
    const s = getState();
    return {
      ...s,
      wallets: s.accounts,
    };
  },
});

export default store;
