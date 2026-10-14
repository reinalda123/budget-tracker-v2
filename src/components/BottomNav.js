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
   * @param {() => void} [options.onQuickAdd] - Callback saat tombol tengah (+) ditekan.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[BottomNav] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.onQuickAdd = options.onQuickAdd || (() => {});
    this.currentActiveTab = getState().activeTab || 'home';

    // Render DOM persistent shell sekali agar animasi kapsul liquid glass meluncur mulus
    this.render();

    // Langganan pembaruan state store
    this.unsubscribe = subscribe(() => {
      const stateTab = getState().activeTab || 'home';
      if (stateTab !== this.currentActiveTab) {
        this.updateActiveTab(stateTab);
      }
    });

    // Listener resize jendela agar posisi kapsul tetap presisi
    this.handleResize = () => {
      this.positionPill(this.currentActiveTab, true);
    };
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Menghubungkan event listener klik tab dan tombol quick add,
   * serta efek whileTap (scale: 0.94) untuk responsivitas sentuhan fisik.
   */
  attachEvents() {
    // Tombol Tab Navigasi
    const tabButtons = this.container.querySelectorAll('[data-nav-tab]');
    tabButtons.forEach((btn) => {
      // Interaksi tap fisik: whileTap={{ scale: 0.94 }}
      const handlePointerDown = () => {
        btn.style.transform = 'scale(0.94)';
      };
      const handlePointerUp = () => {
        btn.style.transform = '';
      };

      btn.addEventListener('pointerdown', handlePointerDown);
      btn.addEventListener('pointerup', handlePointerUp);
      btn.addEventListener('pointerleave', handlePointerUp);
      btn.addEventListener('pointercancel', handlePointerUp);

      // Event klik biasa
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-nav-tab');
        if (tab) {
          this.updateActiveTab(tab);
          setActiveTab(tab);
        }
      });
    });

    // Tombol Quick Add Tengah (+) dengan whileTap scale: 0.94
    const quickAddBtn = this.container.querySelector('#btn-bottom-quick-add');
    if (quickAddBtn) {
      const handleQuickDown = () => {
        quickAddBtn.style.transform = 'scale(0.94)';
      };
      const handleQuickUp = () => {
        quickAddBtn.style.transform = '';
      };

      quickAddBtn.addEventListener('pointerdown', handleQuickDown);
      quickAddBtn.addEventListener('pointerup', handleQuickUp);
      quickAddBtn.addEventListener('pointerleave', handleQuickUp);
      quickAddBtn.addEventListener('pointercancel', handleQuickUp);

      quickAddBtn.addEventListener('click', () => {
        this.onQuickAdd();
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
      <nav class="fixed bottom-0 left-0 right-0 z-40 w-full pointer-events-auto bg-[#FFFFFF]/90 dark:bg-[#121214]/90 backdrop-blur-md border-t border-[#E4E4E7] dark:border-[#27272A] shadow-md transition-colors">
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
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-transform duration-100 ease-out active:scale-[0.94] cursor-pointer select-none ${
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
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-transform duration-100 ease-out active:scale-[0.94] cursor-pointer select-none ${
              activeTab === 'wallets'
                ? 'text-[#09090B] dark:text-[#F4F4F5] font-bold'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] font-medium'
            }"
          >
            <i data-lucide="wallet" class="w-5 h-5"></i>
            <span class="text-[11px] mt-0.5">Dompet</span>
          </button>

          <!-- Tombol Utama Tengah Mengambang: Add Transaction (Adaptif) -->
          <div class="relative -top-4 z-20 flex items-center justify-center">
            <button
              id="btn-bottom-quick-add"
              type="button"
              title="Catat Transaksi Cepat"
              class="w-13 h-13 rounded-full bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] shadow-md flex items-center justify-center transition-transform duration-100 ease-out hover:scale-105 active:scale-[0.94] cursor-pointer ring-4 ring-[#F9F9F8] dark:ring-[#09090B]"
            >
              <i data-lucide="plus" class="w-6 h-6"></i>
            </button>
          </div>

          <!-- Tab 3: Aktivitas (Kalender) -->
          <button
            type="button"
            data-nav-tab="activity"
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-transform duration-100 ease-out active:scale-[0.94] cursor-pointer select-none ${
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
            class="relative z-10 flex flex-col items-center justify-center py-1.5 px-3.5 sm:px-4 rounded-full transition-transform duration-100 ease-out active:scale-[0.94] cursor-pointer select-none ${
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
