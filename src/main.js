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



// Wadah elemen DOM utama
const navbarRoot = document.querySelector('#navbar-root');
const dashboardRoot = document.querySelector('#dashboard-root');
const bottomNavRoot = document.querySelector('#bottom-nav-root');
const fabRoot = document.querySelector('#fab-root');
const modalRoot = document.querySelector('#modal-root');

let idleManagerInstance = null;
let navbarInstance = null;
let bottomNavInstance = null;
let storeUnsubscribe = null;

/**
 * Overlay Layar Kunci Monokromatik Sleek (Bebas AI Slop)
 */
function showLockScreenOverlay(reason = 'Manual') {
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div id="lock-overlay" class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-opacity animate-in fade-in duration-200">
      <div class="bg-[#121214] rounded-2xl shadow-2xl border border-[#27272A] p-7 max-w-sm w-full text-center space-y-5 animate-in zoom-in-95 duration-150">
        <div class="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700/60 text-white flex items-center justify-center mx-auto shadow-2xs">
          <i data-lucide="lock" class="w-6 h-6"></i>
        </div>
        
        <div>
          <h3 class="text-lg font-bold text-white tracking-tight">Sesi Terkunci</h3>
          <p class="text-xs text-zinc-400 mt-1">
            Layar dikunci secara otomatis demi privasi finansial Anda (${reason}).
          </p>
        </div>

        <button
          id="btn-unlock-screen"
          type="button"
          class="w-full py-2.5 px-4 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 active:opacity-85 transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <i data-lucide="unlock" class="w-4 h-4"></i>
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
      if (idleManagerInstance) {
        idleManagerInstance.unlock();
      }
    });
  }
}

/**
 * Merender ringkasan total saldo dan kartu mini KPI Pemasukan/Pengeluaran untuk Tab Beranda
 * Disertai tombol cepat "Scan AI" bergaya glassmorphism yang tampil di semua ukuran layar.
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
    <div class="relative overflow-hidden rounded-2xl bg-[#FFFFFF] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] p-5 sm:p-6 shadow-sm">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        
        <!-- Sisi Kiri: Saldo Bersih & Tombol Aksi Cepat Scan AI -->
        <div class="space-y-3">
          <div class="flex items-center justify-between sm:justify-start gap-3">
            <span class="text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider block">
              Total Saldo Bersih
            </span>

            <!-- Tombol Aksi Cepat Scan AI Bergaya Glassmorphism (Tersedia di SEMUA Ukuran Layar: Mobile & PC) -->
            <button
              id="btn-kpi-scan-ai"
              type="button"
              title="Pindai Struk Belanja dengan AI"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/5 dark:bg-white/10 hover:bg-zinc-900/10 dark:hover:bg-white/15 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-900/10 dark:border-white/15 backdrop-blur-md text-xs font-semibold cursor-pointer transition-colors shadow-2xs active:opacity-80"
            >
              <i data-lucide="camera" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400"></i>
              <span>Scan AI</span>
            </button>
          </div>

          <h2 class="text-3xl sm:text-4xl font-extrabold text-[#09090B] dark:text-[#F4F4F5] tracking-tight">
            <span class="privacy-mask">${maskedBalance}</span>
          </h2>

          <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>Tersinkronisasi otomatis dengan Cloudflare D1</span>
          </p>
        </div>

        <!-- Sisi Kanan: Mini KPI Pemasukan & Pengeluaran -->
        <div class="grid grid-cols-2 gap-3 w-full sm:w-auto">
          <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
            <span class="text-[11px] font-semibold block text-emerald-700 dark:text-emerald-400">Pemasukan Bulan Ini</span>
            <span class="text-base sm:text-lg font-bold privacy-mask">+ ${maskedIncome}</span>
          </div>

          <div class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300">
            <span class="text-[11px] font-semibold block text-rose-700 dark:text-rose-400">Pengeluaran Bulan Ini</span>
            <span class="text-base sm:text-lg font-bold privacy-mask">- ${maskedExpense}</span>
          </div>
        </div>

      </div>
    </div>
  `;

  renderIcons(container);

  // Pasang event listener untuk tombol aksi cepat Scan AI
  container.querySelector('#btn-kpi-scan-ai')?.addEventListener('click', () => {
    openScanReceiptModal();
  });
}

const TAB_ORDER = ['home', 'wallets', 'activity', 'report'];
let isTabTransitioning = false;
let pendingTabTransition = null;

function createHomeTabElement() {
  const el = document.createElement('div');
  el.className = 'space-y-6 w-full';
  el.innerHTML = `
    <section id="home-kpi-root"></section>
    
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <!-- Kolom Kiri: Daily Burn Rate + Recent Transactions membentang penuh setinggi kolom kanan -->
      <div class="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
        <section id="daily-burn-root"></section>
        <section id="recent-transactions-root" class="flex-1 flex flex-col min-h-[420px]"></section>
      </div>

      <!-- Kolom Kanan: Kategori Anggaran membentang penuh setara tinggi kolom kiri -->
      <div class="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
        <section id="budget-progress-root" class="flex-1 flex flex-col"></section>
      </div>
    </div>
  `;

  renderHomeKpi(el.querySelector('#home-kpi-root'));
  mountDailyBurnRate(el.querySelector('#daily-burn-root'));
  mountBudgetProgress(el.querySelector('#budget-progress-root'));
  mountTransactionList(el.querySelector('#recent-transactions-root'), {
    limit: 5,
    showFilter: false,
    title: 'Transaksi Terbaru',
    onViewAll: () => {
      setActiveTab('activity');
    },
  });

  return el;
}

function createWalletsTabElement() {
  const el = document.createElement('div');
  el.className = 'space-y-6 w-full';
  el.innerHTML = `<section id="wallets-view-root" class="space-y-6"></section>`;
  mountWalletCards(el.querySelector('#wallets-view-root'));
  return el;
}

function createActivityTabElement() {
  const el = document.createElement('div');
  el.className = 'space-y-6 w-full';
  el.innerHTML = `
    <section id="calendar-view-root"></section>
    <section id="full-transactions-root" class="min-h-[420px]"></section>
  `;
  mountCalendarView(el.querySelector('#calendar-view-root'));
  mountTransactionList(el.querySelector('#full-transactions-root'), {
    limit: null,
    showFilter: true,
    title: 'Semua Riwayat Transaksi',
  });
  return el;
}

function createReportTabElement() {
  const el = document.createElement('div');
  el.className = 'space-y-6 w-full';
  el.innerHTML = `<section id="report-view-root" class="space-y-6"></section>`;
  mountReportView(el.querySelector('#report-view-root'));
  return el;
}

function createTabElement(tab) {
  switch (tab) {
    case 'home':
      return createHomeTabElement();
    case 'wallets':
      return createWalletsTabElement();
    case 'activity':
      return createActivityTabElement();
    case 'report':
      return createReportTabElement();
    default:
      return createHomeTabElement();
  }
}

/**
 * Transisi geser horizontal mulus (smooth horizontal slide) antar menu tanpa flicker / layar kosong.
 * @param {string} fromTab
 * @param {string} toTab
 */
function transitionToTab(fromTab, toTab) {
  if (!dashboardRoot) return;
  const viewport = dashboardRoot.querySelector('#tab-slider-viewport');
  const currentPanel = viewport?.querySelector('#active-tab-panel');

  if (!viewport || !currentPanel) {
    renderMainContent();
    return;
  }

  if (isTabTransitioning) {
    pendingTabTransition = { fromTab, toTab };
    return;
  }

  isTabTransitioning = true;
  const fromIdx = TAB_ORDER.indexOf(fromTab);
  const toIdx = TAB_ORDER.indexOf(toTab);
  const isForward = toIdx >= fromIdx;

  const nextPanel = document.createElement('div');
  nextPanel.id = 'active-tab-panel';
  nextPanel.className = 'w-full';
  nextPanel.appendChild(createTabElement(toTab));

  const track = document.createElement('div');
  track.className = 'flex w-[200%]';
  track.style.willChange = 'transform';

  currentPanel.style.width = '50%';
  currentPanel.style.flexShrink = '0';
  nextPanel.style.width = '50%';
  nextPanel.style.flexShrink = '0';

  if (isForward) {
    track.appendChild(currentPanel);
    track.appendChild(nextPanel);
    track.style.transform = 'translate3d(0%, 0, 0)';
  } else {
    track.appendChild(nextPanel);
    track.appendChild(currentPanel);
    track.style.transform = 'translate3d(-50%, 0, 0)';
  }

  viewport.innerHTML = '';
  viewport.appendChild(track);

  // Force reflow
  void track.offsetHeight;

  const animation = track.animate(
    isForward
      ? [{ transform: 'translate3d(0%, 0, 0)' }, { transform: 'translate3d(-50%, 0, 0)' }]
      : [{ transform: 'translate3d(-50%, 0, 0)' }, { transform: 'translate3d(0%, 0, 0)' }],
    {
      duration: 220,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      fill: 'forwards',
    }
  );

  animation.onfinish = () => {
    nextPanel.style.width = '100%';
    nextPanel.style.flexShrink = '';
    viewport.innerHTML = '';
    viewport.appendChild(nextPanel);
    renderIcons(nextPanel);
    isTabTransitioning = false;

    if (pendingTabTransition) {
      const pending = pendingTabTransition;
      pendingTabTransition = null;
      transitionToTab(pending.fromTab, pending.toTab);
    }
  };
}

/**
 * Merender konten utama dashboard awal dengan kontainer slider viewport horizontal
 */
function renderMainContent() {
  if (!dashboardRoot) return;
  const currentTab = getState().activeTab || 'home';

  dashboardRoot.innerHTML = `
    <div id="tab-slider-viewport" class="relative w-full overflow-hidden">
      <div id="active-tab-panel" class="w-full"></div>
    </div>
  `;

  const panel = dashboardRoot.querySelector('#active-tab-panel');
  if (panel) {
    panel.appendChild(createTabElement(currentTab));
  }
  renderIcons(dashboardRoot);
}

function mountWalletCards(container) {
  if (!container) return;
  createWalletCards({
    container,
    onTransferClick: () => openTransferModal(),
    onAddAccountClick: () => openAddAccountModal(),
    onEditWalletClick: (account) => openEditWalletNameModal(account),
  });
}

function mountCalendarView(container) {
  if (!container) return;
  createCalendarView({
    container,
    onSelectDay: (dateStr) => {
      openTransactionModal({ initialData: { date: dateStr } });
    },
  });
}

function mountDailyBurnRate(container) {
  if (!container) return;
  createDailyBurnRate({ container });
}

function mountBudgetProgress(container) {
  if (!container) return;
  createBudgetProgress({
    container,
    onAddCategoryClick: () => openAddCategoryModal(),
    onEditCategoryClick: (cat) => openEditBudgetModal(cat),
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
    onAddTransaction: () => openTransactionModal(),
  });
}

function mountReportView(container) {
  if (!container) return;
  createReportView({ container });
}

// =============================================================================
// GERBANG MASUK UTAMA (AUTH GUARD & SINGLE-USER PRIVATE LOGIN SCREEN)
// =============================================================================

/**
 * Menampilkan Layar Login Utama jika pengguna belum login.
 * Seluruh komponen dashboard, navbar, FAB, dan navigasi bawah dinonaktifkan total.
 */
function renderPrivateLoginGate() {
  // Sembunyikan dan bersihkan total komponen header navbar, navigasi bawah, FAB, dan modal
  if (navbarRoot) {
    navbarRoot.innerHTML = '';
    navbarRoot.classList.add('hidden');
  }
  if (bottomNavRoot) {
    bottomNavRoot.innerHTML = '';
    bottomNavRoot.classList.add('hidden');
  }
  if (fabRoot) {
    fabRoot.innerHTML = '';
    fabRoot.classList.add('hidden');
  }
  if (modalRoot) modalRoot.innerHTML = '';

  if (idleManagerInstance) {
    idleManagerInstance.stop();
  }

  if (storeUnsubscribe) {
    storeUnsubscribe();
    storeUnsubscribe = null;
  }

  if (!dashboardRoot) return;

  // Render Layar Login Monokromatik Sleek Dark Mode (Satu layar penuh terisolasi)
  dashboardRoot.innerHTML = `
    <div class="min-h-[85vh] flex items-center justify-center p-4">
      <div class="w-full max-w-sm mx-auto p-6 sm:p-8 rounded-2xl bg-[#121214] border border-[#27272A] shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200 text-left">
        
        <!-- Header Brand Minimalis Monokrom -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/60 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
            <i data-lucide="lock" class="w-5 h-5"></i>
          </div>
          <div>
            <h1 class="text-lg font-bold text-white tracking-tight">Budget Tracker</h1>
            <p class="text-xs text-zinc-400">Single-User Private Access</p>
          </div>
        </div>

        <!-- Pesan Error Dinamis -->
        <div id="login-gate-error" class="hidden p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs font-medium leading-relaxed"></div>

        <!-- Form Login Privat (HANYA Email & Password) -->
        <form id="form-private-login" class="space-y-4">
          <div>
            <label class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Alamat Email</label>
            <input
              id="gate_email"
              type="email"
              required
              autocomplete="email"
              placeholder="nama@email.com"
              class="w-full px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-white text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600 transition placeholder-zinc-600"
            >
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Kata Sandi</label>
            <input
              id="gate_password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-white text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600 transition placeholder-zinc-600"
            >
          </div>

          <button
            type="submit"
            id="btn-gate-submit"
            class="w-full py-2.5 mt-2 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 active:opacity-85 transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
          >
            <i data-lucide="log-in" class="w-4 h-4"></i>
            <span>Masuk</span>
          </button>
        </form>

        <!-- Footer Keamanan Monokrom -->
        <div class="pt-4 border-t border-zinc-800/80 flex items-center justify-center gap-2 text-[11px] text-zinc-400">
          <i data-lucide="shield-check" class="w-3.5 h-3.5 text-zinc-300"></i>
          <span>Sesi Privat Terenkripsi Cloudflare D1</span>
        </div>

      </div>
    </div>
  `;

  renderIcons(dashboardRoot);

  const form = dashboardRoot.querySelector('#form-private-login');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = dashboardRoot.querySelector('#gate_email');
    const passwordInput = dashboardRoot.querySelector('#gate_password');
    const errorAlert = dashboardRoot.querySelector('#login-gate-error');
    const submitBtn = dashboardRoot.querySelector('#btn-gate-submit');

    const email = emailInput?.value || '';
    const password = passwordInput?.value || '';

    errorAlert.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-75');

    try {
      await login(email, password);
      // Login sukses! Muat dashboard aplikasi penuh
      initApp();
    } catch (err) {
      errorAlert.textContent = err.message || 'Login gagal. Periksa kembali email dan kata sandi Anda.';
      errorAlert.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-75');
    }
  });
}

/**
 * Memuat aplikasi penuh setelah terautentikasi (Dashboard, Header, Navigasi, Sync, Idle Manager)
 */
function mountAuthenticatedDashboard() {
  // Pastikan komponen header navbar dan navigasi bawah ditampilkan
  if (navbarRoot) navbarRoot.classList.remove('hidden');
  if (bottomNavRoot) bottomNavRoot.classList.remove('hidden');
  if (fabRoot) {
    fabRoot.innerHTML = '';
    fabRoot.classList.add('hidden');
  }

  // 1. Inisialisasi Header Navbar Atas
  if (navbarRoot) {
    navbarInstance = createNavbar({
      container: navbarRoot,
      onLock: () => {
        if (idleManagerInstance) {
          idleManagerInstance.lock('Kunci Manual Pengguna');
        }
        showLockScreenOverlay('Kunci manual pengguna');
      },
      onLoginClick: () => {
        openLoginModal();
      },
      onLogoutClick: () => {
        logout();
        initApp(); // Kembali ke Gerbang Login Privat
      },
    });
  }

  // 2. Render Konten Utama Dashboard
  renderMainContent();

  // 3. Langganan perubahan activeTab dengan transisi horizontal slide mulus
  let prevActiveTab = getState().activeTab || 'home';
  storeUnsubscribe = subscribe((state) => {
    const currentTab = state.activeTab || 'home';
    if (currentTab !== prevActiveTab) {
      const fromTab = prevActiveTab;
      prevActiveTab = currentTab;
      transitionToTab(fromTab, currentTab);
    } else if (currentTab === 'home') {
      const kpiRoot = dashboardRoot?.querySelector('#home-kpi-root');
      if (kpiRoot) {
        renderHomeKpi(kpiRoot);
      }
    }
  });

  // 4. Inisialisasi Bottom Navigation Bar (Bebas dari FAB melayang yang menumpuk)
  if (bottomNavRoot) {
    bottomNavInstance = createBottomNav({
      container: bottomNavRoot,
      onQuickAdd: () => {
        openTransactionModal();
      },
    });
  }

  // 5. Inisialisasi IdleManager (Keamanan fisik inaktivitas & deteksi tab minimize)
  idleManagerInstance = initIdleManager({
    timeoutMs: 5 * 60 * 1000, // 5 menit
    lockOnHidden: true,
    onLock: ({ reason }) => {
      showLockScreenOverlay(reason === 'visibility_hidden' ? 'Tab diminimalkan/berpindah layar' : 'Inaktivitas 5 menit');
    },
  });

  // 6. Inisialisasi Sinkronisasi Cloudflare D1 (Local-First background sync)
  initCloudSync();

  // 7. Inisialisasi Deteksi & Panduan Install PWA khusus Safari di iOS
  initIosInstallPrompt({ delay: 1500 });
}

/**
 * Titik Masuk Utama Aplikasi: Menjalankan Pemeriksaan Autentikasi KETAT (Early Return)
 */
function initApp() {
  if (!isAuthenticated()) {
    renderPrivateLoginGate();
    return;
  }
  mountAuthenticatedDashboard();
}

// Tangani sesi kadaluwarsa dari API worker secara otomatis
if (typeof window !== 'undefined') {
  window.addEventListener('auth:expired', () => {
    initApp();
  });
}

// Jalankan aplikasi
initApp();