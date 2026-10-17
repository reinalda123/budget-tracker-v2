// src/components/BottomNav.js
import { store, getState, subscribe, setActiveTab } from '../state/store.js';
import { renderIcons } from '../utils/icons.js';

/**
 * Komponen BottomNav: Navigasi bilah bawah dengan 4 menu utama (Beranda, Dompet, Aktivitas, Laporan)
 * plus tombol tengah (+) untuk pencatatan transaksi cepat.
 * Dilengkapi kapsul aktif liquid glass (frosted) dengan spring physics animation (stiffness: 450, damping: 35)
 * dan efek responsif whileTap (scale: 0.94).
 */
export class BottomNav {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM tempat BottomNav dirender.
   * @param {() => void} [options.onQuickAdd] - Callback saat tombol tengah (+) ditekan (Catat Manual).
   * @param {() => void} [options.onScanReceipt] - Callback saat aksi Scan Struk dipilih.
   * @param {() => void} [options.onAskAi] - Callback saat aksi Tanya AI dipilih.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[BottomNav] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.onQuickAdd = options.onQuickAdd || (() => {});
    this.onScanReceipt = options.onScanReceipt || (() => {});
    this.onAskAi = options.onAskAi || (() => {});
    this.currentActiveTab = getState().activeTab || 'home';
    this.isPopoverOpen = false;

    // Render DOM persistent shell sekali agar animasi kapsul liquid glass meluncur mulus
    this.render();

    // Langganan pembaruan state store
    this.unsubscribe = subscribe(() => {
      const stateTab = getState().activeTab || 'home';
      if (stateTab !== this.currentActiveTab) {
        this.updateActiveTab(stateTab);
      }
    });

    // Listener resize jendela agar posisi kapsul tetap presisi & tutup popover di desktop
    this.handleResize = () => {
      this.positionPill(this.currentActiveTab, true);
      if (window.innerWidth >= 768 && this.isPopoverOpen) {
        this.closePopover();
      }
    };
    window.addEventListener('resize', this.handleResize);

    // Listener tombol Escape untuk menutup popover
    this.handleKeyDown = (e) => {
      if (e.key === 'Escape' && this.isPopoverOpen) {
        this.closePopover();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Membuka menu popover / speed dial mobile di atas tombol [+]
   */
  openPopover() {
    this.isPopoverOpen = true;
    const popover = this.container.querySelector('#speed-dial-popover');
    const backdrop = this.container.querySelector('#speed-dial-backdrop');
    const icon = this.container.querySelector('#icon-bottom-quick-add');
    if (popover) {
      popover.classList.remove('hidden');
    }
    if (backdrop) {
      backdrop.classList.remove('hidden');
    }
    if (icon) {
      icon.classList.add('rotate-45');
    }
  }

  /**
   * Menutup menu popover / speed dial mobile
   */
  closePopover() {
    this.isPopoverOpen = false;
    const popover = this.container.querySelector('#speed-dial-popover');
    const backdrop = this.container.querySelector('#speed-dial-backdrop');
    const icon = this.container.querySelector('#icon-bottom-quick-add');
    if (popover) {
      popover.classList.add('hidden');
    }
    if (backdrop) {
      backdrop.classList.add('hidden');
    }
    if (icon) {
      icon.classList.remove('rotate-45');
    }
  }

  /**
   * Toggle status buka/tutup popover speed dial
   */
  togglePopover() {
    if (this.isPopoverOpen) {
      this.closePopover();
    } else {
      this.openPopover();
    }
  }

  /**
   * Menghubungkan event listener klik tab dan tombol quick add,
   * dengan respon visual efek kaca halus (tanpa efek fisik membal/scale).
   */
  attachEvents() {
    // Tombol Tab Navigasi
    const tabButtons = this.container.querySelectorAll('[data-nav-tab]');
    tabButtons.forEach((btn) => {
      // Respon visual halus efek kaca: opacity feedback
      const handlePointerDown = () => {
        btn.style.opacity = '0.7';
      };
      const handlePointerUp = () => {
        btn.style.opacity = '';
      };

      btn.addEventListener('pointerdown', handlePointerDown);
      btn.addEventListener('pointerup', handlePointerUp);
      btn.addEventListener('pointerleave', handlePointerUp);
      btn.addEventListener('pointercancel', handlePointerUp);

      // Event klik biasa
      btn.addEventListener('click', () => {
        this.closePopover();
        const tab = btn.getAttribute('data-nav-tab');
        if (tab) {
          this.updateActiveTab(tab);
          setActiveTab(tab);
        }
      });
    });

    // Tombol Quick Add Tengah (+) dengan interaksi adaptif Mobile vs Desktop
    const quickAddBtn = this.container.querySelector('#btn-bottom-quick-add');
    if (quickAddBtn) {
      const handleQuickDown = () => {
        quickAddBtn.style.opacity = '0.8';
      };
      const handleQuickUp = () => {
        quickAddBtn.style.opacity = '';
      };

      quickAddBtn.addEventListener('pointerdown', handleQuickDown);
      quickAddBtn.addEventListener('pointerup', handleQuickUp);
      quickAddBtn.addEventListener('pointerleave', handleQuickUp);
      quickAddBtn.addEventListener('pointercancel', handleQuickUp);

      quickAddBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMobile = window.innerWidth < 768;
        if (!isMobile) {
          // Desktop: langsung buka form transaksi manual
          this.closePopover();
          this.onQuickAdd();
        } else {
          // Mobile: buka speed-dial popover mengambang tepat di atas tombol [+]
          this.togglePopover();
        }
      });
    }

    // Backdrop Transparan: klik di luar menu otomatis menutup popover
    const backdrop = this.container.querySelector('#speed-dial-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePopover();
      });
    }

    // Aksi Speed-Dial 1: Catat Manual
    const manualBtn = this.container.querySelector('#speed-dial-action-manual');
    if (manualBtn) {
      manualBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePopover();
        this.onQuickAdd();
      });
    }

    // Aksi Speed-Dial 2: Scan Struk
    const scanBtn = this.container.querySelector('#speed-dial-action-scan');
    if (scanBtn) {
      scanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePopover();
        this.onScanReceipt();
      });
    }

    // Aksi Speed-Dial 3: Tanya AI
    const askBtn = this.container.querySelector('#speed-dial-action-ask');
    if (askBtn) {
      askBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePopover();
        this.onAskAi();
      });
    }
  }

  /**
   * Menggerakkan kapsul liquid glass ke posisi tab target dengan physics spring.
   * Spring physics specification: stiffness: 450, damping: 35
   * Equivalent CSS timing: cubic-bezier(0.22, 1.25, 0.36, 1) duration ~360ms
   * @param {string} tab
   * @param {boolean} [immediate=false] - Jika true, pindahkan posisi tanpa animasi transisi (untuk mount / resize)
   */
  positionPill(tab, immediate = false) {
    const pill = this.container.querySelector('#active-nav-pill');
    const targetBtn = this.container.querySelector(`[data-nav-tab="${tab}"]`);

    if (!pill || !targetBtn) return;

    const left = targetBtn.offsetLeft;
    const top = targetBtn.offsetTop;
    const width = targetBtn.offsetWidth;
    const height = targetBtn.offsetHeight;

    if (width === 0 || height === 0) {
      // Jadwalkan di frame berikutnya jika layout belum siap
      requestAnimationFrame(() => this.positionPill(tab, immediate));
      return;
    }

    if (immediate) {
      pill.style.transition = 'none';
      pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      pill.style.width = `${width}px`;
      pill.style.height = `${height}px`;
      pill.style.opacity = '1';
      void pill.offsetHeight; // Force reflow
      pill.style.transition = 'transform 360ms cubic-bezier(0.22, 1.25, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1), height 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease';
    } else {
      pill.style.transition = 'transform 360ms cubic-bezier(0.22, 1.25, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1), height 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease';
      pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      pill.style.width = `${width}px`;
      pill.style.height = `${height}px`;
      pill.style.opacity = '1';
    }
  }

  /**
   * Memperbarui status aktif tab dan meluncurkan kapsul ke tab baru.
   * @param {string} tab
   * @param {boolean} [immediate=false]
   */
  updateActiveTab(tab, immediate = false) {
    this.currentActiveTab = tab;

    // Perbarui styling teks dan status aktif pada setiap tombol
    const tabButtons = this.container.querySelectorAll('[data-nav-tab]');
    tabButtons.forEach((btn) => {
      const isTarget = btn.getAttribute('data-nav-tab') === tab;
      if (isTarget) {
        btn.classList.add('text-[#09090B]', 'dark:text-[#F4F4F5]', 'font-bold');
        btn.classList.remove('text-[#71717A]', 'dark:text-[#A1A1AA]', 'font-medium');
      } else {
        btn.classList.remove('text-[#09090B]', 'dark:text-[#F4F4F5]', 'font-bold');
        btn.classList.add('text-[#71717A]', 'dark:text-[#A1A1AA]', 'font-medium');
      }
    });

    // Pindahkan kapsul liquid glass
    this.positionPill(tab, immediate);
  }

  /**
   * Merender bilah navigasi bawah ke dalam container.
   */
  render() {
    const activeTab = this.currentActiveTab;

    this.container.innerHTML = `
      <!-- Backdrop Transparan Popover Speed-Dial (Auto-Dismiss saat mengetuk di luar) -->
      <div id="speed-dial-backdrop" class="hidden fixed inset-0 z-40 bg-black/10 dark:bg-black/25"></div>

      <!-- Bilah Navigasi Bawah dengan Safe Area Ergonomi Mobile -->
      <nav class="fixed bottom-0 left-0 right-0 z-40 w-full pointer-events-auto bg-[#FFFFFF]/90 dark:bg-[#121214]/90 backdrop-blur-md border-t border-[#E4E4E7] dark:border-[#27272A] shadow-md transition-colors" style="padding-bottom: env(safe-area-inset-bottom, 12px);">
        <div id="bottom-nav-inner" class="max-w-lg mx-auto px-4 sm:px-6 py-2 flex items-center justify-around relative">
          
          <!-- Kapsul Aktif Frosted Liquid Glass (Spring Animation Physics: stiffness: 450, damping: 35) -->
          <div
            id="active-nav-pill"
            data-layout-id="activeNavPill"
            class="absolute top-0 left-0 z-0 pointer-events-none rounded-full backdrop-blur-md bg-zinc-900/10 dark:bg-white/15 border border-zinc-900/10 dark:border-white/15 shadow-sm opacity-0 will-change-transform"
          ></div>

          <!-- Tab 1: Beranda -->
          <button
            type="button"
            data-nav-tab="home"
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-colors duration-100 ease-out active:opacity-75 cursor-pointer select-none ${
              activeTab === 'home'
                ? 'text-[#09090B] dark:text-[#F4F4F5] font-bold'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] font-medium'
            }"
          >
            <i data-lucide="home" class="w-5 h-5"></i>
            <span class="text-[11px] mt-0.5">Beranda</span>
          </button>

          <!-- Tab 2: Dompet -->
          <button
            type="button"
            data-nav-tab="wallets"
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-colors duration-100 ease-out active:opacity-75 cursor-pointer select-none ${
              activeTab === 'wallets'
                ? 'text-[#09090B] dark:text-[#F4F4F5] font-bold'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] font-medium'
            }"
          >
            <i data-lucide="wallet" class="w-5 h-5"></i>
            <span class="text-[11px] mt-0.5">Dompet</span>
          </button>

          <!-- Floating Action Button (FAB) Tengah Terangkat & Speed-Dial Menu -->
          <div id="center-fab-container" class="relative -mt-6 sm:-mt-5 z-50 flex items-center justify-center shrink-0 px-1">
            
            <!-- Speed-Dial Popover Menu (Mobile Only) -->
            <div
              id="speed-dial-popover"
              class="hidden absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-56 p-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] shadow-2xl z-50 flex flex-col gap-1 select-none animate-in fade-in zoom-in-95 duration-150"
            >
              <div class="px-2 py-1 border-b border-[#E4E4E7]/60 dark:border-[#27272A]/60 mb-0.5">
                <span class="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider block">
                  Aksi Cepat
                </span>
              </div>

              <!-- 1. Catat Manual -->
              <button
                type="button"
                id="speed-dial-action-manual"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none active:bg-zinc-200 dark:active:bg-zinc-700"
              >
                <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center shrink-0 text-sm">
                  ✍️
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-xs font-bold text-[#09090B] dark:text-[#F4F4F5] block truncate">Catat Manual</span>
                  <span class="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block truncate">Formulir transaksi biasa</span>
                </div>
              </button>

              <!-- 2. Scan Struk -->
              <button
                type="button"
                id="speed-dial-action-scan"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none active:bg-zinc-200 dark:active:bg-zinc-700"
              >
                <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 text-sm">
                  📷
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-xs font-bold text-[#09090B] dark:text-[#F4F4F5] block truncate">Scan Struk</span>
                  <span class="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block truncate">Ekstraksi struk AI</span>
                </div>
              </button>

              <!-- 3. Tanya AI -->
              <button
                type="button"
                id="speed-dial-action-ask"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none active:bg-zinc-200 dark:active:bg-zinc-700"
              >
                <div class="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 text-sm">
                  🤖
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-xs font-bold text-[#09090B] dark:text-[#F4F4F5] block truncate">Tanya AI</span>
                  <span class="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block truncate">Konsultasi keuangan</span>
                </div>
              </button>
            </div>

            <!-- Tombol Lingkaran Tengah (+) -->
            <button
              id="btn-bottom-quick-add"
              type="button"
              title="Catat Transaksi Cepat"
              class="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] shadow-lg flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer ring-4 ring-[#FFFFFF] dark:ring-[#121214]"
            >
              <i data-lucide="plus" id="icon-bottom-quick-add" class="w-6 h-6 transition-transform duration-200"></i>
            </button>
          </div>

          <!-- Tab 3: Aktivitas (Kalender) -->
          <button
            type="button"
            data-nav-tab="activity"
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-colors duration-100 ease-out active:opacity-75 cursor-pointer select-none ${
              activeTab === 'activity'
                ? 'text-[#09090B] dark:text-[#F4F4F5] font-bold'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] font-medium'
            }"
          >
            <i data-lucide="calendar-days" class="w-5 h-5"></i>
            <span class="text-[11px] mt-0.5">Aktivitas</span>
          </button>

          <!-- Tab 4: Laporan -->
          <button
            type="button"
            data-nav-tab="report"
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-colors duration-100 ease-out active:opacity-75 cursor-pointer select-none ${
              activeTab === 'report'
                ? 'text-[#09090B] dark:text-[#F4F4F5] font-bold'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] font-medium'
            }"
          >
            <i data-lucide="pie-chart" class="w-5 h-5"></i>
            <span class="text-[11px] mt-0.5">Laporan</span>
          </button>

        </div>
      </nav>
    `;

    renderIcons(this.container);
    this.attachEvents();

    // Posisikan kapsul secara presisi pada tab aktif awal setelah layout siap
    requestAnimationFrame(() => {
      this.positionPill(activeTab, true);
    });
  }

  /**
   * Cleanup saat komponen di-unmount.
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
    }
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.container.innerHTML = '';
  }
}

/**
 * Factory helper untuk inisialisasi BottomNav.
 * @param {Object} options
 * @returns {BottomNav}
 */
export function createBottomNav(options) {
  return new BottomNav(options);
}
