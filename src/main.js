// src/main.js
import './style.css';
import { store, getState, setState, subscribe, toggleTheme, setActiveTab, initCloudSync } from './state/store.js';
import { formatDateIndo, getRemainingDaysInMonth } from './utils/dates.js';
import { formatRupiah, maskValue } from './utils/formatters.js';
import { createNavbar } from './components/Navbar.js';
import { createWalletCards } from './components/WalletCards.js';
import { createBudgetProgress, createDailyBurnRate } from './components/BudgetProgress.js';
import { createTransactionList } from './components/TransactionList.js';
import { createCalendarView } from './components/CalendarView.js';
import { createReportView } from './components/ReportView.js';
import { createBottomNav } from './components/BottomNav.js';
import {
  openTransactionModal,
  openScanReceiptModal,
  openLoginModal,
  openTransferModal,
  openEditBudgetModal,
  openAddCategoryModal,
  openEditWalletNameModal,
  openAddAccountModal,
} from './components/Modals.js';
import { initIosInstallPrompt } from './components/IosPwaPromptModal.js';
import { initIdleManager } from './services/idleManager.js';
import { login, logout, isAuthenticated } from './services/auth.js';
import { renderIcons } from './utils/icons.js';

/**
 * Data mock awal di memori (tidak di-hardcode ke file store default)
 */
const mockAccounts = [
  {
    id: 'acc-bca',
    name: 'BCA Platinum Debit',
    provider: 'BCA',
    accountNumber: '8820394812',
    balance: 24750000,
    type: 'bank',
    theme: 'bca',
  },
  {
    id: 'acc-mandiri',
    name: 'Mandiri Payroll Tabungan',
    provider: 'Mandiri',
    accountNumber: '1370098234123',
    balance: 8350000,
    type: 'bank',
    theme: 'mandiri',
  },
  {
    id: 'acc-bni',
    name: 'BNI Taplus Bisnis',
    provider: 'BNI',
    accountNumber: '0234567891',
    balance: 15400000,
    type: 'bank',
    theme: 'bni',
  },
  {
    id: 'acc-dana',
    name: 'DANA Saldo Utama',
    provider: 'DANA',
    accountNumber: '081289234567',
    balance: 1450000,
    type: 'ewallet',
    theme: 'dana',
  },
  {
    id: 'acc-shopeepay',
    name: 'ShopeePay Plus',
    provider: 'ShopeePay',
    accountNumber: '081289234567',
    balance: 620000,
    type: 'ewallet',
    theme: 'shopeepay',
  },
  {
    id: 'acc-cash',
    name: 'Dompet Kas Tunai',
    provider: 'Cash',
    accountNumber: 'TUNAI-01',
    balance: 950000,
    type: 'cash',
    theme: 'cash',
  },
];

const mockCategories = [
  {
    id: 'cat-1',
    name: 'Makanan & Kuliner',
    budget: 4500000,
    spent: 3200000,
    icon: 'utensils',
  },
  {
    id: 'cat-2',
    name: 'Belanja Kebutuhan',
    budget: 3000000,
    spent: 3250000,
    icon: 'shopping-bag',
  },
  {
    id: 'cat-3',
    name: 'Transportasi & Bensin',
    budget: 1500000,
    spent: 1350000,
    icon: 'car',
  },
  {
    id: 'cat-4',
    name: 'Tagihan & Utilitas',
    budget: 2000000,
    spent: 1800000,
    icon: 'zap',
  },
  {
    id: 'cat-5',
    name: 'Hiburan & Rekreasi',
    budget: 1000000,
    spent: 450000,
    icon: 'film',
  },
  {
    id: 'cat-6',
    name: 'Kesehatan & Medis',
    budget: 1200000,
    spent: 350000,
    icon: 'heart-pulse',
  },
];

const mockTransactions = [
  {
    id: 'tx-1',
    note: 'Supermarket Belanja Bulanan',
    category: 'Belanja Kebutuhan',
    accountName: 'BCA Platinum Debit',
    amount: 850000,
    type: 'expense',
    date: '2026-10-13T14:30:00Z',
  },
  {
    id: 'tx-2',
    note: 'Gaji Payroll Bulanan',
    category: 'Gaji & Pendapatan',
    accountName: 'Mandiri Payroll Tabungan',
    amount: 25000000,
    type: 'income',
    date: '2026-10-12T09:00:00Z',
  },
  {
    id: 'tx-3',
    note: 'Makan Siang & Artisan Coffee',
    category: 'Makanan & Kuliner',
    accountName: 'ShopeePay Plus',
    amount: 185000,
    type: 'expense',
    date: '2026-10-12T12:45:00Z',
  },
  {
    id: 'tx-4',
    note: 'Isi Saldo E-Money & Tol JORR',
    category: 'Transportasi & Bensin',
    accountName: 'BCA Platinum Debit',
    amount: 200000,
    type: 'expense',
    date: '2026-10-11T16:20:00Z',
  },
  {
    id: 'tx-5',
    note: 'Tagihan Listrik PLN & Internet',
    category: 'Tagihan & Utilitas',
    accountName: 'BNI Taplus Bisnis',
    amount: 650000,
    type: 'expense',
    date: '2026-10-10T10:15:00Z',
  },
  {
    id: 'tx-6',
    note: 'Cashback Promo Pembayaran QRIS',
    category: 'Bonus & Cashback',
    accountName: 'DANA Saldo Utama',
    amount: 150000,
    type: 'income',
    date: '2026-10-09T18:00:00Z',
  },
  {
    id: 'tx-7',
    note: 'Tiket Bioskop Premiere Weekend',
    category: 'Hiburan & Rekreasi',
    accountName: 'DANA Saldo Utama',
    amount: 120000,
    type: 'expense',
    date: '2026-10-08T19:30:00Z',
  },
];

// Simulasi user awal jika belum login
if (!isAuthenticated()) {
  login('Budi Santoso', 'rahasia123').catch((err) => console.error(err));
}

// Inisialisasi mock data di memori jika store kosong
const currentStoreState = getState();
if (currentStoreState.accounts.length === 0) {
  setState({ accounts: mockAccounts });
}
if (currentStoreState.categories.length === 0) {
  setState({ categories: mockCategories });
}
if (currentStoreState.transactions.length === 0) {
  setState({ transactions: mockTransactions });
}

// Inisialisasi Sinkronisasi Cloudflare D1 (Local-First background sync)
initCloudSync();

/**
 * Fungsi untuk menampilkan overlay modal Layar Kunci Keamanan Fisik
 */
function showLockScreenOverlay(reason = 'Manual') {
  const modalRoot = document.querySelector('#modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div id="lock-overlay" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 transition-opacity animate-in fade-in duration-200">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 max-w-md w-full text-center space-y-6">
        <div class="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-100 dark:border-rose-800 shadow-sm">
          <i data-lucide="lock" class="w-8 h-8"></i>
        </div>
        
        <div>
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">Sesi Terkunci</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Layar dikunci secara otomatis demi perlindungan privasi finansial Anda (${reason}).
          </p>
        </div>

        <button
          id="btn-unlock-screen"
          type="button"
          class="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <i data-lucide="unlock" class="w-5 h-5"></i>
          <span>Buka Kunci Layar</span>
        </button>
      </div>
    </div>
  `;

  renderIcons(modalRoot);

  const unlockBtn = modalRoot.querySelector('#btn-unlock-screen');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', () => {
      modalRoot.innerHTML = '';
      if (idleManager) {
        idleManager.unlock();
      }
    });
  }
}

// Inisialisasi IdleManager (Keamanan fisik inaktivitas & deteksi tab minimize)
const idleManager = initIdleManager({
  timeoutMs: 5 * 60 * 1000, // 5 menit
  lockOnHidden: true,
  onLock: ({ reason }) => {
    showLockScreenOverlay(reason === 'visibility_hidden' ? 'Tab diminimalkan/berpindah layar' : 'Inaktivitas 5 menit');
  },
});

// Inisialisasi Komponen Navbar (Header Atas)
const navbarRoot = document.querySelector('#navbar-root');
if (navbarRoot) {
  createNavbar({
    container: navbarRoot,
    onLock: () => {
      idleManager.lock('Kunci Manual Pengguna');
      showLockScreenOverlay('Kunci manual pengguna');
    },
    onLoginClick: () => {
      openLoginModal();
    },
    onLogoutClick: () => {
      logout();
    },
  });
}

// Fungsi Render Konten Utama Dashboard berdasarkan activeTab ('home' | 'wallets' | 'activity' | 'report')
const dashboardRoot = document.querySelector('#dashboard-root');

/**
 * Merender ringkasan total saldo dan kartu mini KPI Pemasukan/Pengeluaran untuk Tab Beranda
 * @param {HTMLElement} container
 */
function renderHomeKpi(container) {
  if (!container) return;
  const state = getState();
  const accounts = state.accounts || [];
  const isMasked = Boolean(state.isMasked);
  const selectedMonth = state.selectedMonth || new Date().toISOString().slice(0, 7);
  const transactions = state.transactions || [];

  const totalBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  const monthTx = transactions.filter((t) => t.date && String(t.date).slice(0, 7) === selectedMonth);

  const totalIncome = monthTx
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const totalExpense = monthTx
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const maskedBalance = maskValue(formatRupiah(totalBalance), isMasked);
  const maskedIncome = maskValue(formatRupiah(totalIncome), isMasked);
  const maskedExpense = maskValue(formatRupiah(totalExpense), isMasked);

  container.innerHTML = `
    <section class="w-full p-5 sm:p-6 rounded-2xl bg-[#FFFFFF] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] text-[#09090B] dark:text-[#F4F4F5] space-y-4 sm:space-y-5 relative shadow-xs sm:shadow-sm">
      
      <!-- Baris Total Saldo & Tombol Aksi Cepat -->
      <div class="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span class="text-xs uppercase font-bold text-[#71717A] dark:text-[#A1A1AA] tracking-wider">Total Saldo Terkelola</span>
          <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight mt-0.5 text-[#09090B] dark:text-[#F4F4F5]">${maskedBalance}</h2>
        </div>
        <div class="flex items-center gap-2 self-start sm:self-auto">
          <button id="btnQuickAddKpi" type="button" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs active:scale-95">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>Catat Transaksi</span>
          </button>
          <button id="btnScanStruk" type="button" class="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F9F9F8] dark:bg-[#09090B] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#09090B] dark:text-[#F4F4F5] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95">
            <i data-lucide="camera" class="w-3.5 h-3.5"></i>
            <span>Scan AI</span>
          </button>
        </div>
      </div>

      <!-- Kartu Mini KPI: Pemasukan & Pengeluaran Bulan Ini (Soft Sage & Soft Dusty Rose) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#E4E4E7] dark:border-[#27272A] relative z-10">
        <div class="bg-[#F9F9F8] dark:bg-[#09090B] rounded-xl p-3 sm:p-3.5 border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between gap-3">
          <div>
            <span class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i> Pemasukan
            </span>
            <p class="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">+ ${maskedIncome}</p>
          </div>
          <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <i data-lucide="trending-up" class="w-4 h-4"></i>
          </div>
        </div>
        <div class="bg-[#F9F9F8] dark:bg-[#09090B] rounded-xl p-3 sm:p-3.5 border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between gap-3">
          <div>
            <span class="text-[11px] font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1 uppercase tracking-wider">
              <i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i> Pengeluaran
            </span>
            <p class="text-sm sm:text-base font-bold text-rose-700 dark:text-rose-400 mt-0.5 truncate">- ${maskedExpense}</p>
          </div>
          <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
            <i data-lucide="trending-down" class="w-4 h-4"></i>
          </div>
        </div>
      </div>
    </section>
  `;

  renderIcons(container);
  container.querySelector('#btnScanStruk')?.addEventListener('click', () => {
    openScanReceiptModal();
  });
  container.querySelector('#btnQuickAddKpi')?.addEventListener('click', () => {
    openTransactionModal();
  });
}

function renderMainContent() {
  if (!dashboardRoot) return;

  const state = getState();
  const activeTab = state.activeTab || 'home';

  // Bersihkan konten saat tab berubah
  dashboardRoot.innerHTML = '';

  if (activeTab === 'home') {
    // Tata Letak Grid Responsif Desktop: Seimbang Kiri (lg:col-span-7) & Kanan (lg:col-span-5)
    // Kolom Kiri: Ringkasan Saldo/KPI, Daily Burn Rate, dan Card Riwayat Transaksi Terbaru
    // Kolom Kanan: Card Kategori Anggaran / Pos Belanja
    dashboardRoot.innerHTML = `
      <div class="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto items-start">
        <!-- Kolom Kiri (lg:col-span-7): Ringkasan Keuangan & Riwayat Transaksi -->
        <div class="lg:col-span-7 space-y-6">
          <section id="home-kpi-root"></section>
          <section id="daily-burn-rate-root"></section>
          <section id="transaction-list-root"></section>
        </div>

        <!-- Kolom Kanan (lg:col-span-5): Pos Anggaran / Budgeting -->
        <div class="lg:col-span-5 space-y-6">
          <section id="budget-progress-root"></section>
        </div>
      </div>
    `;

    renderHomeKpi(dashboardRoot.querySelector('#home-kpi-root'));
    mountDailyBurnRate(dashboardRoot.querySelector('#daily-burn-rate-root'));
    mountTransactionList(dashboardRoot.querySelector('#transaction-list-root'), {
      limit: 6,
      showFilter: true,
      title: 'Transaksi Terbaru',
      onViewAll: () => {
        setActiveTab('activity');
      },
    });
    mountBudgetProgress(dashboardRoot.querySelector('#budget-progress-root'), {
      showBurnRate: false,
    });
  } else if (activeTab === 'wallets') {
    // Tab 2: Dompet -> Kartu mockup dompet/bank bersih tanpa nomor rekening, Transfer & Tambah Rekening
    dashboardRoot.innerHTML = `
      <section id="wallet-cards-root" class="max-w-7xl mx-auto w-full"></section>
    `;

    mountWalletCards(dashboardRoot.querySelector('#wallet-cards-root'));
  } else if (activeTab === 'activity') {
    // Tab 3: Aktivitas -> Full monthly grid calendar & Mutasi transaksi seimbang (lg:grid-cols-12)
    dashboardRoot.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start max-w-7xl mx-auto w-full">
        <section id="calendar-view-root" class="lg:col-span-5"></section>
        <section id="transaction-list-root" class="lg:col-span-7"></section>
      </div>
    `;

    mountCalendarView(dashboardRoot.querySelector('#calendar-view-root'));
    mountTransactionList(dashboardRoot.querySelector('#transaction-list-root'), {
      limit: null,
      showFilter: true,
      title: 'Riwayat Transaksi',
    });
  } else if (activeTab === 'report') {
    // Tab 4: Laporan -> ReportView dengan Donut chart Chart.js, Arus Kas Bersih (Net cashflow), dan rincian alokasi per kategori
    dashboardRoot.innerHTML = `
      <div class="space-y-6 max-w-7xl mx-auto w-full">
        <section id="calendar-view-root"></section>
        <section id="report-view-root"></section>
      </div>
    `;

    mountCalendarView(dashboardRoot.querySelector('#calendar-view-root'));
    mountReportView(dashboardRoot.querySelector('#report-view-root'));
  }
}

// Helpers untuk mounting komponen modular
function mountCalendarView(container) {
  if (!container) return;
  createCalendarView({
    container,
    onMonthChange: (newMonth) => {
      console.log('Periode bulan diubah ke:', newMonth);
    },
  });
}

function mountWalletCards(container) {
  if (!container) return;
  createWalletCards({
    container,
    onTransferClick: (account) => {
      openTransferModal(account);
    },
    onEditAccount: (account) => {
      openEditWalletNameModal(account);
    },
    onAddAccount: () => {
      openAddAccountModal();
    },
    onSelectAccount: (account) => {
      console.log('Rekening dipilih:', account);
    },
  });
}

function mountDailyBurnRate(container) {
  if (!container) return;
  createDailyBurnRate({
    container,
  });
}

function mountBudgetProgress(container, options = {}) {
  if (!container) return;
  createBudgetProgress({
    container,
    showBurnRate: options.showBurnRate !== undefined ? options.showBurnRate : false,
    onAddCategoryClick: () => {
      openAddCategoryModal();
    },
    onEditCategoryClick: (cat) => {
      openEditBudgetModal(cat);
    },
  });
}

function mountTransactionList(container, options = {}) {
  if (!container) return;
  createTransactionList({
    container,
    limit: options.limit !== undefined ? options.limit : null,
    showFilter: options.showFilter !== undefined ? options.showFilter : true,
    title: options.title || 'Riwayat Transaksi',
    onViewAll: options.onViewAll || (() => {}),
    onAddTransaction: () => {
      openTransactionModal();
    },
  });
}

function mountReportView(container) {
  if (!container) return;
  createReportView({
    container,
  });
}

// Inisialisasi awal render tab
renderMainContent();

// Langganan perubahan activeTab atau state perubahan data untuk Beranda KPI
let prevActiveTab = getState().activeTab;
subscribe((state) => {
  const currentTab = state.activeTab;
  if (currentTab !== prevActiveTab) {
    prevActiveTab = currentTab;
    renderMainContent();
  } else if (currentTab === 'home') {
    // Re-render banner KPI jika state berubah saat di tab beranda
    const kpiRoot = dashboardRoot?.querySelector('#home-kpi-root');
    if (kpiRoot) {
      renderHomeKpi(kpiRoot);
    }
  }
});

// Tombol Scan AI melayang khusus mobile (hanya tampil di HP pada pojok kanan bawah)
const fabRoot = document.querySelector('#fab-root');
if (fabRoot) {
  fabRoot.innerHTML = `
    <button
      id="btn-scan-struk-mobile"
      type="button"
      title="Pindai Struk dengan AI"
      class="fixed bottom-24 right-4 z-40 md:hidden flex items-center gap-2 bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] border border-[#E4E4E7] dark:border-[#27272A] px-4 py-2.5 rounded-full shadow-md cursor-pointer transition active:scale-95"
    >
      <i data-lucide="camera" class="w-4 h-4"></i>
      <span>Scan AI</span>
    </button>
  `;

  renderIcons(fabRoot);

  fabRoot.querySelector('#btn-scan-struk-mobile')?.addEventListener('click', () => {
    openScanReceiptModal();
  });
}

// Inisialisasi Bottom Navigation Bar
const bottomNavRoot = document.querySelector('#bottom-nav-root');
if (bottomNavRoot) {
  createBottomNav({
    container: bottomNavRoot,
    onQuickAdd: () => {
      openTransactionModal();
    },
  });
}

// Inisialisasi Deteksi & Panduan Install PWA khusus Safari di iOS
initIosInstallPrompt({ delay: 1500 });