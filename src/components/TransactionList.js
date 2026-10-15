// src/components/TransactionList.js
import { store, getState, subscribe, deleteTransaction } from '../state/store.js';
import { formatRupiah, maskValue } from '../utils/formatters.js';
import { formatDateIndo } from '../utils/dates.js';
import { renderIcons } from '../utils/icons.js';
import { openConfirmDeleteTransactionModal, openEditTransactionModal } from './Modals.js';
import { deleteTransactionApi } from '../services/api.js';
import { showToast } from '../utils/toast.js';

/**
 * Komponen TransactionList: Menampilkan riwayat mutasi transaksi terbaru dengan bilah filter cepat.
 */
export class TransactionList {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM tempat daftar transaksi dirender.
   * @param {() => void} [options.onAddTransaction] - Callback saat tombol tambah transaksi diklik.
   * @param {number|null} [options.limit] - Batas jumlah transaksi yang ditampilkan (misal 5 untuk beranda).
   * @param {boolean} [options.showFilter=true] - Menampilkan bilah filter kategori cepat.
   * @param {string} [options.title] - Judul section transaksi.
   * @param {() => void} [options.onViewAll] - Callback saat "Lihat Semua di Aktivitas" diklik.
   * @param {boolean} [options.allowEdit] - Menampilkan tombol edit transaksi (default: true jika limit null, false jika widget ringkasan)
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[TransactionList] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.onAddTransaction = options.onAddTransaction || (() => {});
    this.limit = typeof options.limit === 'number' ? options.limit : null;
    this.showFilter = options.showFilter !== false;
    this.title = options.title || 'Riwayat Transaksi';
    this.onViewAll = options.onViewAll || (() => {});
    this.allowEdit = options.allowEdit !== undefined ? Boolean(options.allowEdit) : (this.limit === null);
    this.currentFilter = 'all'; // Pilihan: 'all' | 'expense' | 'income'

    // Langganan pembaruan state store
    this.unsubscribe = subscribe(() => this.render());

    this.render();
  }

  /**
   * Menghubungkan interaksi tombol filter dan aksi dengan event listener.
   */
  attachEvents() {
    // Tombol Tab Filter Cepat (Semua, Pengeluaran, Pemasukan)
    const filterButtons = this.container.querySelectorAll('[data-filter-tab]');
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const selected = btn.getAttribute('data-filter-tab');
        if (selected && selected !== this.currentFilter) {
          this.currentFilter = selected;
          this.render();
        }
      });
    });

    // Tombol Tambah Transaksi jika tersedia
    const addTxBtn = this.container.querySelector('#btn-add-transaction');
    if (addTxBtn) {
      addTxBtn.addEventListener('click', () => this.onAddTransaction());
    }

    // Tombol Tambah Transaksi pada State Kosong
    const emptyAddTxBtn = this.container.querySelector('#btn-empty-add-tx');
    if (emptyAddTxBtn) {
      emptyAddTxBtn.addEventListener('click', () => this.onAddTransaction());
    }

    // Tombol Lihat Semua Transaksi
    const viewAllBtn = this.container.querySelector('#btn-view-all-tx');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => this.onViewAll());
    }

    // Tombol Edit Transaksi (Membuka Modal Edit Transaksi)
    const editButtons = this.container.querySelectorAll('[data-action="edit-tx"]');
    editButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const txId = btn.getAttribute('data-tx-id');
        const state = getState();
        const tx = (state.transactions || []).find((t) => String(t.id) === String(txId));
        if (!tx) return;

        openEditTransactionModal(tx);
      });
    });

    // Tombol Hapus Transaksi (Konfirmasi & Hapus - fallback)
    const deleteButtons = this.container.querySelectorAll('[data-action="delete-tx"]');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const txId = btn.getAttribute('data-tx-id');
        const state = getState();
        const tx = (state.transactions || []).find((t) => String(t.id) === String(txId));
        if (!tx) return;

        openConfirmDeleteTransactionModal({
          transaction: tx,
          onConfirm: async () => {
            // 1. Hapus dari local state langsung agar UI segera ter-update tanpa reload
            deleteTransaction(tx.id);

            // 2. Beri notifikasi toast sukses
            showToast('Transaksi berhasil dihapus', 'success');

            // 3. Kirim request DELETE ke backend Cloudflare Worker
            try {
              await deleteTransactionApi(tx.id);
            } catch (err) {
              console.warn('[TransactionList] Gagal sinkronisasi DELETE ke Cloudflare Worker:', err);
            }
          },
        });
      });
    });
  }

  /**
   * Memfilter daftar transaksi berdasarkan tab filter aktif, selectedMonth, dan selectedDate.
   * @param {Array<Object>} transactions
   * @param {string} [selectedMonth]
   * @param {string | null} [selectedDate]
   * @returns {Array<Object>}
   */
  getFilteredTransactions(transactions, selectedMonth, selectedDate) {
    if (!Array.isArray(transactions)) return [];

    let list = transactions;

    // Filter berdasarkan tanggal spesifik jika ada
    if (selectedDate) {
      list = list.filter((t) => {
        if (!t.date) return false;
        return String(t.date).slice(0, 10) === selectedDate;
      });
    } else if (selectedMonth) {
      // Filter berdasarkan bulan terpilih
      list = list.filter((t) => {
        if (!t.date) return false;
        return String(t.date).slice(0, 7) === selectedMonth;
      });
    }

    if (this.currentFilter === 'expense') {
      return list.filter((t) => t.type === 'expense');
    }
    if (this.currentFilter === 'income') {
      return list.filter((t) => t.type === 'income');
    }
    return list;
  }

  /**
   * Merender daftar transaksi.
   */
  render() {
    const state = getState();
    const rawTransactions = Array.isArray(state.transactions) ? state.transactions : [];
    const isMasked = Boolean(state.isMasked);

    // Ambil transaksi terfilter dan urutkan tanggal terbaru
    let filteredList = this.getFilteredTransactions(rawTransactions, state.selectedMonth, state.selectedDate).sort((a, b) => {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    const totalCount = filteredList.length;

    // Terapkan batasan jumlah jika limit ditentukan
    if (this.limit && this.limit > 0) {
      filteredList = filteredList.slice(0, this.limit);
    }

    this.container.innerHTML = `
      <section class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl border border-[#E4E4E7] dark:border-[#27272A] p-5 sm:p-6 shadow-xs sm:shadow-sm h-auto lg:h-full lg:min-h-[520px] flex-1 flex flex-col justify-start items-stretch space-y-4">
        
        <div class="space-y-4 flex-1 flex flex-col justify-start items-stretch">
          <!-- Header & Bilah Filter Cepat -->
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
            <div>
              <h3 class="text-lg font-bold tracking-tight text-[#09090B] dark:text-[#F4F4F5] flex items-center gap-2">
                <i data-lucide="receipt" class="w-5 h-5 text-[#09090B] dark:text-[#F4F4F5]"></i>
                ${this.title}
              </h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
                ${this.limit ? `Menampilkan ${filteredList.length} transaksi terbaru` : 'Catatan mutasi pengeluaran dan pemasukan'}
              </p>
            </div>

            ${
              this.showFilter
                ? `
            <!-- Tombol Filter Cepat -->
            <div class="flex items-center bg-[#F9F9F8] dark:bg-[#09090B] p-1 rounded-xl text-xs font-semibold self-start sm:self-auto border border-[#E4E4E7] dark:border-[#27272A]">
              <button
                type="button"
                data-filter-tab="all"
                class="px-3 py-1.5 rounded-lg transition-all ${
                  this.currentFilter === 'all'
                    ? 'bg-[#FFFFFF] dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] border border-[#E4E4E7] dark:border-[#27272A] font-bold shadow-2xs'
                    : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]'
                }"
              >
                Semua
              </button>
              <button
                type="button"
                data-filter-tab="expense"
                class="px-3 py-1.5 rounded-lg transition-all ${
                  this.currentFilter === 'expense'
                    ? 'bg-[#FFFFFF] dark:bg-[#121214] text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 font-bold shadow-2xs'
                    : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]'
                }"
              >
                Pengeluaran
              </button>
              <button
                type="button"
                data-filter-tab="income"
                class="px-3 py-1.5 rounded-lg transition-all ${
                  this.currentFilter === 'income'
                    ? 'bg-[#FFFFFF] dark:bg-[#121214] text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 font-bold shadow-2xs'
                    : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]'
                }"
              >
                Pemasukan
              </button>
            </div>
            `
                : ''
            }
          </div>

          <!-- Daftar Mutasi Transaksi (Top-Aligned Menempel ke Atas) -->
          <div class="space-y-2.5 flex-1 flex flex-col justify-start items-stretch tx-filter-fade max-h-none overflow-visible lg:max-h-[580px] lg:overflow-y-auto custom-scrollbar lg:pr-1">
            ${
              filteredList.length === 0
                ? `
              <div class="py-8 flex flex-col items-center justify-start text-center space-y-3.5">
                <div class="w-12 h-12 rounded-full bg-[#F9F9F8] dark:bg-[#09090B] text-[#71717A] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center mx-auto shadow-2xs">
                  <i data-lucide="receipt" class="w-6 h-6"></i>
                </div>
                <div class="space-y-1">
                  <p class="text-sm font-bold text-[#09090B] dark:text-[#F4F4F5]">Belum Ada Transaksi</p>
                  <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] max-w-xs mx-auto">
                    ${
                      this.currentFilter === 'all'
                        ? 'Belum ada mutasi tercatat pada periode ini. Catat transaksi baru atau pindai struk belanja Anda.'
                        : `Tidak ada mutasi bertipe ${this.currentFilter === 'expense' ? 'pengeluaran' : 'pemasukan'}.`
                    }
                  </p>
                </div>
                <div class="pt-2">
                  <button
                    id="btn-empty-add-tx"
                    type="button"
                    class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-xs font-semibold cursor-pointer transition-colors active:opacity-80 shadow-xs"
                  >
                    <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                    <span>Catat Transaksi Sekarang</span>
                  </button>
                </div>
              </div>
            `
                : filteredList
                  .map((tx) => {
                    const isExpense = tx.type === 'expense';
                    const amountFormatted = formatRupiah(Math.abs(Number(tx.amount) || 0));
                    const maskedAmount = maskValue(amountFormatted, isMasked);
                    const formattedDate = formatDateIndo(tx.date);
                    const rawCategory = tx.category || 'Umum';
                    const maskedCategory = maskValue(rawCategory, isMasked, '••••••••');
                    const matchedAccount = (state.accounts || []).find((a) => String(a.id) === String(tx.wallet_id || tx.accountId));
                    const displayAccountName = tx.accountName || matchedAccount?.name || 'Rekening';

                    return `
                    <article class="p-3 sm:p-3.5 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B]/60 border border-[#E4E4E7] dark:border-[#27272A] text-[#09090B] dark:text-[#F4F4F5] hover:bg-[#F4F4F5] dark:hover:bg-[#121214] transition-colors flex items-center justify-between gap-3 group">
                      
                      <!-- Sisi Kiri: Ikon Tipe & Info Transaksi -->
                      <div class="flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isExpense
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }">
                          <i data-lucide="${isExpense ? 'arrow-down-left' : 'arrow-up-right'}" class="w-5 h-5"></i>
                        </div>

                        <div class="min-w-0 space-y-0.5">
                          <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-[#09090B] dark:text-[#F4F4F5] truncate">
                              ${tx.note || tx.description || maskedCategory}
                            </span>
                            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200/50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 shrink-0 border border-zinc-300/40 dark:border-zinc-700/50">
                              ${maskedCategory}
                            </span>
                          </div>

                          <div class="flex items-center gap-2 text-xs text-[#71717A] dark:text-[#A1A1AA]">
                            <span>${formattedDate}</span>
                            <span>•</span>
                            <span class="text-[#71717A] dark:text-[#A1A1AA] font-medium truncate max-w-[140px] sm:max-w-[200px]">
                              ${displayAccountName}
                            </span>
                          </div>
                        </div>
                      </div>

                      <!-- Sisi Kanan: Nominal Transaksi & Tombol Edit -->
                      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
                        <div class="text-right">
                          <p class="text-sm sm:text-base font-extrabold tracking-tight ${
                            isExpense ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                          }">
                            ${isExpense ? '- ' : '+ '}<span class="privacy-mask">${maskedAmount}</span>
                          </p>
                          <span class="text-[10px] font-medium text-[#71717A] dark:text-[#A1A1AA] block uppercase tracking-wider">
                            ${isExpense ? 'Keluar' : 'Masuk'}
                          </span>
                        </div>

                        ${
                          this.allowEdit
                            ? `
                        <!-- Tombol Edit Transaksi -->
                        <button
                          type="button"
                          data-action="edit-tx"
                          data-tx-id="${tx.id}"
                          title="Edit Transaksi"
                          aria-label="Edit Transaksi"
                          class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#121214] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-[#09090B] dark:text-[#F4F4F5] transition-colors cursor-pointer active:opacity-80 shadow-2xs"
                        >
                          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                          <span>Edit</span>
                        </button>
                        `
                            : ''
                        }
                      </div>

                    </article>
                  `;
                  })
                  .join('')
          }
        </div>
        </div>

        <!-- Tombol Tautan "Lihat Semua di Aktivitas" jika memiliki batasan limit -->
        ${
          this.limit && totalCount > this.limit
            ? `
          <div class="pt-2 text-center border-t border-[#E4E4E7] dark:border-[#27272A] mt-auto">
            <button
              id="btn-view-all-tx"
              type="button"
              class="text-xs font-bold text-[#09090B] dark:text-[#F4F4F5] hover:underline inline-flex items-center gap-1.5 transition-colors cursor-pointer py-1"
            >
              <span>Lihat Semua di Aktivitas (${totalCount} transaksi)</span>
              <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `
            : ''
        }

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
 * Factory helper untuk inisialisasi TransactionList.
 * @param {Object} options
 * @returns {TransactionList}
 */
export function createTransactionList(options) {
  return new TransactionList(options);
}

