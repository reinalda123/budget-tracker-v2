// src/state/store.js
import { fetchCloudData, pushCloudData } from '../services/api.js';

const UI_PREF_KEY = 'budget_tracker_is_masked';
const THEME_PREF_KEY = 'theme';

// Bersihkan seluruh cache data finansial lama dari localStorage (Murni Full Cloud D1)
if (typeof localStorage !== 'undefined') {
  try {
    localStorage.removeItem('budget_tracker_local_cache');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('budget_tracker_local_cache') || key.startsWith('budget_tracker_cache'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}
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
 * Initial state awal aplikasi murni in-memory (Full Cloud D1 Single Source of Truth).
 * Seluruh data finansial (accounts, categories, transactions) hidup di memori sementara.
 */
const initialDefaultState = {
  accounts: [],
  categories: [],
  transactions: [],
  selectedMonth: defaultMonth,
  selectedDate: null,
  isMasked: getInitialMaskedPreference(),
  theme: initialTheme,
  activeTab: 'home', // 'home' | 'wallets' | 'activity' | 'report'
  syncStatus: 'connecting', // 'online' | 'syncing' | 'error' | 'connecting'
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
 * Menjadwalkan background push sync ke Cloudflare Worker D1 saat terjadi mutasi data lokal.
 * @param {number} [delayMs=300]
 */
export function scheduleCloudSync(delayMs = 300) {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(async () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('budget_tracker_jwt_token') : null;
    if (!token) return;

    try {
      await pushCloudData(currentState);
      setState({ syncStatus: 'online' });
    } catch (err) {
      console.warn('[Sync] Gagal push perubahan ke Cloudflare D1:', err);
      setState({ syncStatus: 'error' });
    }
  }, delayMs);
}

/**
 * Mengatur ulang flag sinkronisasi cloud agar sesi baru mengambil ulang data segar dari D1.
 */
export function resetCloudSyncFlag() {
  hasPulledFromCloud = false;
}

/**
 * Mengambil data terbaru dari Cloudflare D1 (Single Source of Truth).
 * Selalu melakukan TIMPA TOTAL (STATE OVERWRITE) state in-memory dengan data terbaru dari D1.
 * JANGAN melakukan merge dengan data lama agar item yang dihapus di device lain langsung hilang (Cegah Zombie Data).
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

  // Cek apakah ada token aktif sebelum mencoba sinkronisasi
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('budget_tracker_jwt_token') : null;
  if (!token) {
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
    const cloudData = await fetchCloudData();

    const mappedAccounts = (cloudData.wallets || []).map((w) => ({
      id: String(w.id),
      name: w.name,
      balance: Number(w.balance) || 0,
      type: 'bank',
      provider: w.name,
      theme: w.color || 'default',
    }));

    const mappedTransactions = (cloudData.transactions || []).map((t) => ({
      id: String(t.id),
      wallet_id: String(t.wallet_id),
      accountId: String(t.wallet_id),
      amount: Number(t.amount) || 0,
      type: t.type,
      category: t.category,
      note: t.note || '',
      date: t.date,
    }));

    const mappedCategories = (cloudData.budgets || []).map((b) => ({
      id: String(b.id),
      name: b.category,
      budget: Number(b.allocated) || 0,
      spent: 0,
      icon: 'wallet',
    }));

    // TIMPA TOTAL (STATE OVERWRITE) - CEGAH ZOMBIE DATA
    // Seluruh data transaksi, kartu, dan pos anggaran WAJIB hidup di memori sementara
    // yang datanya selalu diambil langsung dari endpoint Cloudflare Worker.
    currentState = {
      ...currentState,
      accounts: mappedAccounts,
      transactions: mappedTransactions,
      categories: mappedCategories,
      syncStatus: 'online',
    };

    hasPulledFromCloud = true;

    // Beritahu seluruh komponen/subscriber tampilan secara reaktif
    subscribers.forEach((listener) => {
      try {
        listener(currentState);
      } catch (e) {
        console.error(e);
      }
    });
  } catch (err) {
    console.warn('[Sync] Gagal memuat data dari Cloudflare D1:', err);
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
 * Menginisialisasi listener online/offline, auto-fetch on window focus, dan auto-fetch on visibilitychange.
 */
let isSyncInitialized = false;
export async function initCloudSync() {
  if (isSyncInitialized) return;
  isSyncInitialized = true;

  if (typeof window !== 'undefined') {
    // 1. Deteksi koneksi internet kembali online
    window.addEventListener('online', () => {
      console.log('[Sync] Koneksi internet online. Mengambil data segar dari Cloudflare D1...');
      triggerImmediateSync();
    });

    window.addEventListener('offline', () => {
      console.warn('[Sync] Koneksi offline. Menandai status error...');
      setState({ syncStatus: 'error' });
    });

    // 2. Auto-fetch saat window/tab kembali aktif / mendapatkan fokus (Window Focus)
    window.addEventListener('focus', () => {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('budget_tracker_jwt_token') : null;
      if (token) {
        console.log('[Sync] Window/tab aktif kembali (focus). Auto-fetch dari Cloudflare D1...');
        triggerImmediateSync();
      }
    });

    // 3. Auto-fetch saat visibilitas halaman berubah menjadi 'visible' (Tab beralih atau aplikasi HP dibuka kembali)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('budget_tracker_jwt_token') : null;
        if (token) {
          console.log('[Sync] Layar aktif kembali (visibilityState=visible). Auto-fetch dari Cloudflare D1...');
          triggerImmediateSync();
        }
      }
    });
  }

  // Jalankan fetch awal hanya jika ada token
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('budget_tracker_jwt_token') : null;
  if (token) {
    triggerImmediateSync();
  }
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

  // Deteksi perubahan user / token sesi
  const userChanged =
    updates &&
    (updates.user !== undefined || updates.token !== undefined) &&
    (updates.user?.id !== previousState.user?.id || updates.token !== previousState.token);

  if (userChanged) {
    hasPulledFromCloud = false;
    // Bersihkan seluruh data finansial in-memory saat logout atau login akun baru
    currentState.accounts = [];
    currentState.transactions = [];
    currentState.categories = [];

    if (updates.token) {
      triggerImmediateSync();
    }
  }

  // Jadwalkan cloud push jika ada mutasi data akun, kategori, atau transaksi (Tidak menyimpan ke localStorage)
  const hasDataMutation =
    updates &&
    (updates.accounts !== undefined ||
      updates.categories !== undefined ||
      updates.transactions !== undefined);

  if (hasDataMutation) {
    scheduleCloudSync(300);
  }

  // Simpan preferensi UI jika isMasked diperbarui (localStorage hanya untuk preferensi UI)
  if (updates && updates.isMasked !== undefined) {
    try {
      localStorage.setItem(UI_PREF_KEY, JSON.stringify(currentState.isMasked));
    } catch (error) {
      console.warn('Gagal menyimpan preferensi isMasked ke localStorage:', error);
    }
  }

  // Simpan preferensi Tema jika tema diperbarui (localStorage hanya untuk preferensi UI)
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
 * Mengembalikan state sesi ke kondisi awal (misal saat logout).
 * HANYA mereset status sesi dan UI tanpa menghapus cache transaksi/akun lokal.
 */
export function resetState() {
  setState({
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
  resetCloudSyncFlag,
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
