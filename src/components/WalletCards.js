// src/components/WalletCards.js
import { store, getState, subscribe, removeAccount } from '../state/store.js';
import { formatRupiah, maskValue } from '../utils/formatters.js';
import { renderIcons } from '../utils/icons.js';
import { openEditWalletNameModal, openAddAccountModal, openConfirmDeleteWalletModal } from './Modals.js';
import { showToast } from '../utils/toast.js';

/**
 * Pilihan palet gradasi mockup kartu rekening & e-wallet
 */
const CARD_THEMES = {
  bca: {
    gradient: 'from-blue-900 via-indigo-950 to-slate-900',
    accent: 'bg-blue-400/20 text-blue-200 border-blue-300/30',
    badge: 'BCA',
  },
  bri: {
    gradient: 'from-blue-950 via-blue-900 to-sky-800',
    accent: 'bg-sky-400/20 text-sky-200 border-sky-300/30',
    badge: 'BRI',
  },
  bni: {
    gradient: 'from-[#004f6e] via-[#00334e] to-[#c74400]',
    accent: 'bg-orange-400/20 text-orange-200 border-orange-300/30',
    badge: 'BNI',
  },
  mandiri: {
    gradient: 'from-[#002f6c] via-[#001e47] to-[#b87400]',
    accent: 'bg-amber-400/20 text-amber-200 border-amber-300/30',
    badge: 'MANDIRI',
  },
  dana: {
    gradient: 'from-sky-500 via-blue-600 to-indigo-700',
    accent: 'bg-sky-200/20 text-sky-100 border-sky-200/30',
    badge: 'DANA',
  },
  shopeepay: {
    gradient: 'from-orange-500 via-amber-600 to-red-500',
    accent: 'bg-orange-200/20 text-orange-100 border-orange-200/30',
    badge: 'SHOPEEPAY',
  },
  gopay: {
    gradient: 'from-teal-600 via-emerald-700 to-cyan-800',
    accent: 'bg-teal-200/20 text-teal-100 border-teal-200/30',
    badge: 'GOPAY',
  },
  cash: {
    gradient: 'from-emerald-800 via-teal-900 to-slate-900',
    accent: 'bg-emerald-300/20 text-emerald-200 border-emerald-300/30',
    badge: 'TUNAI',
  },
  default: {
    gradient: 'from-slate-800 via-slate-900 to-zinc-900',
    accent: 'bg-white/10 text-slate-200 border-white/20',
    badge: 'DOMPET',
  },
};

/**
 * Menentukan badge tipe akun (Bank / E-Wallet / Tunai).
 * @param {Object} account
 * @returns {'Bank' | 'E-Wallet' | 'Tunai'}
 */
function resolveTypeBadge(account) {
  const type = String(account.type || '').toLowerCase();
  if (type === 'ewallet' || type.includes('wallet')) return 'E-Wallet';
  if (type === 'cash' || type.includes('tunai')) return 'Tunai';
  return 'Bank';
}

/**
 * Mendapatkan konfigurasi tema kartu berdasarkan properti rekening.
 * @param {Object} account
 * @returns {typeof CARD_THEMES.default}
 */
function resolveCardTheme(account) {
  if (account.theme && CARD_THEMES[account.theme]) {
    return CARD_THEMES[account.theme];
  }

  const providerKey = String(account.provider || account.name || '').toLowerCase();
  for (const [key, theme] of Object.entries(CARD_THEMES)) {
    if (providerKey.includes(key)) {
      return theme;
    }
  }

  return CARD_THEMES.default;
}

/**
 * Komponen WalletCards: merender kartu rekening fisik dan e-wallet dalam mockup interaktif.
 */
export class WalletCards {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM induk.
   * @param {() => void} [options.onAddAccount] - Callback saat tombol Tambah Rekening ditekan.
   * @param {(account: Object) => void} [options.onSelectAccount] - Callback saat kartu dipilih.
   * @param {(account?: Object) => void} [options.onTransferClick] - Callback saat tombol Transfer ditekan.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[WalletCards] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.onAddAccount = options.onAddAccount || (() => openAddAccountModal());
    this.onSelectAccount = options.onSelectAccount || (() => {});
    this.onTransferClick = options.onTransferClick || (() => {});
    this.onEditAccount = options.onEditAccount || ((account) => openEditWalletNameModal(account));

    // Langganan perubahan state (misal isMasked berubah atau accounts diperbarui)
    this.unsubscribe = subscribe(() => this.render());

    this.render();
  }

  /**
   * Menghubungkan interaksi tombol dengan event listener.
   */
  attachEvents() {
    // Tombol Transfer Antar Rekening di Header
    const transferBtn = this.container.querySelector('#btn-open-transfer');
    if (transferBtn) {
      transferBtn.addEventListener('click', () => this.onTransferClick());
    }

    // Tombol Transfer pada Kartu
    const transferCardButtons = this.container.querySelectorAll('[data-transfer-account-id]');
    transferCardButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const accId = btn.getAttribute('data-transfer-account-id');
        const state = getState();
        const account = (state.accounts || []).find((a) => String(a.id) === String(accId));
        this.onTransferClick(account);
      });
    });

    // Tombol Edit Nama Dompet pada setiap kartu (ikon pensil)
    const editButtons = this.container.querySelectorAll('.btn-edit-wallet, [data-edit-account-id]');
    editButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation(); // Mencegah klik kartu terpicu
        const accId = btn.getAttribute('data-id') || btn.getAttribute('data-edit-account-id');
        const state = getState();
        const account = (state.accounts || []).find((a) => String(a.id) === String(accId));
        if (account) {
          if (typeof this.onEditAccount === 'function') {
            this.onEditAccount(account);
          } else {
            openEditWalletNameModal(account);
          }
        }
      });
    });

    // Tombol Tambah Rekening Manual
    const addBtn = this.container.querySelector('#btn-add-account');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (typeof this.onAddAccount === 'function') {
          this.onAddAccount();
        } else {
          openAddAccountModal();
        }
      });
    }

    // Tombol Hapus Rekening pada setiap kartu dengan Custom Modal Dialog In-App
    const deleteButtons = this.container.querySelectorAll('[data-delete-account-id]');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation(); // Mencegah klik kartu terpicu
        const accId = btn.getAttribute('data-delete-account-id');
        const state = getState();
        const account = (state.accounts || []).find((a) => String(a.id) === String(accId));
        if (!account) return;

        openConfirmDeleteWalletModal({
          account,
          onConfirm: () => {
            removeAccount(accId);
            showToast('Rekening berhasil dihapus', 'success');
          },
        });
      });
    });

    // Klik pada setiap kartu rekening
    const cardElements = this.container.querySelectorAll('[data-account-id]');
    cardElements.forEach((el) => {
      el.addEventListener('click', () => {
        const accId = el.getAttribute('data-account-id');
        const state = getState();
        const account = (state.accounts || []).find((a) => String(a.id) === String(accId));
        if (account) {
          this.onSelectAccount(account);
        }
      });
    });
  }

  /**
   * Merender daftar kartu rekening.
   */
  render() {
    const state = getState();
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    const isMasked = Boolean(state.isMasked);

    // Hitung total saldo dari seluruh rekening
    const totalBalance = accounts.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);
    const maskedTotal = maskValue(formatRupiah(totalBalance), isMasked);

    this.container.innerHTML = `
      <section class="space-y-4">
        <!-- Header Bagian Dompet -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
          <div>
            <h2 class="text-xl font-bold tracking-tight text-[#09090B] dark:text-[#F4F4F5] flex items-center gap-2">
              <i data-lucide="credit-card" class="w-5 h-5 text-[#09090B] dark:text-[#F4F4F5]"></i>
              Rekening & Dompet Digital
            </h2>
            <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">
              Total Saldo: <span class="font-semibold text-[#09090B] dark:text-[#F4F4F5] privacy-mask">${maskedTotal}</span> • ${accounts.length} rekening
            </p>
          </div>

          <!-- Tombol Aksi Header: Transfer Antar Rekening (Adaptif) -->
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <button
              id="btn-open-transfer"
              type="button"
              class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer active:opacity-80"
            >
              <i data-lucide="arrow-left-right" class="w-4 h-4"></i>
              <span>Transfer Antar Rekening</span>
            </button>
          </div>
        </div>

        <!-- Daftar / Grid Kartu Rekening -->
        <div class="flex flex-col gap-4 w-full md:grid md:grid-cols-2 lg:grid-cols-3">
          
          <!-- Daftar Kartu Akun -->
          ${accounts
            .map((acc) => {
              const theme = resolveCardTheme(acc);
              const typeBadge = resolveTypeBadge(acc);
              const formattedBalance = formatRupiah(acc.balance);
              const displayBalance = maskValue(formattedBalance, isMasked);

              return `
              <article
                data-account-id="${acc.id}"
                tabindex="0"
                class="w-full cursor-pointer group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-tr ${theme.gradient} text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 select-none border border-white/10"
              >
                <!-- Dekorasi Pencahayaan Latar Kartu -->
                <div class="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none group-hover:opacity-80 transition-opacity duration-300"></div>
                <div class="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-black/20 blur-xl pointer-events-none"></div>

                <div class="relative z-10 flex flex-col justify-between h-44">
                  
                  <!-- Baris Atas: Chip Fisik & Badge Tipe (Bank/E-Wallet/Tunai) -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                      <!-- Chip Kartu Fisik Realistis -->
                      <div class="w-10 h-7 rounded-md bg-gradient-to-tr from-amber-200 via-yellow-400 to-amber-300 p-0.5 shadow-md border border-amber-500/40 relative overflow-hidden flex items-center justify-center">
                        <div class="w-full h-full border border-amber-600/30 rounded flex flex-col justify-between p-1">
                          <div class="h-px bg-amber-700/40 w-full"></div>
                          <div class="flex justify-between">
                            <div class="w-2 h-px bg-amber-700/40"></div>
                            <div class="w-2 h-px bg-amber-700/40"></div>
                          </div>
                          <div class="h-px bg-amber-700/40 w-full"></div>
                        </div>
                      </div>

                      <!-- Ikon Contactless Wave -->
                      <i data-lucide="wifi" class="w-4 h-4 text-white/60 rotate-90"></i>
                    </div>

                    <!-- Badge Tipe (Bank/E-Wallet/Tunai) -->
                    <span class="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border backdrop-blur-sm ${theme.accent}">
                      ${typeBadge}
                    </span>
                  </div>

                  <!-- Baris Tengah: Saldo Nominal -->
                  <div class="my-auto">
                    <span class="text-[10px] uppercase tracking-wider text-white/60 font-medium">Saldo Tersedia</span>
                    <p class="text-2xl font-extrabold tracking-tight drop-shadow-sm text-white">
                      <span class="privacy-mask">${displayBalance}</span>
                    </p>
                  </div>

                  <!-- Baris Bawah: Nama Dompet/Bank & Tombol Aksi (Transfer / Hapus) -->
                  <div class="flex items-center justify-between pt-2 border-t border-white/15 gap-2">
                    <div class="min-w-0 flex-1 flex items-center gap-2">
                      <span class="font-bold text-sm sm:text-base text-white truncate" title="${acc.name}">${acc.name || 'Rekening'}</span>
                      <button
                        type="button"
                        class="btn-edit-wallet p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer shrink-0 active:opacity-80"
                        data-id="${acc.id}"
                        data-edit-account-id="${acc.id}"
                        title="Edit nama dompet / bank"
                      >
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                      </button>
                    </div>

                    <!-- Tombol Aksi: Transfer & Hapus -->
                    <div class="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-transfer-account-id="${acc.id}"
                        title="Transfer dari rekening ini"
                        class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold backdrop-blur-sm border border-white/20 transition-colors cursor-pointer active:opacity-80"
                      >
                        <i data-lucide="arrow-left-right" class="w-3 h-3"></i>
                        <span>Transfer</span>
                      </button>
                      <button
                        type="button"
                        data-delete-account-id="${acc.id}"
                        title="Hapus rekening"
                        class="w-7 h-7 rounded-lg bg-black/20 hover:bg-rose-600/90 text-white/70 hover:text-white flex items-center justify-center transition-colors backdrop-blur-sm border border-white/10 hover:border-rose-400 cursor-pointer active:opacity-80"
                      >
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </div>

                </div>
              </article>
            `;
            })
            .join('')}

          <!-- Kartu Aksi: "+ Tambah Rekening" -->
          <button
            id="btn-add-account"
            type="button"
            class="w-full h-44 rounded-2xl border-2 border-dashed border-[#E4E4E7] dark:border-[#27272A] hover:border-[#09090B] dark:hover:border-white bg-[#FFFFFF] dark:bg-[#121214] transition-all duration-200 flex flex-col items-center justify-center gap-3 p-5 text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] group cursor-pointer"
          >
            <div class="w-12 h-12 rounded-full bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] group-hover:bg-[#E4E4E7] dark:group-hover:bg-[#27272A] flex items-center justify-center transition-colors shadow-2xs">
              <i data-lucide="plus" class="w-6 h-6 text-[#09090B] dark:text-[#F4F4F5]"></i>
            </div>
            <div class="text-center">
              <span class="text-sm font-bold text-[#09090B] dark:text-[#F4F4F5] block">
                Tambah Rekening
              </span>
              <span class="text-xs text-[#71717A] dark:text-[#A1A1AA] block mt-0.5">
                Bank atau e-wallet baru
              </span>
            </div>
          </button>

        </div>
      </section>
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
 * Factory helper untuk inisialisasi WalletCards.
 * @param {Object} options
 * @returns {WalletCards}
 */
export function createWalletCards(options) {
  return new WalletCards(options);
}

