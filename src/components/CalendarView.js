// src/components/CalendarView.js
import { store, getState, subscribe, setSelectedMonth, setSelectedDate } from '../state/store.js';
import { renderIcons } from '../utils/icons.js';

/**
 * Komponen CalendarView: Kalender bulanan interaktif dalam format grid (Minggu - Sabtu)
 * dengan indikator titik transaksi dan pemilihan tanggal mutasi.
 * Menggunakan selektor tanggal aktif berbasis pill animasi halus tanpa unmount / re-render grid.
 */
export class CalendarView {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM tempat CalendarView dirender.
   * @param {(selectedMonth: string) => void} [options.onMonthChange] - Callback saat bulan berganti.
   * @param {(selectedDate: string | null) => void} [options.onDateSelect] - Callback saat tanggal diklik.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[CalendarView] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.onMonthChange = options.onMonthChange || (() => {});
    this.onDateSelect = options.onDateSelect || (() => {});

    this.renderedMonth = null;
    this.renderedSelectedDate = null;
    this.renderedTxCount = null;
    this.renderedTxIds = null;

    // Render struktur awal
    this.render();

    // Langganan pembaruan state store
    this.unsubscribe = subscribe(() => {
      const state = getState();
      const currentMonth = state.selectedMonth || new Date().toISOString().slice(0, 7);
      const txs = state.transactions || [];
      const txCount = txs.length;
      const txIds = txs.map((t) => `${t.id}:${t.amount}:${t.date}`).join(',');

      // Re-render struktur tabel hanya jika bulan berubah atau mutasi data transaksi berubah
      if (currentMonth !== this.renderedMonth || txCount !== this.renderedTxCount || txIds !== this.renderedTxIds) {
        this.render();
      } else if (state.selectedDate !== this.renderedSelectedDate) {
        // HANYA tanggal aktif yang berubah: gerakkan pill selektor tanpa flicker / unmount kalender
        this.updateSelectedDate(state.selectedDate);
      }
    });

    // Resize listener agar selektor pill tetap presisi saat window berubah ukuran
    this.handleResize = () => {
      this.positionPill(this.renderedSelectedDate, true);
    };
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Menggeser periode bulan terpilih maju (+1) atau mundur (-1).
   * @param {number} offset
   */
  shiftMonth(offset) {
    const state = getState();
    const currentSelected = state.selectedMonth || new Date().toISOString().slice(0, 7);
    const [year, month] = currentSelected.split('-').map(Number);

    const targetDate = new Date(year, month - 1 + offset, 1);
    const newYear = targetDate.getFullYear();
    const newMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
    const newMonthStr = `${newYear}-${newMonth}`;

    setSelectedMonth(newMonthStr);
    setSelectedDate(null); // Reset filter tanggal saat ganti bulan
    this.onMonthChange(newMonthStr);
  }

  /**
   * Mengembalikan periode ke bulan berjalan saat ini.
   */
  resetToCurrentMonth() {
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    setSelectedMonth(currentMonthStr);
    setSelectedDate(null);
    this.onMonthChange(currentMonthStr);
  }

  /**
   * Menempatkan posisi pill selektor hitam pada sel tanggal aktif.
   * @param {string | null} dateStr
   * @param {boolean} [immediate=false]
   */
  positionPill(dateStr, immediate = false) {
    const pill = this.container.querySelector('#calendar-active-pill');
    if (!pill) return;

    if (!dateStr) {
      pill.style.opacity = '0';
      return;
    }

    const targetCell = this.container.querySelector(`[data-calendar-date="${dateStr}"]`);
    if (!targetCell) {
      pill.style.opacity = '0';
      return;
    }

    const left = targetCell.offsetLeft;
    const top = targetCell.offsetTop;
    const width = targetCell.offsetWidth;
    const height = targetCell.offsetHeight;

    if (width === 0 || height === 0) {
      requestAnimationFrame(() => this.positionPill(dateStr, immediate));
      return;
    }

    if (immediate) {
      pill.style.transition = 'none';
      pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      pill.style.width = `${width}px`;
      pill.style.height = `${height}px`;
      pill.style.opacity = '1';
      void pill.offsetHeight;
      pill.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), width 200ms ease, height 200ms ease, opacity 180ms ease';
    } else {
      pill.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), width 200ms ease, height 200ms ease, opacity 180ms ease';
      pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      pill.style.width = `${width}px`;
      pill.style.height = `${height}px`;
      pill.style.opacity = '1';
    }
  }

  /**
   * Memperbarui visual tanggal aktif secara parsial tanpa menyentuh DOM grid kalender.
   * @param {string | null} newDate
   * @param {boolean} [immediate=false]
   */
  updateSelectedDate(newDate, immediate = false) {
    this.renderedSelectedDate = newDate;

    // Gerakkan selektor pill hitam halus
    this.positionPill(newDate, immediate);

    // Perbarui kontras angka tanggal dan titik indikator transaksi
    const cells = this.container.querySelectorAll('[data-calendar-date]');
    cells.forEach((cell) => {
      const isTarget = cell.getAttribute('data-calendar-date') === newDate;
      const numEl = cell.querySelector('.day-num');
      const dotExpense = cell.querySelector('.dot-expense');
      const dotIncome = cell.querySelector('.dot-income');

      if (isTarget) {
        if (numEl) {
          numEl.className = 'day-num text-xs sm:text-sm leading-none font-extrabold text-white dark:text-[#09090B]';
        }
        if (dotExpense) dotExpense.className = 'dot-expense w-1.5 h-1.5 rounded-full bg-rose-200';
        if (dotIncome) dotIncome.className = 'dot-income w-1.5 h-1.5 rounded-full bg-emerald-200';
      } else {
        if (numEl) {
          numEl.className = 'day-num text-xs sm:text-sm leading-none font-medium text-[#09090B] dark:text-[#F4F4F5]';
        }
        if (dotExpense) dotExpense.className = 'dot-expense w-1.5 h-1.5 rounded-full bg-rose-500';
        if (dotIncome) dotIncome.className = 'dot-income w-1.5 h-1.5 rounded-full bg-emerald-500';
      }
    });

    // Perbarui banner indikator filter tanggal
    const banner = this.container.querySelector('#calendar-filter-banner');
    if (banner) {
      if (newDate) {
        banner.classList.remove('hidden');
        banner.innerHTML = `
          <span class="text-[#09090B] dark:text-[#F4F4F5] font-semibold flex items-center gap-1.5">
            <i data-lucide="filter" class="w-3.5 h-3.5"></i>
            Menampilkan mutasi tanggal: <strong>${newDate}</strong>
          </span>
          <button
            id="btn-clear-date-filter"
            type="button"
            class="text-[#09090B] dark:text-[#F4F4F5] hover:underline font-bold cursor-pointer"
          >
            Tampilkan Semua Bulan Ini
          </button>
        `;
        renderIcons(banner);
        banner.querySelector('#btn-clear-date-filter')?.addEventListener('click', () => {
          setSelectedDate(null);
          this.onDateSelect(null);
        });
      } else {
        banner.classList.add('hidden');
        banner.innerHTML = '';
      }
    }
  }

  /**
   * Menghubungkan event listener tombol navigasi dan klik sel kalender.
   */
  attachEvents() {
    // Tombol Navigasi Bulan
    this.container.querySelector('#btn-prev-month')?.addEventListener('click', () => this.shiftMonth(-1));
    this.container.querySelector('#btn-next-month')?.addEventListener('click', () => this.shiftMonth(1));
    this.container.querySelector('#btn-today-month')?.addEventListener('click', () => this.resetToCurrentMonth());

    // Tombol Reset Filter Tanggal
    this.container.querySelector('#btn-clear-date-filter')?.addEventListener('click', () => {
      setSelectedDate(null);
      this.onDateSelect(null);
    });

    // Klik pada Tanggal di Grid Kalender (Hanya toggle state tanggal)
    const dateCells = this.container.querySelectorAll('[data-calendar-date]');
    dateCells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const clickedDate = cell.getAttribute('data-calendar-date');
        const state = getState();
        const newSelectedDate = state.selectedDate === clickedDate ? null : clickedDate;
        setSelectedDate(newSelectedDate);
        this.onDateSelect(newSelectedDate);
      });
    });
  }

  /**
   * Merender grid kalender bulanan lengkap.
   */
  render() {
    const state = getState();
    const currentSelected = state.selectedMonth || new Date().toISOString().slice(0, 7);
    const selectedDate = state.selectedDate;
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];

    this.renderedMonth = currentSelected;
    this.renderedSelectedDate = selectedDate;
    this.renderedTxCount = transactions.length;
    this.renderedTxIds = transactions.map((t) => `${t.id}:${t.amount}:${t.date}`).join(',');

    const [year, month] = currentSelected.split('-').map(Number);
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Minggu
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const dateObj = new Date(year, month - 1, 1);
    const formattedLabel = new Intl.DateTimeFormat('id-ID', {
      month: 'long',
      year: 'numeric',
    }).format(dateObj);

    const isCurrentMonth = currentSelected === todayStr.slice(0, 7);

    // Kumpulkan tanggal yang memiliki transaksi
    const dateTxMap = {};
    transactions.forEach((tx) => {
      if (tx.date) {
        const dStr = String(tx.date).slice(0, 10);
        if (!dateTxMap[dStr]) {
          dateTxMap[dStr] = { count: 0, hasExpense: false, hasIncome: false };
        }
        dateTxMap[dStr].count += 1;
        if (tx.type === 'expense') dateTxMap[dStr].hasExpense = true;
        if (tx.type === 'income') dateTxMap[dStr].hasIncome = true;
      }
    });

    // Hari dalam sepekan (Minggu sampai Sabtu)
    const weekDays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    this.container.innerHTML = `
      <section class="bg-[#FFFFFF] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl p-4 sm:p-6 space-y-4 shadow-xs sm:shadow-sm">
        
        <!-- Header Selector Periode Bulan -->
        <div class="flex items-center justify-between pb-2 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center shrink-0">
              <i data-lucide="calendar" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-[11px] font-semibold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA] block">
                Kalender Aktivitas
              </span>
              <div class="flex items-center gap-2">
                <span class="text-base sm:text-lg font-bold text-[#09090B] dark:text-[#F4F4F5]">
                  ${formattedLabel}
                </span>
                ${
                  isCurrentMonth
                    ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Bulan Ini
                      </span>`
                    : `<button
                        id="btn-today-month"
                        type="button"
                        class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F9F9F8] hover:bg-[#E4E4E7] dark:bg-[#09090B] dark:hover:bg-[#27272A] text-[#71717A] dark:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#27272A] cursor-pointer transition-colors"
                      >
                        Bulan Ini
                      </button>`
                }
              </div>
            </div>
          </div>

          <!-- Tombol Prev / Next -->
          <div class="flex items-center gap-1 bg-[#F9F9F8] dark:bg-[#09090B] p-1 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-prev-month"
              type="button"
              title="Bulan sebelumnya"
              class="p-2 rounded-lg text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-white dark:hover:bg-[#121214] transition-colors cursor-pointer active:opacity-80 shadow-2xs"
            >
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <button
              id="btn-next-month"
              type="button"
              title="Bulan berikutnya"
              class="p-2 rounded-lg text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-white dark:hover:bg-[#121214] transition-colors cursor-pointer active:opacity-80 shadow-2xs"
            >
              <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Filter Status Tanggal Terpilih -->
        <div id="calendar-filter-banner" class="${selectedDate ? '' : 'hidden'} flex items-center justify-between px-3 py-2 bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl text-xs">
          ${
            selectedDate
              ? `
            <span class="text-[#09090B] dark:text-[#F4F4F5] font-semibold flex items-center gap-1.5">
              <i data-lucide="filter" class="w-3.5 h-3.5"></i>
              Menampilkan mutasi tanggal: <strong>${selectedDate}</strong>
            </span>
            <button
              id="btn-clear-date-filter"
              type="button"
              class="text-[#09090B] dark:text-[#F4F4F5] hover:underline font-bold cursor-pointer"
            >
              Tampilkan Semua Bulan Ini
            </button>
          `
              : ''
          }
        </div>

        <!-- Grid Kalender (Minggu - Sabtu) Tanpa Flickering -->
        <div class="space-y-2">
          <!-- Nama Hari -->
          <div class="grid grid-cols-7 gap-1 text-center text-xs font-bold text-[#71717A] dark:text-[#A1A1AA] py-1">
            ${weekDays.map((d, i) => `<div class="${i === 0 ? 'text-rose-500' : ''}">${d}</div>`).join('')}
          </div>

          <!-- Sel Hari Grid dengan Pill Penanda Aktif Melayang Halus -->
          <div id="calendar-grid-cells" class="relative grid grid-cols-7 gap-1">
            <!-- Indikator Pill Aktif Melayang Mulus (Liquid Pill) -->
            <div
              id="calendar-active-pill"
              class="absolute pointer-events-none rounded-xl bg-[#09090B] dark:bg-white shadow-sm ring-2 ring-zinc-900 dark:ring-white z-0 opacity-0"
              style="transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), width 200ms ease, height 200ms ease, opacity 180ms ease;"
            ></div>

            <!-- Slot Kosong Sebelum Tanggal 1 -->
            ${Array.from({ length: firstDayIndex })
              .map(() => `<div class="h-10 sm:h-12 rounded-xl bg-transparent"></div>`)
              .join('')}

            <!-- Hari-hari dalam Bulan Ini -->
            ${Array.from({ length: totalDaysInMonth })
              .map((_, i) => {
                const dayNum = i + 1;
                const dStr = `${currentSelected}-${String(dayNum).padStart(2, '0')}`;
                const isToday = dStr === todayStr;
                const isSelected = dStr === selectedDate;
                const txInfo = dateTxMap[dStr];

                let cellClass =
                  'h-10 sm:h-12 rounded-xl flex flex-col items-center justify-center relative cursor-pointer select-none z-10 transition-colors duration-150 ';

                if (isToday) {
                  cellClass +=
                    'border-2 border-[#09090B] dark:border-white bg-[#F9F9F8] dark:bg-[#121214] font-bold ';
                } else {
                  cellClass +=
                    'hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] ';
                }

                return `
                <div
                  data-calendar-date="${dStr}"
                  class="${cellClass}"
                  title="${dStr}${txInfo ? ` (${txInfo.count} transaksi)` : ''}"
                >
                  <span class="day-num text-xs sm:text-sm leading-none transition-colors duration-150 ${isSelected ? 'font-extrabold text-white dark:text-[#09090B]' : 'font-medium text-[#09090B] dark:text-[#F4F4F5]'}">${dayNum}</span>
                  
                  <!-- Titik Indikator Transaksi -->
                  ${
                    txInfo
                      ? `
                    <div class="tx-dots flex items-center gap-0.5 mt-1">
                      ${
                        txInfo.hasExpense
                          ? `<span class="dot-expense w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-rose-200' : 'bg-rose-500'}"></span>`
                          : ''
                      }
                      ${
                        txInfo.hasIncome
                          ? `<span class="dot-income w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-emerald-500'}"></span>`
                          : ''
                      }
                    </div>
                  `
                      : '<div class="h-1.5"></div>'
                  }
                </div>
              `;
              })
              .join('')}
          </div>
        </div>

      </section>
    `;

    renderIcons(this.container);
    this.attachEvents();

    // Posisikan pill selektor secara instan saat pertama kali dimount
    if (selectedDate) {
      this.positionPill(selectedDate, true);
    }
  }

  /**
   * Cleanup saat komponen di-unmount.
   */
  destroy() {
    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
    }
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.container.innerHTML = '';
  }
}

/**
 * Factory helper untuk inisialisasi CalendarView.
 * @param {Object} options
 * @returns {CalendarView}
 */
export function createCalendarView(options) {
  return new CalendarView(options);
}
