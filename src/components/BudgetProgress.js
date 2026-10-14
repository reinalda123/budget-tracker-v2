// src/components/BudgetProgress.js
import { store, getState, subscribe, removeCategory } from '../state/store.js';
import { formatRupiah, maskValue } from '../utils/formatters.js';
import { getRemainingDaysInMonth } from '../utils/dates.js';
import { renderIcons } from '../utils/icons.js';
import { openConfirmDeleteCategoryModal } from './Modals.js';
import { showToast } from '../utils/toast.js';

/**
 * Pemetaan ikon Lucide berdasarkan nama/tipe kategori
 */
const CATEGORY_ICONS = {
  makanan: 'utensils',
  kuliner: 'utensils',
  transport: 'car',
  transportasi: 'car',
  bensin: 'car',
  belanja: 'shopping-bag',
  shopping: 'shopping-bag',
  tagihan: 'zap',
  listrik: 'zap',
  air: 'zap',
  kesehatan: 'heart-pulse',
  medis: 'heart-pulse',
  hiburan: 'film',
  entertainment: 'film',
  kopi: 'coffee',
  kafe: 'coffee',
  rumah: 'home',
  kos: 'home',
  tempat_tinggal: 'home',
  tabungan: 'piggy-bank',
  investasi: 'piggy-bank',
  default: 'wallet',
};

/**
 * Menentukan ikon Lucide yang cocok untuk kategori tertentu.
 * @param {Object} category
 * @returns {string}
 */
function resolveCategoryIcon(category) {
  if (category.icon) return category.icon;

  const key = String(category.name || '').toLowerCase();
  for (const [name, icon] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(name)) return icon;
  }
  return CATEGORY_ICONS.default;
}

/**
 * Komponen BudgetProgress: Menampilkan progres anggaran pos belanja dan Batas Belanja Harian (Daily Burn Rate).
 */
export class BudgetProgress {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM tempat komponen dirender.
   * @param {() => void} [options.onAddCategoryClick] - Callback saat tombol Tambah Pos diklik.
   * @param {(category: Object) => void} [options.onEditCategoryClick] - Callback saat tombol Edit Plafon diklik.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[BudgetProgress] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.showBurnRate = Boolean(options.showBurnRate);
    this.onAddCategoryClick = options.onAddCategoryClick || (() => {});
    this.onEditCategoryClick = options.onEditCategoryClick || (() => {});

    // Langganan pembaruan state store
    this.unsubscribe = subscribe(() => this.render());

    this.render();
  }

  /**
   * Menghubungkan interaksi tombol dengan event listener.
   */
  attachEvents() {
    // Tombol + Tambah Pos
    const addCatBtn = this.container.querySelector('#btn-add-category');
    if (addCatBtn) {
      addCatBtn.addEventListener('click', () => this.onAddCategoryClick());
    }

    // Tombol Edit Plafon Pos
    const editButtons = this.container.querySelectorAll('[data-edit-category-id]');
    editButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catId = btn.getAttribute('data-edit-category-id');
        const state = getState();
        const cat = (state.categories || []).find((c) => String(c.id) === String(catId));
        if (cat) {
          this.onEditCategoryClick(cat);
        }
      });
    });

    // Tombol Hapus Pos Anggaran dengan Modal Dialog In-App
    const deleteButtons = this.container.querySelectorAll('[data-delete-category-id]');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catId = btn.getAttribute('data-delete-category-id');
        const catName = btn.getAttribute('data-category-name') || 'pos ini';
        const state = getState();
        const cat = (state.categories || []).find((c) => String(c.id) === String(catId)) || { id: catId, name: catName };

        openConfirmDeleteCategoryModal({
          category: cat,
          onConfirm: () => {
            removeCategory(catId);
            showToast('Pos anggaran berhasil dihapus', 'success');
          },
        });
      });
    });
  }

  /**
   * Merender komponen anggaran dan burn rate.
   */
  render() {
    const state = getState();
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const isMasked = Boolean(state.isMasked);

    // Periksa bulan terpilih terhadap bulan berjalan saat ini
    const realCurrentMonth = new Date().toISOString().slice(0, 7);
    const selectedMonth = state.selectedMonth || realCurrentMonth;

    let remainingDays = 1;
    let periodNote = '';

    if (selectedMonth === realCurrentMonth) {
      remainingDays = Math.max(1, getRemainingDaysInMonth(new Date()));
      periodNote = `Sisa <strong class="text-[#09090B] dark:text-[#F4F4F5]">${remainingDays} hari</strong> bulan ini.`;
    } else if (selectedMonth > realCurrentMonth) {
      const [y, m] = selectedMonth.split('-').map(Number);
      remainingDays = new Date(y, m, 0).getDate();
      periodNote = `Periode mendatang (<strong class="text-[#09090B] dark:text-[#F4F4F5]">${remainingDays} hari</strong> penuh).`;
    } else {
      remainingDays = 0;
      periodNote = `Periode bulan lalu telah selesai (tutup buku).`;
    }

    // Hitung total alokasi anggaran dan pemakaian keseluruhan
    const totalBudget = categories.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
    const totalSpent = categories.reduce((sum, c) => sum + (Number(c.spent) || 0), 0);
    const totalRemaining = Math.max(0, totalBudget - totalSpent);

    // Hitung Daily Burn Rate (Batas Belanja Harian yang Aman)
    const dailySafeLimit = remainingDays > 0 ? Math.floor(totalRemaining / remainingDays) : 0;
    const overallPercentage = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    // Nilai bertopeng / diformat
    const maskedDailyLimit = maskValue(formatRupiah(dailySafeLimit), isMasked);
    const maskedTotalRemaining = maskValue(formatRupiah(totalRemaining), isMasked);
    const maskedTotalBudget = maskValue(formatRupiah(totalBudget), isMasked);

    this.container.innerHTML = `
      <section class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl border border-[#E4E4E7] dark:border-[#27272A] p-5 sm:p-6 space-y-6 h-full flex-1 flex flex-col justify-between shadow-xs sm:shadow-sm">
        
        <!-- Header Komponen -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
          <div>
            <h3 class="text-lg font-bold tracking-tight text-[#09090B] dark:text-[#F4F4F5] flex items-center gap-2">
              <i data-lucide="piggy-bank" class="w-5 h-5 text-[#09090B] dark:text-[#F4F4F5]"></i>
              ${this.showBurnRate ? 'Alokasi Anggaran & Burn Rate' : 'Alokasi Pos Anggaran'}
            </h3>
            <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
              Pantau batas plafon dan kepatuhan pengeluaran bulanan
            </p>
          </div>

          <!-- Aksi Header: Tombol Tambah Pos & Status Terpakai -->
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <button
              id="btn-add-category"
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F9F9F8] hover:bg-[#E4E4E7] dark:bg-[#09090B] dark:hover:bg-[#27272A] text-[#09090B] dark:text-[#F4F4F5] font-bold text-xs border border-[#E4E4E7] dark:border-[#27272A] transition-colors cursor-pointer active:opacity-80"
            >
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>+ Tambah Pos</span>
            </button>

            <span class="text-xs font-semibold px-2.5 py-1 rounded-full ${
              overallPercentage >= 100
                ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/50'
                : overallPercentage >= 80
                ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/50'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/50'
            }">
              Terpakai ${overallPercentage}%
            </span>
          </div>
        </div>

        ${
          this.showBurnRate
            ? `
        <!-- Banner Daily Burn Rate (Batas Belanja Harian) -->
        <div class="rounded-xl bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] p-4 sm:p-5 relative overflow-hidden">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
            
            <div class="space-y-1">
              <div class="flex items-center gap-1.5 text-[#09090B] dark:text-[#F4F4F5]">
                <i data-lucide="flame" class="w-4 h-4 text-orange-500 animate-pulse"></i>
                <span class="text-xs font-bold uppercase tracking-wider">
                  Daily Burn Rate (Batas Harian)
                </span>
              </div>
              <p class="text-2xl sm:text-3xl font-extrabold text-[#09090B] dark:text-[#F4F4F5] tracking-tight">
                <span class="privacy-mask">${maskedDailyLimit}</span>
                <span class="text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] font-sans tracking-normal">/ hari</span>
              </p>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                ${periodNote} Batas aman: <span class="font-semibold text-[#09090B] dark:text-[#F4F4F5] privacy-mask">${maskedDailyLimit} / hari</span>
              </p>
            </div>

            <!-- Ringkasan Angka Cepat -->
            <div class="sm:text-right border-t sm:border-t-0 sm:border-l border-[#E4E4E7] dark:border-[#27272A] sm:pl-5 pt-2 sm:pt-0 space-y-1">
              <span class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] block font-medium">Sisa Total Anggaran</span>
              <span class="text-sm sm:text-base font-bold text-[#09090B] dark:text-[#F4F4F5] block privacy-mask">${maskedTotalRemaining}</span>
              <span class="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block">dari total plafon <span class="privacy-mask">${maskedTotalBudget}</span></span>
            </div>

          </div>
        </div>
        `
            : ''
        }

        <!-- Daftar Pos Anggaran (Categories Progress) -->
        <div class="space-y-4">
          <div class="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
            <span>POS ANGGARAN</span>
            <span>REALISASI / TARGET PLAFON</span>
          </div>

          ${
            categories.length === 0
              ? `
            <div class="py-8 text-center text-slate-400 text-xs">
              Belum ada pos anggaran. Klik tombol "+ Tambah Pos" di atas untuk membuat alokasi.
            </div>
          `
              : categories
                  .map((cat) => {
                    const budget = Number(cat.budget) || 0;
                    const spent = Number(cat.spent) || 0;
                    const percentage = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                    const iconName = resolveCategoryIcon(cat);
                    const diff = budget - spent;
                    const isOver = diff < 0;

                    // Penentuan warna progress bar dinamis
                    let barColor = 'bg-emerald-500';
                    if (percentage >= 100) {
                      barColor = 'bg-rose-500';
                    } else if (percentage >= 80) {
                      barColor = 'bg-amber-500';
                    }

                    // Masking angka sensor wajib
                    const maskedSpent = maskValue(formatRupiah(spent), isMasked);
                    const maskedBudget = maskValue(formatRupiah(budget), isMasked);
                    const maskedDiff = maskValue(formatRupiah(Math.abs(diff)), isMasked);
                    const clampedWidth = Math.min(100, percentage);

                    return `
                    <div class="space-y-2 p-3.5 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B]/50 hover:bg-[#F4F4F5] dark:hover:bg-[#121214] transition-colors border border-[#E4E4E7] dark:border-[#27272A]">
                      
                      <!-- Baris Judul & Tombol Aksi -->
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <div class="w-8 h-8 rounded-lg bg-[#FFFFFF] dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-center shrink-0">
                            <i data-lucide="${iconName}" class="w-4 h-4"></i>
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-2">
                              <span class="text-sm font-semibold text-[#09090B] dark:text-[#F4F4F5] truncate">
                                ${maskValue(cat.name, isMasked, '••••••••')}
                              </span>
                              <!-- Tombol Aksi Kecil: Edit Plafon & Hapus Pos -->
                              <div class="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  data-edit-category-id="${cat.id}"
                                  title="Edit Plafon Anggaran"
                                  class="p-1 rounded-md text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] transition-colors cursor-pointer"
                                >
                                  <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                                </button>
                                <button
                                  type="button"
                                  data-delete-category-id="${cat.id}"
                                  data-category-name="${cat.name}"
                                  title="Hapus Pos Anggaran"
                                  class="p-1 rounded-md text-[#71717A] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                                >
                                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- Realisasi vs Target Plafon -->
                        <div class="text-right shrink-0">
                          <span class="text-xs sm:text-sm font-bold text-[#09090B] dark:text-[#F4F4F5] block">
                            ${maskedSpent}
                          </span>
                          <span class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] block">
                            / ${maskedBudget}
                          </span>
                        </div>
                      </div>

                      <!-- Progress Bar Dinamis -->
                      <div class="w-full h-2 rounded-full bg-[#E4E4E7] dark:bg-[#27272A] overflow-hidden relative">
                        <div
                          class="h-full rounded-full ${barColor} transition-all duration-500 ease-out"
                          style="width: ${clampedWidth}%"
                        ></div>
                      </div>

                      <!-- Teks Status Sisa / Over di Bawah Progress Bar -->
                      <div class="flex items-center justify-between text-xs pt-0.5">
                        <div>
                          ${
                            isOver
                              ? `<span class="text-rose-500 dark:text-rose-400 font-bold">
                                  Over: ${maskedDiff}
                                 </span>`
                              : `<span class="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  Sisa: ${maskedDiff}
                                 </span>`
                          }
                        </div>
                        <span class="text-[11px] text-slate-400 font-medium">
                          ${percentage}% terpakai
                        </span>
                      </div>

                    </div>
                  `;
                  })
                  .join('')
          }
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
 * Factory helper untuk inisialisasi BudgetProgress.
 * @param {Object} options
 * @returns {BudgetProgress}
 */
export function createBudgetProgress(options) {
  return new BudgetProgress(options);
}

/**
 * Komponen DailyBurnRate: Menampilkan indikator Batas Belanja Harian (Daily Burn Rate).
 */
export class DailyBurnRate {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM tempat kartu dirender.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[DailyBurnRate] Opsi container wajib disertakan.');
    }

    this.container = options.container;

    // Langganan pembaruan state store
    this.unsubscribe = subscribe(() => this.render());

    this.render();
  }

  render() {
    const state = getState();
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const isMasked = Boolean(state.isMasked);

    // Periksa bulan terpilih terhadap bulan berjalan saat ini
    const realCurrentMonth = new Date().toISOString().slice(0, 7);
    const selectedMonth = state.selectedMonth || realCurrentMonth;

    let remainingDays = 1;
    let periodNote = '';

    if (selectedMonth === realCurrentMonth) {
      remainingDays = Math.max(1, getRemainingDaysInMonth(new Date()));
      periodNote = `Sisa <strong class="text-[#09090B] dark:text-[#F4F4F5]">${remainingDays} hari</strong> bulan ini.`;
    } else if (selectedMonth > realCurrentMonth) {
      const [y, m] = selectedMonth.split('-').map(Number);
      remainingDays = new Date(y, m, 0).getDate();
      periodNote = `Periode mendatang (<strong class="text-[#09090B] dark:text-[#F4F4F5]">${remainingDays} hari</strong> penuh).`;
    } else {
      remainingDays = 0;
      periodNote = `Periode bulan lalu telah selesai (tutup buku).`;
    }

    // Hitung total alokasi anggaran dan pemakaian keseluruhan
    const totalBudget = categories.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
    const totalSpent = categories.reduce((sum, c) => sum + (Number(c.spent) || 0), 0);
    const totalRemaining = Math.max(0, totalBudget - totalSpent);

    // Hitung Daily Burn Rate (Batas Belanja Harian yang Aman)
    const dailySafeLimit = remainingDays > 0 ? Math.floor(totalRemaining / remainingDays) : 0;

    // Nilai bertopeng / diformat
    const maskedDailyLimit = maskValue(formatRupiah(dailySafeLimit), isMasked);
    const maskedTotalRemaining = maskValue(formatRupiah(totalRemaining), isMasked);
    const maskedTotalBudget = maskValue(formatRupiah(totalBudget), isMasked);

    this.container.innerHTML = `
      <section class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl border border-[#E4E4E7] dark:border-[#27272A] p-5 sm:p-6 space-y-3">
        <div class="rounded-xl bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] p-4 sm:p-5 relative overflow-hidden">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
            
            <div class="space-y-1">
              <div class="flex items-center gap-1.5 text-[#09090B] dark:text-[#F4F4F5]">
                <i data-lucide="flame" class="w-4 h-4 text-orange-500 animate-pulse"></i>
                <span class="text-xs font-bold uppercase tracking-wider">
                  Daily Burn Rate (Batas Harian)
                </span>
              </div>
              <p class="text-2xl sm:text-3xl font-extrabold text-[#09090B] dark:text-[#F4F4F5] tracking-tight">
                ${maskedDailyLimit}
                <span class="text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] font-sans tracking-normal">/ hari</span>
              </p>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                ${periodNote} Batas aman: <span class="font-semibold text-[#09090B] dark:text-[#F4F4F5]">${maskedDailyLimit} / hari</span>
              </p>
            </div>

            <!-- Ringkasan Angka Cepat -->
            <div class="sm:text-right border-t sm:border-t-0 sm:border-l border-[#E4E4E7] dark:border-[#27272A] sm:pl-5 pt-2 sm:pt-0 space-y-1">
              <span class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] block font-medium">Sisa Total Anggaran</span>
              <span class="text-sm sm:text-base font-bold text-[#09090B] dark:text-[#F4F4F5] block">${maskedTotalRemaining}</span>
              <span class="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block">dari total plafon ${maskedTotalBudget}</span>
            </div>

          </div>
        </div>
      </section>
    `;

    renderIcons(this.container);
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.container.innerHTML = '';
  }
}

export function createDailyBurnRate(options) {
  return new DailyBurnRate(options);
}
