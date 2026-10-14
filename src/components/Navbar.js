// src/components/Navbar.js
import { store, getState, setState, subscribe, toggleTheme, triggerImmediateSync } from '../state/store.js';
import { renderIcons } from '../utils/icons.js';

/**
 * Komponen Navbar responsif dengan indikator sinkronisasi cloud, toggle tema gelap/terang,
 * sensor mata privasi, tombol kunci manual, dan status pengguna.
 */
export class Navbar {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM tempat Navbar dirender.
   * @param {() => void} [options.onLock] - Callback saat tombol gembok ditekan.
   * @param {() => void} [options.onLoginClick] - Callback saat tombol login ditekan.
   * @param {() => void} [options.onLogoutClick] - Callback saat tombol logout ditekan.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[Navbar] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.onLock = options.onLock || (() => {});
    this.onLoginClick = options.onLoginClick || (() => {});
    this.onLogoutClick = options.onLogoutClick || (() => {});

    // Langganan perubahan state agar Navbar reaktif
    this.unsubscribe = subscribe(() => this.render());

    this.render();
  }

  /**
   * Menangani toggle sensor saldo mata (isMasked).
   */
  handleToggleMask() {
    const currentState = getState();
    setState({
      isMasked: !currentState.isMasked,
    });
  }

  /**
   * Menghubungkan interaksi tombol dengan event listener.
   */
  attachEvents() {
    // Tombol sinkronisasi manual Cloudflare D1
    this.container.querySelector('#btn-sync-cloud-status')?.addEventListener('click', () => {
      triggerImmediateSync();
    });

    // Tombol toggle tema Siang / Malam
    this.container.querySelector('#btn-toggle-theme')?.addEventListener('click', () => {
      toggleTheme();
    });

    // Tombol toggle sensor mata
    this.container.querySelector('#btn-toggle-mask')?.addEventListener('click', () => {
      this.handleToggleMask();
    });

    // Tombol kunci layar manual
    this.container.querySelector('#btn-lock-session')?.addEventListener('click', () => {
      this.onLock();
    });

    // Tombol login
    this.container.querySelector('#btn-navbar-login')?.addEventListener('click', () => {
      this.onLoginClick();
    });

    // Tombol logout
    this.container.querySelector('#btn-navbar-logout')?.addEventListener('click', () => {
      this.onLogoutClick();
    });
  }

  /**
   * Merender antarmuka Navbar ke dalam container.
   */
  render() {
    const state = getState();
    const isMasked = Boolean(state.isMasked);
    const isDark = state.theme === 'dark';
    const syncStatus = state.syncStatus || 'online';
    const user = state.user;
    const isAuthenticated = Boolean(state.token && state.user);

    // Indikator status sinkronisasi interaktif (Menyinkronkan... / Tersinkron / Gagal Sinkron)
    let syncBadgeMarkup = '';
    if (syncStatus === 'syncing' || syncStatus === 'connecting') {
      syncBadgeMarkup = `
        <button
          id="btn-sync-cloud-status"
          type="button"
          title="Sedang menyinkronkan data dengan Cloudflare D1... (Klik untuk sinkronkan lagi)"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#F9F9F8] dark:bg-[#121214] text-[11px] font-semibold text-[#09090B] dark:text-[#F4F4F5] border border-[#E4E4E7] dark:border-[#27272A] cursor-pointer transition select-none hover:bg-[#E4E4E7] dark:hover:bg-[#27272A]"
        >
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i>
          <span>Menyinkronkan...</span>
        </button>
      `;
    } else if (syncStatus === 'online') {
      syncBadgeMarkup = `
        <button
          id="btn-sync-cloud-status"
          type="button"
          title="Data tersinkron dengan Cloudflare D1. Klik untuk sinkronisasi ulang."
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#F9F9F8] dark:bg-[#121214] text-[11px] font-semibold text-[#71717A] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] cursor-pointer transition select-none"
        >
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Tersinkron</span>
        </button>
      `;
    } else {
      // 'error' atau offline
      syncBadgeMarkup = `
        <button
          id="btn-sync-cloud-status"
          type="button"
          title="Gagal sinkron dengan Cloudflare D1. Klik untuk coba lagi."
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-[11px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer transition select-none"
        >
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          <span>Gagal Sinkron</span>
        </button>
      `;
    }

    this.container.innerHTML = `
      <nav class="bg-[#FFFFFF]/90 dark:bg-[#121214]/90 backdrop-blur-md border-b border-[#E4E4E7] dark:border-[#27272A] sticky top-0 z-40 transition-colors">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            
            <!-- Brand / Logo -->
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-[#09090B] dark:bg-white flex items-center justify-center text-white dark:text-[#09090B] shadow-xs">
                <i data-lucide="wallet" class="w-5 h-5"></i>
              </div>
              <div>
                <span class="text-lg font-bold tracking-tight text-[#09090B] dark:text-[#F4F4F5] flex items-center gap-1.5">
                  Budget Tracker
                  <span class="text-[10px] font-semibold uppercase tracking-wider bg-[#F9F9F8] dark:bg-[#121214] text-[#71717A] dark:text-[#A1A1AA] px-2 py-0.5 rounded-full border border-[#E4E4E7] dark:border-[#27272A]">
                    Pro
                  </span>
                </span>
                <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] hidden sm:block">Develop by Rey</p>
              </div>
            </div>

            <!-- Action Controls & Status -->
            <div class="flex items-center gap-2 sm:gap-3">
              
              <!-- Indikator Status Sinkronisasi Cloud Interaktif -->
              ${syncBadgeMarkup}

              <!-- Tombol Mode Siang / Malam -->
              <button
                id="btn-toggle-theme"
                type="button"
                title="Ganti ke mode ${isDark ? 'Siang' : 'Malam'}"
                class="p-2 sm:px-2.5 sm:py-2 rounded-lg text-[#09090B] dark:text-[#F4F4F5] bg-[#F9F9F8] dark:bg-[#121214] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] border border-[#E4E4E7] dark:border-[#27272A] text-xs sm:text-sm font-medium transition-all cursor-pointer flex items-center gap-1"
              >
                <i data-lucide="${isDark ? 'sun' : 'moon'}" class="w-4 h-4"></i>
              </button>

              <!-- Tombol Sensor Mata (Eye / Eye-off) -->
              <button
                id="btn-toggle-mask"
                type="button"
                title="${isMasked ? 'Tampilkan Saldo (Sensor Aktif)' : 'Sembunyikan Saldo (Sensor Nonaktif)'}"
                class="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                  isMasked
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800'
                    : 'bg-[#F9F9F8] dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] border border-[#E4E4E7] dark:border-[#27272A]'
                }"
              >
                <i data-lucide="${isMasked ? 'eye-off' : 'eye'}" class="w-4 h-4 shrink-0"></i>
                <span class="hidden sm:inline font-medium">
                  ${isMasked ? 'Sensor Aktif' : 'Sensor Mati'}
                </span>
              </button>

              <!-- Tombol Kunci Layar Manual -->
              <button
                id="btn-lock-session"
                type="button"
                title="Kunci sesi manual (Keamanan Fisik)"
                class="p-2 sm:px-3 sm:py-2 rounded-lg text-[#09090B] dark:text-[#F4F4F5] bg-[#F9F9F8] dark:bg-[#121214] hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-black dark:hover:text-white border border-[#E4E4E7] dark:border-[#27272A] text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <i data-lucide="lock" class="w-4 h-4 shrink-0"></i>
                <span class="hidden sm:inline">Kunci</span>
              </button>

              <!-- Divider -->
              <div class="h-6 w-px bg-[#E4E4E7] dark:bg-[#27272A] mx-0.5 sm:mx-1"></div>

              <!-- Status User / Tombol Login -->
              ${
                isAuthenticated
                  ? `
                <div class="flex items-center gap-1.5 sm:gap-2">
                  <div class="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 bg-[#F9F9F8] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg">
                    <div class="w-6 h-6 rounded-full bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] flex items-center justify-center font-bold text-xs shrink-0">
                      ${user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <span class="hidden sm:inline text-xs sm:text-sm font-semibold text-[#09090B] dark:text-[#F4F4F5] max-w-[100px] sm:max-w-[140px] truncate">
                      ${user?.name || user?.username || 'Pengguna'}
                    </span>
                  </div>

                  <button
                    id="btn-navbar-logout"
                    type="button"
                    title="Keluar dari sesi"
                    class="p-2 rounded-lg text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <i data-lucide="log-out" class="w-4 h-4"></i>
                  </button>
                </div>
              `
                  : `
                <button
                  id="btn-navbar-login"
                  type="button"
                  class="flex items-center gap-1.5 p-2 sm:px-3.5 sm:py-2 rounded-lg bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] text-xs sm:text-sm font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <i data-lucide="log-in" class="w-4 h-4 shrink-0"></i>
                  <span class="hidden sm:inline">Masuk</span>
                </button>
              `
              }

            </div>
          </div>
        </div>
      </nav>
    `;

    renderIcons(this.container);
    this.attachEvents();
  }

  /**
   * Cleanup saat komponen di-unmount.
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.container.innerHTML = '';
  }
}

/**
 * Factory helper untuk inisialisasi Navbar.
 * @param {Object} options
 * @returns {Navbar}
 */
export function createNavbar(options) {
  return new Navbar(options);
}
