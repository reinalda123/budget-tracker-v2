// src/components/ReportView.js
import Chart from 'chart.js/auto';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { store, getState, subscribe } from '../state/store.js';
import { formatRupiah, maskValue } from '../utils/formatters.js';
import { formatDateIndo } from '../utils/dates.js';
import { renderIcons } from '../utils/icons.js';

const PALETTE_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#14b8a6', // Teal
  '#84cc16', // Lime
];

/**
 * Komponen ReportView: Analisis finansial bulanan dengan Diagram Donut (Chart.js),
 * rincian alokasi pengeluaran per kategori, dan ekspor laporan dokumen PDF A4.
 */
export class ReportView {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Elemen DOM tempat ReportView dirender.
   */
  constructor(options) {
    if (!options || !options.container) {
      throw new Error('[ReportView] Opsi container wajib disertakan.');
    }

    this.container = options.container;
    this.chartInstance = null;

    // Langganan pembaruan state store
    this.unsubscribe = subscribe(() => this.render());

    this.render();
  }

  /**
   * Merender diagram Donut Chart, rincian pos pengeluaran, dan tombol ekspor PDF.
   */
  render() {
    const state = getState();
    const isMasked = Boolean(state.isMasked);
    const selectedMonth = state.selectedMonth || new Date().toISOString().slice(0, 7);
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];

    // Filter transaksi untuk bulan yang dipilih
    const monthTx = transactions.filter((t) => {
      if (!t.date) return false;
      return String(t.date).slice(0, 7) === selectedMonth;
    });

    // Hitung total pemasukan, pengeluaran, selisih arus kas, dan saldo seluruh dompet
    const totalIncome = monthTx
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const totalExpense = monthTx
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const netSavings = totalIncome - totalExpense;
    const totalBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

    // Hitung label periode dan tanggal cetak untuk template dokumen PDF
    const monthDate = new Date(`${selectedMonth}-01T00:00:00`);
    const periodLabel = formatDateIndo(monthDate, { month: 'long', year: 'numeric' }) || selectedMonth;
    const printDateLabel = formatDateIndo(new Date(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Hitung agregat pengeluaran per pos kategori
    const categoryExpenseMap = {};
    monthTx
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const catName = t.category || 'Lainnya';
        categoryExpenseMap[catName] = (categoryExpenseMap[catName] || 0) + (Number(t.amount) || 0);
      });

    // Jika belum ada pengeluaran di transaksi, ambil dari kategori.spent sebagai fallback representasi
    if (totalExpense === 0 && categories.length > 0) {
      categories.forEach((c) => {
        if ((Number(c.spent) || 0) > 0) {
          categoryExpenseMap[c.name] = Number(c.spent);
        }
      });
    }

    // Urutkan kategori berdasarkan pengeluaran terbesar
    const sortedCategories = Object.entries(categoryExpenseMap)
      .map(([name, amount], index) => ({
        name,
        amount,
        percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
        color: PALETTE_COLORS[index % PALETTE_COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount);

    const maskedIncome = maskValue(formatRupiah(totalIncome), isMasked);
    const maskedExpense = maskValue(formatRupiah(totalExpense), isMasked);
    const maskedNet = maskValue(formatRupiah(Math.abs(netSavings)), isMasked);

    this.container.innerHTML = `
      <section class="bg-[#FFFFFF] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl p-5 sm:p-7 space-y-6">
        
        <!-- Header Laporan Responsif -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div>
            <h3 class="text-xl font-bold tracking-tight text-[#09090B] dark:text-[#F4F4F5] flex items-center gap-2">
              <i data-lucide="pie-chart" class="w-5 h-5 text-[#09090B] dark:text-[#F4F4F5]"></i>
              Laporan Distribusi Pengeluaran
            </h3>
            <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
              Visualisasi proporsi anggaran dan arus kas periode terpilih (${periodLabel})
            </p>
          </div>

          <!-- Tombol Unduh PDF Responsif (Adaptif) -->
          <button
            id="btn-download-pdf"
            type="button"
            class="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] active:scale-95 text-white dark:text-[#09090B] text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <i data-lucide="download" class="w-4 h-4"></i>
            <span id="btn-download-pdf-text">Unduh PDF</span>
          </button>
        </div>

        <!-- Kartu Metrik Arus Kas: Pemasukan vs Pengeluaran (Soft Sage & Soft Dusty Rose) -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <!-- Total Pemasukan -->
          <div class="p-4 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/20 dark:border-emerald-900/50 space-y-1">
            <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i> Total Pemasukan
            </span>
            <p class="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
              + ${maskedIncome}
            </p>
          </div>

          <!-- Total Pengeluaran -->
          <div class="p-4 rounded-xl bg-rose-500/10 dark:bg-rose-950/30 border border-rose-500/20 dark:border-rose-900/50 space-y-1">
            <span class="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i> Total Pengeluaran
            </span>
            <p class="text-lg sm:text-xl font-extrabold text-rose-700 dark:text-rose-400">
              - ${maskedExpense}
            </p>
          </div>

          <!-- Arus Kas Bersih (Net) -->
          <div class="p-4 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] space-y-1">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA]">
              Arus Kas Bersih
            </span>
            <p class="text-lg sm:text-xl font-extrabold ${netSavings >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}">
              ${netSavings < 0 ? '- ' : '+ '}${maskedNet}
            </p>
          </div>
        </div>

        <!-- Diagram Donut & Rincian Kategori -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
          
          <!-- Sisi Kiri: Canvas Diagram Donut -->
          <div class="lg:col-span-5 flex flex-col items-center justify-center relative">
            <div class="w-64 h-64 sm:w-72 sm:h-72 relative">
              <canvas id="report-donut-chart"></canvas>
              
              <!-- Teks Tengah Donut -->
              <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-4">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Pengeluaran
                </span>
                <span class="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                  ${maskedExpense}
                </span>
              </div>
            </div>
          </div>

          <!-- Sisi Kanan: Daftar Rincian Kategori -->
          <div class="lg:col-span-7 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 pb-1">
              Rincian Pos Kategori (% & Nominal)
            </h4>

            ${
              sortedCategories.length === 0
                ? `
              <div class="py-8 text-center text-slate-400 text-xs">
                Belum ada data pengeluaran yang tercatat pada periode ini.
              </div>
            `
                : sortedCategories
                    .map((item) => {
                      const maskedCatAmount = maskValue(formatRupiah(item.amount), isMasked);

                      return `
                      <div class="p-3 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B]/50 border border-[#E4E4E7] dark:border-[#27272A] space-y-1.5 hover:bg-[#F4F4F5] dark:hover:bg-[#121214] transition-colors">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2.5">
                            <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${item.color};"></span>
                            <span class="text-sm font-semibold text-[#09090B] dark:text-[#F4F4F5]">
                              ${maskValue(item.name, isMasked, '••••••••')}
                            </span>
                          </div>
                          <div class="text-right">
                            <span class="text-xs sm:text-sm font-bold text-[#09090B] dark:text-[#F4F4F5]">
                              ${maskedCatAmount}
                            </span>
                            <span class="text-[11px] font-semibold text-[#71717A] dark:text-[#A1A1AA] ml-1.5">
                              (${item.percentage}%)
                            </span>
                          </div>
                        </div>

                        <!-- Progress Bar Kecil -->
                        <div class="w-full h-1.5 rounded-full bg-[#E4E4E7] dark:bg-[#27272A] overflow-hidden">
                          <div class="h-full rounded-full" style="width: ${item.percentage}%; background-color: ${item.color};"></div>
                        </div>
                      </div>
                    `;
                    })
                    .join('')
            }
          </div>

        </div>

      </section>

      <!-- Kontainer Template PDF (Off-Screen tapi tetap di dalam area render) -->
      <div
        id="report-pdf-template"
        style="position: absolute; top: 0; left: 0; z-index: -50; opacity: 0; pointer-events: none; width: 794px; background-color: #ffffff; color: #0f172a; padding: 32px; box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
      >
        <!-- 1. Header Dokumen -->
        <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div style="display: inline-block; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; background-color: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px; border: 1px solid #c7d2fe; margin-bottom: 6px;">
              Budget Tracker Pro
            </div>
            <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em;">Laporan Keuangan Bulanan</h1>
            <p style="font-size: 13px; font-weight: 600; color: #475569; margin: 4px 0 0 0;">
              Periode: <span style="color: #4338ca; font-weight: 700;">${periodLabel}</span>
            </p>
          </div>
          <div style="text-align: right; font-size: 11px; color: #64748b; line-height: 1.5;">
            <p style="margin: 0;">Tanggal Cetak: <span style="font-weight: 600; color: #334155;">${printDateLabel}</span></p>
            <p style="margin: 0; font-size: 10px; color: #94a3b8;">Dokumen Ekspor Digital</p>
          </div>
        </div>

        <!-- 2. Ringkasan Eksekutif (4 Kotak Metrik) -->
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 10px 0;">Ringkasan Eksekutif</h2>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
            <!-- Total Pemasukan -->
            <div style="padding: 14px; border-radius: 12px; border: 1px solid #bbf7d0; background-color: #f0fdf4;">
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #15803d; display: block;">Total Pemasukan</span>
              <p style="font-size: 14px; font-weight: 800; color: #166534; margin: 4px 0 0 0;">+ ${formatRupiah(totalIncome)}</p>
            </div>

            <!-- Total Pengeluaran -->
            <div style="padding: 14px; border-radius: 12px; border: 1px solid #fecdd3; background-color: #fff1f2;">
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #b91c1c; display: block;">Total Pengeluaran</span>
              <p style="font-size: 14px; font-weight: 800; color: #991b1b; margin: 4px 0 0 0;">- ${formatRupiah(totalExpense)}</p>
            </div>

            <!-- Selisih Arus Kas -->
            <div style="padding: 14px; border-radius: 12px; border: 1px solid #e2e8f0; background-color: #f8fafc;">
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; display: block;">Selisih Arus Kas</span>
              <p style="font-size: 14px; font-weight: 800; color: ${netSavings >= 0 ? '#4338ca' : '#b91c1c'}; margin: 4px 0 0 0;">
                ${netSavings < 0 ? '- ' : '+ '}${formatRupiah(Math.abs(netSavings))}
              </p>
            </div>

            <!-- Total Saldo Dompet -->
            <div style="padding: 14px; border-radius: 12px; border: 1px solid #c7d2fe; background-color: #eef2ff;">
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4338ca; display: block;">Total Saldo Dompet</span>
              <p style="font-size: 14px; font-weight: 800; color: #312e81; margin: 4px 0 0 0;">${formatRupiah(totalBalance)}</p>
            </div>
          </div>
        </div>

        <!-- 3. Tabel Rekapitulasi Kategori -->
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 10px 0;">Rekapitulasi Pengeluaran per Kategori</h2>
          <table style="width: 100%; text-align: left; border-collapse: collapse; border: 1px solid #cbd5e1; font-size: 12px;">
            <thead>
              <tr style="background-color: #f1f5f9; color: #334155; font-weight: 700; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 8px 10px; width: 40px; text-align: center; border-right: 1px solid #cbd5e1;">No</th>
                <th style="padding: 8px 10px; border-right: 1px solid #cbd5e1;">Kategori Pengeluaran</th>
                <th style="padding: 8px 10px; text-align: right; border-right: 1px solid #cbd5e1;">Total Nominal (Rp)</th>
                <th style="padding: 8px 10px; width: 90px; text-align: right;">Persentase</th>
              </tr>
            </thead>
            <tbody>
              ${
                sortedCategories.length === 0
                  ? `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8; font-style: italic;">Tidak ada catatan pengeluaran pada periode ini</td></tr>`
                  : sortedCategories
                      .map(
                        (cat, idx) => `
                      <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 8px 10px; text-align: center; color: #64748b; border-right: 1px solid #cbd5e1;">${idx + 1}</td>
                        <td style="padding: 8px 10px; font-weight: 600; color: #1e293b; border-right: 1px solid #cbd5e1;">${cat.name}</td>
                        <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${formatRupiah(cat.amount)}</td>
                        <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: #4338ca;">${cat.percentage}%</td>
                      </tr>
                    `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>

        <!-- 4. Tabel Riwayat Mutasi -->
        <div>
          <h2 style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 10px 0;">Riwayat Mutasi Transaksi</h2>
          <table style="width: 100%; text-align: left; border-collapse: collapse; border: 1px solid #cbd5e1; font-size: 12px;">
            <thead>
              <tr style="background-color: #f1f5f9; color: #334155; font-weight: 700; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 8px 10px; width: 95px; border-right: 1px solid #cbd5e1;">Tanggal</th>
                <th style="padding: 8px 10px; width: 140px; border-right: 1px solid #cbd5e1;">Dompet</th>
                <th style="padding: 8px 10px; width: 130px; border-right: 1px solid #cbd5e1;">Kategori</th>
                <th style="padding: 8px 10px; border-right: 1px solid #cbd5e1;">Keterangan</th>
                <th style="padding: 8px 10px; text-align: right; width: 120px;">Nominal</th>
              </tr>
            </thead>
            <tbody>
              ${
                monthTx.length === 0
                  ? `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #94a3b8; font-style: italic;">Tidak ada riwayat transaksi pada periode ini</td></tr>`
                  : monthTx
                      .map((tx) => {
                        const dateFormatted = formatDateIndo(tx.date, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        });
                        const isInc = tx.type === 'income';
                        return `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                          <td style="padding: 8px 10px; color: #475569; border-right: 1px solid #cbd5e1; white-space: nowrap;">${dateFormatted}</td>
                          <td style="padding: 8px 10px; font-weight: 500; color: #334155; border-right: 1px solid #cbd5e1;">${tx.accountName || 'Dompet Utama'}</td>
                          <td style="padding: 8px 10px; color: #334155; border-right: 1px solid #cbd5e1;">${tx.category || '-'}</td>
                          <td style="padding: 8px 10px; color: #475569; border-right: 1px solid #cbd5e1;">${tx.note || '-'}</td>
                          <td style="padding: 8px 10px; text-align: right; font-weight: 700; white-space: nowrap; color: ${isInc ? '#15803d' : '#b91c1c'};">
                            ${isInc ? '+ ' : '- '}${formatRupiah(tx.amount)}
                          </td>
                        </tr>
                      `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>

        <!-- Footer Dokumen -->
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8;">
          <span>Budget Tracker - Laporan Finansial Mandiri</span>
          <span>Dicetak otomatis via browser</span>
        </div>
      </div>
    `;

    renderIcons(this.container);

    // Inisialisasi Chart.js Donut
    this.renderDonutChart(sortedCategories, isMasked);

    // Hubungkan event listener unduh PDF langsung (html-to-image + jsPDF)
    this.attachEvents(selectedMonth);
  }

  /**
   * Menghubungkan interaksi tombol ekspor PDF langsung dengan html-to-image dan jsPDF.
   * @param {string} selectedMonth
   */
  attachEvents(selectedMonth) {
    const downloadBtn = this.container.querySelector('#btn-download-pdf');
    const downloadBtnText = this.container.querySelector('#btn-download-pdf-text');

    const handleDownloadPDF = async () => {
      const element = document.getElementById('report-pdf-template');
      if (!element) {
        console.error('Elemen template tidak ditemukan');
        return;
      }

      const setIsExporting = (loading) => {
        if (downloadBtn) downloadBtn.disabled = loading;
        if (downloadBtnText) downloadBtnText.textContent = loading ? 'Membuat PDF...' : 'Unduh PDF';
      };

      try {
        setIsExporting(true);

        // Tampilkan elemen sesaat ke opacity 1 untuk snapshot
        element.style.opacity = '1';

        // Render ke JPEG dengan kompresi quality 0.85 dan pixelRatio 1.5
        const dataUrl = await toJpeg(element, {
          quality: 0.85,
          pixelRatio: 1.5,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });

        // Kembalikan opacity ke 0
        element.style.opacity = '0';

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve) => (img.onload = resolve));

        const imgWidth = pageWidth;
        const imgHeight = (img.height * pageWidth) / img.width;

        pdf.addImage(dataUrl, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight), undefined, 'FAST');
        pdf.save(`Laporan_Keuangan_${selectedMonth || new Date().toISOString().slice(0, 7)}.pdf`);
      } catch (err) {
        console.error('Gagal membuat PDF:', err);
        alert('Gagal memproses ekspor PDF: ' + (err?.message || err));
      } finally {
        if (element) element.style.opacity = '0';
        setIsExporting(false);
        renderIcons(this.container);
      }
    };

    downloadBtn?.addEventListener('click', handleDownloadPDF);
  }

  /**
   * Merender chart instance Chart.js
   * @param {Array<Object>} sortedCategories
   * @param {boolean} isMasked
   */
  renderDonutChart(sortedCategories, isMasked) {
    const canvas = this.container.querySelector('#report-donut-chart');
    if (!canvas) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    const labels = sortedCategories.map((c) => maskValue(c.name, isMasked, '••••••••'));
    const dataValues = sortedCategories.map((c) => c.amount);
    const bgColors = sortedCategories.map((c) => c.color);

    // Jika data kosong, tampilkan placeholder ring kosong
    const chartData = dataValues.length > 0 ? dataValues : [1];
    const chartColors = dataValues.length > 0 ? bgColors : ['#e2e8f0'];

    this.chartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: dataValues.length > 0 ? labels : ['Belum ada pengeluaran'],
        datasets: [
          {
            data: chartData,
            backgroundColor: chartColors,
            borderWidth: 2,
            borderColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                if (dataValues.length === 0) return ' Tidak ada data';
                const label = context.label || '';
                const val = context.raw || 0;
                return ` ${label}: ${maskValue(formatRupiah(val), isMasked)}`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Cleanup saat komponen di-unmount.
   */
  destroy() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.container.innerHTML = '';
  }
}

/**
 * Factory helper untuk inisialisasi ReportView.
 * @param {Object} options
 * @returns {ReportView}
 */
export function createReportView(options) {
  return new ReportView(options);
}

