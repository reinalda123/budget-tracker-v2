// src/components/Modals.js
import { store, getState, setState, transferBalance, addCategory, updateCategoryBudget, updateWalletName, addAccount, deleteTransaction, triggerImmediateSync } from '../state/store.js';
import { compressReceiptImage } from '../services/scanner.js';
import { scanReceiptWithAI } from '../services/api.js';
import { login } from '../services/auth.js';
import { formatRupiah } from '../utils/formatters.js';
import { formatDateIndo } from '../utils/dates.js';
import { renderIcons } from '../utils/icons.js';

const modalRoot = () => document.querySelector('#modal-root');

/**
 * Menutup modal aktif dan membersihkan kontainer modal.
 */
export function closeModal() {
  const root = modalRoot();
  if (root) {
    root.innerHTML = '';
  }
}

/**
 * Menampilkan Modal Tambah Transaksi Manual atau Verifikasi Hasil Scan Struk AI
 * @param {Object} [options]
 * @param {Object} [options.initialData] - Data terisi otomatis jika berasal dari Scan Struk AI
 * @param {() => void} [options.onSuccess]
 */
export function openTransactionModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  const state = getState();
  const accounts = state.accounts || [];
  const categories = state.categories || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  const initialData = options.initialData || null;
  const isFromScan = !!initialData;
  const initialType = initialData?.type || 'expense';
  const initialAmount = (initialData?.amount !== undefined && initialData?.amount !== null && initialData?.amount > 0)
    ? String(initialData.amount)
    : '';
  const initialDate = initialData?.date || todayStr;
  const rawCategory = (initialData?.category || '').trim();
  const initialNote = initialData
    ? (initialData.merchant
        ? (initialData.notes ? `${initialData.merchant} - ${initialData.notes}` : initialData.merchant)
        : (initialData.notes || ''))
    : '';

  // Mencocokkan kategori AI dengan master kategori aplikasi
  const matchingCat = categories.find(
    (c) => c.name.toLowerCase() === rawCategory.toLowerCase() ||
           c.name.toLowerCase().includes(rawCategory.toLowerCase()) ||
           (rawCategory && rawCategory.toLowerCase().includes(c.name.toLowerCase()))
  );
  const selectedCatName = matchingCat ? matchingCat.name : (rawCategory || 'Lainnya');

  // Siapkan opsi kategori dropdown
  const categoryOptionsHtml = [
    (!matchingCat && rawCategory && rawCategory !== 'Lainnya')
      ? `<option value="${rawCategory}" selected>${rawCategory} (AI)</option>`
      : '',
    ...categories.map((c) => {
      const isSel = c.name === selectedCatName;
      return `<option value="${c.name}" ${isSel ? 'selected' : ''}>${c.name}</option>`;
    }),
    `<option value="Lainnya" ${selectedCatName === 'Lainnya' ? 'selected' : ''}>Lainnya</option>`,
  ].filter(Boolean).join('');

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-lg w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl ${isFromScan ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5]'} flex items-center justify-center">
              <i data-lucide="${isFromScan ? 'sparkles' : 'plus'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-[#09090B] dark:text-[#F4F4F5]">
                ${isFromScan ? 'Verifikasi Transaksi Struk (AI)' : 'Catat Transaksi Manual'}
              </h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                ${isFromScan ? 'Data struk otomatis terisi oleh Gemini Flash. Tinjau sebelum disimpan.' : 'Masukkan detail mutasi pengeluaran atau pemasukan'}
              </p>
            </div>
          </div>
          <button id="btn-close-modal" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        ${isFromScan ? `
        <!-- Info Ringkasan Struk Gemini AI -->
        <div class="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-[#E4E4E7] dark:border-[#27272A]">
          ${initialData.receiptImage ? `<img src="${initialData.receiptImage}" alt="Struk" class="w-12 h-12 object-cover rounded-lg border border-[#E4E4E7] dark:border-[#27272A] shrink-0 shadow-xs">` : `<div class="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[#71717A] dark:text-[#A1A1AA] flex items-center justify-center shrink-0"><i data-lucide="receipt" class="w-6 h-6"></i></div>`}
          <div class="min-w-0 flex-1 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span class="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                ✓ Gemini Flash Ekstraksi Berhasil
              </span>
            </div>
            <p class="text-[#09090B] dark:text-[#F4F4F5] font-medium truncate mt-0.5">
              ${initialData.merchant ? `Toko: <strong>${initialData.merchant}</strong>` : 'Data struk telah terisi otomatis'}
              ${initialData.notes ? ` • ${initialData.notes}` : ''}
            </p>
            <p class="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">Periksa nominal dan data transaksi di bawah sebelum menyimpan.</p>
          </div>
        </div>
        ` : ''}

        <!-- Form Input Transaksi -->
        <form id="form-transaction" class="space-y-4">
          
          <!-- Tipe Transaksi: Pengeluaran / Pemasukan -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Tipe Transaksi</label>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer ${initialType === 'expense' ? 'border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA]'} font-bold text-sm transition-all">
                <input type="radio" name="tx_type" value="expense" ${initialType === 'expense' ? 'checked' : ''} class="hidden">
                <i data-lucide="arrow-down-left" class="w-4 h-4"></i> Pengeluaran
              </label>
              <label class="flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer ${initialType === 'income' ? 'border-emerald-600/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA]'} font-bold text-sm transition-all">
                <input type="radio" name="tx_type" value="income" ${initialType === 'income' ? 'checked' : ''} class="hidden">
                <i data-lucide="arrow-up-right" class="w-4 h-4"></i> Pemasukan
              </label>
            </div>
          </div>

          <!-- Input Nominal -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Nominal (Rp)</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm">Rp</span>
              <input
                id="tx_amount"
                type="number"
                step="any"
                min="0"
                required
                value="${initialAmount}"
                placeholder="0"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#09090B] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-lg placeholder-zinc-300 dark:placeholder-zinc-600 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              >
            </div>
          </div>

          <!-- Kategori & Rekening Sumber -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Pos Kategori</label>
              <select
                id="tx_category"
                required
                class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
              >
                ${categoryOptionsHtml}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Rekening / Dompet</label>
              <select
                id="tx_account"
                required
                class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
              >
                ${accounts.length > 0
                  ? accounts.map((a, idx) => `<option value="${a.id}" ${idx === 0 ? 'selected' : ''}>${a.name} (${a.provider || 'Bank'})</option>`).join('')
                  : '<option value="acc-main" selected>Dompet Utama (Tunai)</option>'}
              </select>
            </div>
          </div>

          <!-- Tanggal & Catatan -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Tanggal</label>
              <input
                id="tx_date"
                type="date"
                required
                value="${initialDate}"
                class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
              >
            </div>

            <div>
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Catatan</label>
              <input
                id="tx_note"
                type="text"
                required
                value="${initialNote}"
                placeholder="Contoh: Makan siang tim"
                class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm bg-[#FFFFFF] dark:bg-[#09090B] placeholder-zinc-300 dark:placeholder-zinc-600 outline-none"
              >
            </div>
          </div>

          <!-- Tombol Aksi Submit -->
          <div class="pt-3 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-tx"
              type="button"
              class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              id="btn-save-verification"
              type="submit"
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85 flex items-center gap-2"
            >
              <i data-lucide="check" class="w-4 h-4"></i>
              <span>Simpan Transaksi</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  // Setup radio tipe transaksi toggle visual
  const radioLabels = root.querySelectorAll('input[name="tx_type"]');
  radioLabels.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const isExpense = e.target.value === 'expense';
      const expenseLabel = root.querySelector('input[value="expense"]').parentElement;
      const incomeLabel = root.querySelector('input[value="income"]').parentElement;

      if (isExpense) {
        expenseLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-400 font-bold text-sm transition-all';
        incomeLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm cursor-pointer transition-all';
      } else {
        incomeLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer border-emerald-600/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-sm transition-all';
        expenseLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm cursor-pointer transition-all';
      }
    });
  });

  // Tombol Close
  root.querySelector('#btn-close-modal')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-tx')?.addEventListener('click', closeModal);
  root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
      closeModal();
    }
  });

  const form = root.querySelector('#form-transaction');
  let isSaving = false;

  /**
   * Fungsi inti penyimpanan dan verifikasi transaksi
   * @param {Event} [e]
   */
  const handleSaveVerification = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (isSaving) return;
    isSaving = true;

    console.log('[handleSaveVerification] Tombol "Simpan Transaksi" dipanggil!');

    try {
      // 1. Ambil nilai dari seluruh input form
      const typeRadio = root.querySelector('input[name="tx_type"]:checked');
      const type = typeRadio ? typeRadio.value : (initialType || 'expense');

      const amountInput = root.querySelector('#tx_amount');
      const amount = Number(amountInput?.value);

      const categorySelect = root.querySelector('#tx_category');
      const category = categorySelect?.value || selectedCatName || 'Belanja Kebutuhan';

      // Pastikan accountId valid dari dropdown
      const accountSelect = root.querySelector('#tx_account');
      let accountId = accountSelect?.value;
      if (!accountId || accountId === 'undefined' || accountId === '') {
        accountId = accounts[0]?.id || 'acc-main';
      }

      const selectedAccount = accounts.find((a) => String(a.id) === String(accountId)) || accounts[0] || { id: 'acc-main', name: 'Dompet Utama' };
      const accountName = selectedAccount.name || 'Dompet Utama';

      // Format tanggal string 'YYYY-MM-DD'
      const dateInput = root.querySelector('#tx_date');
      const rawDate = dateInput?.value || initialDate || todayStr;
      const dateFormatted = String(rawDate).slice(0, 10);

      // Catatan / nama toko
      const noteInput = root.querySelector('#tx_note');
      const notes = (noteInput?.value !== undefined && noteInput.value !== null && noteInput.value.trim() !== '')
        ? noteInput.value.trim()
        : (initialNote || initialData?.merchant || initialData?.notes || 'Transaksi Struk');
      const note = notes;

      console.log('[handleSaveVerification] Nilai payload yang diambil:', {
        type,
        amount,
        category,
        accountId,
        wallet: accountId,
        wallet_id: accountId,
        accountName,
        date: dateFormatted,
        notes,
      });

      // Validasi nominal
      if (!amount || isNaN(amount) || amount <= 0) {
        console.warn('[handleSaveVerification] Validasi gagal: nominal tidak valid ->', amountInput?.value);
        alert('Nominal harus berupa angka lebih besar dari 0.');
        isSaving = false;
        return;
      }

      // 2. Buat objek transaksi baru
      const newTx = {
        id: `tx-${Date.now()}`,
        type,
        amount,
        category,
        accountId,
        wallet_id: accountId,
        wallet: accountId,
        accountName,
        date: dateFormatted, // string format 'YYYY-MM-DD'
        notes,
        note,
        receiptImage: initialData?.receiptImage || null,
        created_at: new Date().toISOString(),
      };

      console.log('[handleSaveVerification] Objek newTx disiapkan:', newTx);

      // 3. Perbarui saldo rekening
      const currentAccounts = (getState().accounts && getState().accounts.length > 0) ? getState().accounts : accounts;
      const updatedAccounts = currentAccounts.map((a) => {
        if (String(a.id) === String(accountId)) {
          const currentBal = Number(a.balance) || 0;
          return {
            ...a,
            balance: type === 'expense' ? currentBal - amount : currentBal + amount,
          };
        }
        return a;
      });

      // 4. Perbarui pemakaian anggaran kategori jika pos pengeluaran
      const currentCategories = getState().categories || categories;
      const updatedCategories = currentCategories.map((c) => {
        if (c.name === category && type === 'expense') {
          return {
            ...c,
            spent: (Number(c.spent) || 0) + amount,
          };
        }
        return c;
      });

      // 5. Simpan transaksi ke database / state global
      const currentTxList = getState().transactions || [];
      const updatedTransactions = [newTx, ...currentTxList];

      setState({
        transactions: updatedTransactions,
        accounts: updatedAccounts,
        categories: updatedCategories,
      });

      console.log('[handleSaveVerification] State global berhasil diperbarui. Total transaksi sekarang:', updatedTransactions.length);

      // 6. Panggil refetch / update riwayat transaksi
      document.dispatchEvent(new CustomEvent('transaction-saved', { detail: newTx }));

      // 7. Tutup modal verifikasi struk dan reset form
      if (form) {
        form.reset();
      }
      closeModal();

      if (typeof options.onSuccess === 'function') {
        options.onSuccess(newTx);
      }

      console.log('[handleSaveVerification] Transaksi berhasil disimpan dan modal ditutup.');
    } catch (err) {
      console.error('[handleSaveVerification] Terjadi error saat menyimpan verifikasi transaksi:', err);
      alert('Terjadi kesalahan saat menyimpan transaksi: ' + (err.message || err));
    } finally {
      setTimeout(() => {
        isSaving = false;
      }, 500);
    }
  };

  // Pasang event listener langsung pada tombol Simpan Transaksi (onClick)
  const submitBtn = root.querySelector('#btn-save-verification') || root.querySelector('button[type="submit"]');
  submitBtn?.addEventListener('click', (e) => {
    console.log('[btn-save-verification] Event onClick tombol terpicu');
    if (form && !form.checkValidity()) {
      console.warn('[btn-save-verification] Form checkValidity() false, memicu browser validation report.');
      form.reportValidity();
      return;
    }
    handleSaveVerification(e);
  });

  // Pasang juga pada event onSubmit form
  form?.addEventListener('submit', handleSaveVerification);
}

/**
 * Menampilkan Modal Scan Struk AI (Human-in-the-Loop)
 * Alur:
 * 1. Ambil / unggah foto struk
 * 2. Kompresi gambar client-side (HTML5 canvas)
 * 3. Tampilkan animasi proses pemindaian OCR
 * 4. Tampilkan form konfirmasi agar pengguna bisa mengoreksi sebelum klik "Simpan Transaksi"
 * 
 * @param {Object} [options]
 * @param {() => void} [options.onSuccess]
 */
export function openScanReceiptModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div id="scan-card" class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-lg w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="camera" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-[#09090B] dark:text-[#F4F4F5]">Scan Struk Belanja AI</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Ekstraksi otomatis struk belanja dengan tinjauan manusia</p>
            </div>
          </div>
          <button id="btn-close-scan" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Wadah Konten Dinamis (Upload / Loading / Review) -->
        <div id="scan-step-container">
          
          <!-- Step 1: Pilihan Cara Pengambilan Foto Struk -->
          <div class="space-y-4">
            <p class="text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider text-center">
              Pilih Cara Pengambilan Foto Struk
            </p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              <!-- Tombol 1: Buka Kamera HP (capture="environment") -->
              <button
                id="btn-trigger-camera"
                type="button"
                class="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-[#E4E4E7] dark:border-[#27272A] hover:border-[#09090B] dark:hover:border-white bg-[#FFFFFF] dark:bg-[#121214] hover:bg-zinc-50 dark:hover:bg-zinc-900 text-[#09090B] dark:text-[#F4F4F5] transition-all duration-200 cursor-pointer group active:opacity-85"
              >
                <div class="w-14 h-14 rounded-2xl bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <i data-lucide="camera" class="w-7 h-7"></i>
                </div>
                <div class="text-center">
                  <span class="text-sm font-bold block text-[#09090B] dark:text-[#F4F4F5]">
                    Buka Kamera
                  </span>
                  <span class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] block mt-0.5">
                    Foto struk langsung pakai kamera HP
                  </span>
                </div>
              </button>
              <input
                type="file"
                id="camera-input"
                accept="image/*"
                capture="environment"
                class="hidden"
              >

              <!-- Tombol 2: Pilih dari Galeri / Berkas -->
              <button
                id="btn-trigger-gallery"
                type="button"
                class="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-[#E4E4E7] dark:border-[#27272A] hover:border-[#09090B] dark:hover:border-white bg-[#FFFFFF] dark:bg-[#121214] hover:bg-zinc-50 dark:hover:bg-zinc-900 text-[#09090B] dark:text-[#F4F4F5] transition-all duration-200 cursor-pointer group active:opacity-85"
              >
                <div class="w-14 h-14 rounded-2xl bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <i data-lucide="image" class="w-7 h-7"></i>
                </div>
                <div class="text-center">
                  <span class="text-sm font-bold block text-[#09090B] dark:text-[#F4F4F5]">
                    Pilih dari Galeri / Berkas
                  </span>
                  <span class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] block mt-0.5">
                    Unggah file foto struk yang sudah ada
                  </span>
                </div>
              </button>
              <input
                type="file"
                id="gallery-input"
                accept="image/*"
                class="hidden"
              >

            </div>

            <div class="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] flex items-start gap-2.5 text-xs text-[#71717A] dark:text-[#A1A1AA]">
              <i data-lucide="shield-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"></i>
              <span>Foto struk otomatis dikompresi (maksimal 1200px, JPEG 0.75) di browser Anda secara aman (&lt; 300 KB) sebelum dikirim ke API AI.</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  `;

  renderIcons(root);

  let activeStream = null;

  const stopActiveStream = () => {
    if (activeStream) {
      try {
        activeStream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.warn('Gagal menghentikan stream webcam:', e);
      }
      activeStream = null;
    }
  };

  const cleanupAndClose = () => {
    stopActiveStream();
    closeModal();
  };

  root.querySelector('#btn-close-scan').addEventListener('click', cleanupAndClose);

  root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
      cleanupAndClose();
    }
  });

  // Fungsi pemroses berkas struk dengan kompresi & AI OCR
  const processReceiptFile = async (file) => {
    if (!file) return;

    const stepContainer = root.querySelector('#scan-step-container');

    // Tampilkan Animasi Loading Pemindaian
    stepContainer.innerHTML = `
      <div class="py-10 text-center space-y-4">
        <div class="w-16 h-16 rounded-full border-4 border-zinc-200 dark:border-zinc-800 border-t-[#09090B] dark:border-t-white animate-spin mx-auto"></div>
        <div class="space-y-1.5">
          <h4 class="text-base font-bold text-[#09090B] dark:text-[#F4F4F5]">Menganalisis struk...</h4>
          <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] max-w-xs mx-auto leading-relaxed">
            Mengompresi foto & mengekstrak nominal, toko, tanggal, dan kategori via Google Gemini Flash
          </p>
        </div>
      </div>
    `;

    try {
      // 1. Kompresi gambar sisi klien (HTML5 Canvas max 1200px, JPEG 0.75)
      const compressed = await compressReceiptImage(file, {
        maxDimension: 1200,
        quality: 0.75,
      });

      // 2. Kirim request POST ke endpoint /api/scan-receipt via Google Gemini Flash
      const extracted = await scanReceiptWithAI(compressed.base64, 'image/jpeg');

      // 3. Matikan stream webcam jika masih aktif & tutup modal kamera/scan
      cleanupAndClose();

      // 4. Arahkan pengguna ke form transaksi yang sudah terisi untuk diverifikasi sebelum disimpan
      openTransactionModal({
        initialData: {
          amount: extracted.amount || 0,
          date: extracted.date || new Date().toISOString().slice(0, 10),
          category: extracted.category || 'Belanja',
          notes: extracted.notes || '',
          merchant: extracted.merchant || '',
          receiptImage: compressed.base64,
        },
        onSuccess: options.onSuccess,
      });
    } catch (err) {
      console.error('[Scan AI Error]:', err);
      stepContainer.innerHTML = `
        <div class="py-6 text-center space-y-3">
          <div class="w-12 h-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
            <i data-lucide="alert-circle" class="w-6 h-6"></i>
          </div>
          <p class="text-sm font-bold text-[#09090B] dark:text-[#F4F4F5]">Gagal Menganalisis Struk</p>
          <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] max-w-xs mx-auto leading-relaxed">
            ${err.message || 'Struk buram, tidak terbaca, atau terjadi kendala saat memproses dengan Gemini AI.'}
          </p>
          <div class="flex items-center justify-center gap-2 pt-2">
            <button id="btn-retry-scan" type="button" class="px-4 py-2 bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] rounded-xl text-xs font-semibold cursor-pointer transition">
              Coba Lagi
            </button>
            <button id="btn-manual-input" type="button" class="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[#09090B] dark:text-[#F4F4F5] rounded-xl text-xs font-semibold cursor-pointer transition">
              Catat Manual
            </button>
          </div>
        </div>
      `;
      renderIcons(stepContainer);
      stepContainer.querySelector('#btn-retry-scan')?.addEventListener('click', () => {
        stopActiveStream();
        openScanReceiptModal(options);
      });
      stepContainer.querySelector('#btn-manual-input')?.addEventListener('click', () => {
        cleanupAndClose();
        openTransactionModal(options);
      });
    }
  };

  // Pasang trigger tombol Buka Kamera (Dukungan Webcam PC vs Kamera HP Mobile)
  const cameraBtn = root.querySelector('#btn-trigger-camera');
  const cameraInput = root.querySelector('#camera-input');

  cameraBtn?.addEventListener('click', async () => {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);

    if (isMobile) {
      // Jika di Mobile (HP): Tetap gunakan alur bawaan input file kamera tanpa perubahan apa pun
      cameraInput?.click();
    } else {
      // Jika di PC/Desktop: Nyalakan kamera peramban menggunakan getUserMedia
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Peramban Anda tidak mendukung akses webcam.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        activeStream = stream;

        const stepContainer = root.querySelector('#scan-step-container');
        stepContainer.innerHTML = `
          <div class="space-y-4">
            <div class="relative">
              <video id="webcam-preview" autoplay playsinline class="w-full rounded-2xl bg-black mb-3"></video>
              <div class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-[11px] font-semibold flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Webcam Aktif</span>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <button
                id="btn-cancel-webcam"
                type="button"
                class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                id="btn-capture-photo"
                type="button"
                class="flex-1 py-2.5 px-4 bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition active:opacity-85 cursor-pointer"
              >
                <i data-lucide="camera" class="w-4 h-4"></i>
                <span>Ambil Foto</span>
              </button>
            </div>
          </div>
        `;

        renderIcons(stepContainer);

        const videoEl = stepContainer.querySelector('#webcam-preview');
        if (videoEl) {
          videoEl.srcObject = stream;
          await videoEl.play().catch(() => {});
        }

        // Batalkan pengambilan foto via webcam
        stepContainer.querySelector('#btn-cancel-webcam')?.addEventListener('click', () => {
          stopActiveStream();
          openScanReceiptModal(options);
        });

        // Ambil frame foto dari webcam
        stepContainer.querySelector('#btn-capture-photo')?.addEventListener('click', async () => {
          if (!videoEl) return;

          const canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth || 1280;
          canvas.height = videoEl.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          }

          // Matikan stream webcam segera setelah frame diambil
          stopActiveStream();

          const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.92);
          });

          if (blob) {
            const capturedFile = new File([blob], 'struk-webcam.jpg', { type: 'image/jpeg' });
            processReceiptFile(capturedFile);
          }
        });
      } catch (err) {
        console.error('Gagal mengakses kamera:', err);
        alert('Gagal mengakses webcam peramban: ' + (err.message || 'Izin kamera ditolak atau perangkat tidak tersedia.'));
      }
    }
  });

  cameraInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processReceiptFile(file);
      e.target.value = '';
    }
  });

  // Pasang trigger tombol Pilih dari Galeri / Berkas
  const galleryBtn = root.querySelector('#btn-trigger-gallery');
  const galleryInput = root.querySelector('#gallery-input');
  galleryBtn?.addEventListener('click', () => {
    galleryInput?.click();
  });
  galleryInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processReceiptFile(file);
      e.target.value = '';
    }
  });
}

/**
 * Menampilkan Modal Login Pengguna
 * @param {Object} [options]
 * @param {() => void} [options.onSuccess]
 */
export function openLoginModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div class="bg-[#121214] rounded-2xl shadow-2xl border border-[#27272A] max-w-sm w-full p-6 sm:p-7 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-start justify-between pb-3 border-b border-[#27272A]">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/60 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
              <i data-lucide="lock" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-white tracking-tight">Masuk Akun</h3>
              <p class="text-xs text-zinc-400">Akses privat sesi Budget Tracker</p>
            </div>
          </div>
          <button id="btn-close-login" type="button" class="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <form id="form-auth" class="space-y-4">
          <div id="auth-error-alert" class="hidden p-3 bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs rounded-xl font-medium leading-relaxed"></div>

          <!-- Field Email -->
          <div>
            <label class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Alamat Email</label>
            <input
              id="auth_email"
              type="email"
              required
              autocomplete="email"
              placeholder="nama@email.com"
              class="w-full px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-white text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600 transition placeholder-zinc-600"
            >
          </div>

          <!-- Field Password -->
          <div>
            <label class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Kata Sandi</label>
            <input
              id="auth_password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-white text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600 transition placeholder-zinc-600"
            >
          </div>

          <!-- Tombol Aksi Submit -->
          <div class="pt-1">
            <button
              type="submit"
              id="btn-auth-submit"
              class="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 active:opacity-85 transition shadow-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <i data-lucide="log-in" class="w-4 h-4"></i>
              <span>Masuk</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  root.querySelector('#btn-close-login')?.addEventListener('click', closeModal);
  root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  const form = root.querySelector('#form-auth');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = root.querySelector('#auth_email').value;
    const password = root.querySelector('#auth_password').value;
    const errorAlert = root.querySelector('#auth-error-alert');
    const submitBtn = root.querySelector('#btn-auth-submit');

    errorAlert.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-75');

    try {
      await login(email, password);
      closeModal();
      triggerImmediateSync();
      if (typeof options.onSuccess === 'function') {
        options.onSuccess();
      }
    } catch (err) {
      errorAlert.textContent = err.message || 'Login gagal, periksa email dan kata sandi Anda.';
      errorAlert.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-75');
    }
  });
}

/**
 * Menampilkan Modal Transfer Antar Rekening
 * @param {Object} [options]
 * @param {() => void} [options.onSuccess]
 */
export function openTransferModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  const state = getState();
  const accounts = state.accounts || [];

  if (accounts.length < 2) {
    alert('Anda memerlukan setidaknya 2 rekening terdaftar untuk melakukan transfer antar rekening.');
    return;
  }

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-md w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="arrow-left-right" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-[#09090B] dark:text-[#F4F4F5]">Transfer Antar Rekening</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Pindahkan saldo antar rekening / e-wallet</p>
            </div>
          </div>
          <button id="btn-close-transfer" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="form-transfer" class="space-y-4">
          <div id="transfer-error-alert" class="hidden p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs rounded-xl font-medium"></div>

          <!-- Rekening Asal (Sumber) -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Dari Rekening (Sumber)</label>
            <select
              id="transfer_from"
              required
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] bg-[#FFFFFF] dark:bg-[#09090B] text-sm font-medium outline-none"
            >
              ${accounts.map((a, i) => `<option value="${a.id}" ${i === 0 ? 'selected' : ''}>${a.name} (${formatRupiah(a.balance)})</option>`).join('')}
            </select>
          </div>

          <!-- Rekening Tujuan -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Ke Rekening (Tujuan)</label>
            <select
              id="transfer_to"
              required
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] bg-[#FFFFFF] dark:bg-[#09090B] text-sm font-medium outline-none"
            >
              ${accounts.map((a, i) => `<option value="${a.id}" ${i === 1 ? 'selected' : ''}>${a.name} (${formatRupiah(a.balance)})</option>`).join('')}
            </select>
          </div>

          <!-- Nominal Transfer -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Nominal Transfer (Rp)</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm">Rp</span>
              <input
                id="transfer_amount"
                type="number"
                min="1"
                required
                placeholder="0"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-lg outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              >
            </div>
          </div>

          <!-- Catatan Transfer -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Catatan (Opsional)</label>
            <input
              id="transfer_note"
              type="text"
              placeholder="Contoh: Top up e-wallet bulanan"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm bg-[#FFFFFF] dark:bg-[#09090B] outline-none placeholder-zinc-300 dark:placeholder-zinc-600"
            >
          </div>

          <!-- Tombol Aksi -->
          <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-transfer"
              type="button"
              class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85"
            >
              Kirim Transfer
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  root.querySelector('#btn-close-transfer')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-transfer')?.addEventListener('click', closeModal);

  const form = root.querySelector('#form-transfer');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fromWalletId = root.querySelector('#transfer_from').value;
    const toWalletId = root.querySelector('#transfer_to').value;
    const amount = Number(root.querySelector('#transfer_amount').value);
    const note = root.querySelector('#transfer_note').value.trim();
    const errorAlert = root.querySelector('#transfer-error-alert');

    try {
      transferBalance({ fromWalletId, toWalletId, amount, note });
      closeModal();
      if (typeof options.onSuccess === 'function') {
        options.onSuccess();
      }
    } catch (err) {
      errorAlert.textContent = err.message || 'Transfer gagal diproses.';
      errorAlert.classList.remove('hidden');
    }
  });
}

/**
 * Menampilkan Modal Edit Plafon Pos Anggaran
 * @param {Object} category
 * @param {Object} [options]
 * @param {() => void} [options.onSuccess]
 */
export function openEditBudgetModal(category, options = {}) {
  const root = modalRoot();
  if (!root || !category) return;

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-sm w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="edit-2" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-[#09090B] dark:text-[#F4F4F5]">Edit Plafon Pos</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA] truncate max-w-[200px]">${category.name}</p>
            </div>
          </div>
          <button id="btn-close-edit-budget" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="form-edit-budget" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Target Plafon Bulanan (Rp)</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm">Rp</span>
              <input
                id="edit_budget_amount"
                type="number"
                min="0"
                required
                value="${category.budget || 0}"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#09090B] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-lg outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              >
            </div>
          </div>

          <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-edit-budget"
              type="button"
              class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85"
            >
              Terapkan
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  root.querySelector('#btn-close-edit-budget')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-edit-budget')?.addEventListener('click', closeModal);

  const form = root.querySelector('#form-edit-budget');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newBudget = Number(root.querySelector('#edit_budget_amount').value);
    updateCategoryBudget(category.id, newBudget);
    closeModal();
    if (typeof options.onSuccess === 'function') {
      options.onSuccess();
    }
  });
}

/**
 * Menampilkan Modal Tambah Pos Anggaran Baru
 * @param {Object} [options]
 * @param {() => void} [options.onSuccess]
 */
export function openAddCategoryModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-sm w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="plus" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-[#09090B] dark:text-[#F4F4F5]">Tambah Pos Anggaran</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Buat pos alokasi batas belanja baru</p>
            </div>
          </div>
          <button id="btn-close-add-cat" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="form-add-category" class="space-y-4">
          <!-- Nama Pos Kategori -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Nama Pos Anggaran</label>
            <input
              id="cat_name"
              type="text"
              required
              placeholder="Contoh: Kebutuhan Bayi, Gym, dll"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#09090B] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium outline-none placeholder-zinc-300 dark:placeholder-zinc-600"
            >
          </div>

          <!-- Plafon Anggaran -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Target Plafon Bulanan (Rp)</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm">Rp</span>
              <input
                id="cat_budget"
                type="number"
                min="0"
                required
                placeholder="0"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#09090B] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-lg outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder-zinc-300 dark:placeholder-zinc-600"
              >
            </div>
          </div>

          <!-- Pilihan Ikon -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Ikon Pos</label>
            <select
              id="cat_icon"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] bg-[#FFFFFF] dark:bg-[#09090B] text-sm font-medium outline-none"
            >
              <option value="shopping-bag">Belanja (Shopping Bag)</option>
              <option value="utensils">Makanan & Minuman (Utensils)</option>
              <option value="car">Transportasi (Car)</option>
              <option value="zap">Tagihan & Utilitas (Zap)</option>
              <option value="heart-pulse">Kesehatan (Heart Pulse)</option>
              <option value="film">Hiburan (Film)</option>
              <option value="home">Rumah Tangga (Home)</option>
              <option value="piggy-bank">Tabungan (Piggy Bank)</option>
            </select>
          </div>

          <!-- Tombol Aksi -->
          <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-add-cat"
              type="button"
              class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85"
            >
              Simpan Pos
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  root.querySelector('#btn-close-add-cat')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-add-cat')?.addEventListener('click', closeModal);

  const form = root.querySelector('#form-add-category');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = root.querySelector('#cat_name').value.trim();
    const budget = Number(root.querySelector('#cat_budget').value);
    const icon = root.querySelector('#cat_icon').value;

    addCategory({ name, budget, icon });
    closeModal();
    if (typeof options.onSuccess === 'function') {
      options.onSuccess();
    }
  });
}

/**
 * Menampilkan Modal Edit Nama Dompet / Rekening Bank
 * @param {Object} wallet - Data rekening/dompet yang diedit ({ id, name, ... })
 * @param {Object} [options]
 * @param {(newName: string) => void} [options.onSuccess]
 */
export function openEditWalletNameModal(wallet, options = {}) {
  const root = modalRoot();
  if (!root || !wallet) return;

  const walletId = wallet.id;
  const currentName = wallet.name || '';

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-sm w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="pencil" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-[#09090B] dark:text-[#F4F4F5]">Edit Nama Dompet</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Perbarui nama rekening / dompet</p>
            </div>
          </div>
          <button id="btn-close-edit-wallet" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Form Edit Nama -->
        <form id="form-edit-wallet-name" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
              Nama Dompet / Bank Baru
            </label>
            <input
              id="wallet_new_name"
              type="text"
              required
              value="${currentName}"
              placeholder="Contoh: BCA Tabungan Utama"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#09090B] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium outline-none placeholder-zinc-300 dark:placeholder-zinc-600"
            >
          </div>

          <!-- Tombol Aksi -->
          <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-edit-wallet"
              type="button"
              class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85"
            >
              Simpan Perubahan
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  root.querySelector('#btn-close-edit-wallet')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-edit-wallet')?.addEventListener('click', closeModal);

  const form = root.querySelector('#form-edit-wallet-name');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newName = root.querySelector('#wallet_new_name').value.trim();
    if (!newName) return;

    store.updateWalletName(walletId, newName);
    closeModal();
    if (typeof options.onSuccess === 'function') {
      options.onSuccess(newName);
    }
  });
}

/**
 * Menampilkan Modal Tambah Kartu / Dompet Manual (Tanpa Random)
 * @param {Object} [options]
 * @param {(account: Object) => void} [options.onSuccess]
 */
export function openAddAccountModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-md w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="credit-card" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-[#09090B] dark:text-[#F4F4F5]">Tambah Kartu / Dompet</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Masukkan detail rekening atau e-wallet secara manual</p>
            </div>
          </div>
          <button id="btn-close-add-acc" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Form Tambah Kartu -->
        <form id="form-add-account" class="space-y-4">
          <!-- Input Nama Bank / Kartu -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
              Nama Bank / Kartu
            </label>
            <input
              id="acc_name"
              type="text"
              required
              placeholder="Contoh: BCA Utama, Jago Tabungan, DANA"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium outline-none bg-[#FFFFFF] dark:bg-[#09090B] placeholder-zinc-300 dark:placeholder-zinc-600"
            >
          </div>

          <!-- Input Saldo Awal -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
              Saldo Awal (Rp)
            </label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm">Rp</span>
              <input
                id="acc_balance"
                type="number"
                min="0"
                required
                value="0"
                placeholder="0"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-lg outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-[#FFFFFF] dark:bg-[#09090B] placeholder-zinc-300 dark:placeholder-zinc-600"
              >
            </div>
          </div>

          <!-- Dropdown Tipe Rekening -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
              Tipe Rekening
            </label>
            <select
              id="acc_type"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] bg-[#FFFFFF] dark:bg-[#09090B] text-sm font-medium outline-none"
            >
              <option value="bank">Bank Konvensional / Digital</option>
              <option value="ewallet">E-Wallet (DANA, Gopay, Ovo, ShopeePay)</option>
              <option value="cash">Uang Tunai / Kas Fisik</option>
            </select>
          </div>

          <!-- Tombol Aksi -->
          <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-add-acc"
              type="button"
              class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85"
            >
              Simpan Rekening
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  root.querySelector('#btn-close-add-acc')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-add-acc')?.addEventListener('click', closeModal);

  const form = root.querySelector('#form-add-account');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = root.querySelector('#acc_name').value.trim();
    const balance = Number(root.querySelector('#acc_balance').value) || 0;
    const type = root.querySelector('#acc_type').value;

    if (!name) return;

    const newAcc = addAccount({ name, balance, type });
    closeModal();
    if (typeof options.onSuccess === 'function') {
      options.onSuccess(newAcc);
    }
  });
}

export const openAddWalletModal = openAddAccountModal;

/**
 * Menampilkan modal dialog konfirmasi sederhana untuk menghapus transaksi
 * @param {Object} options
 * @param {Object} options.transaction - Data transaksi yang akan dihapus
 * @param {() => Promise<void>|void} options.onConfirm - Callback aksi konfirmasi hapus
 * @param {() => void} [options.onCancel] - Callback saat dibatalkan
 */
export function openConfirmDeleteTransactionModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  const tx = options.transaction || {};
  const isExpense = tx.type === 'expense';
  const amountFormatted = formatRupiah(Math.abs(Number(tx.amount) || 0));
  const dateFormatted = tx.date ? formatDateIndo(tx.date) : 'Tanggal tidak tercatat';
  const titleText = tx.note || tx.description || tx.category || 'Transaksi';
  const accountName = tx.accountName || 'Rekening';

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-md w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header & Ikon Peringatan Hapus -->
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-xs">
            <i data-lucide="trash-2" class="w-6 h-6"></i>
          </div>
          <div class="space-y-1">
            <h3 class="text-lg font-bold text-[#09090B] dark:text-[#F4F4F5] leading-tight">
              Hapus Transaksi
            </h3>
            <p class="text-sm text-[#71717A] dark:text-[#A1A1AA]">
              Apakah Anda yakin ingin menghapus transaksi ini?
            </p>
          </div>
        </div>

        <!-- Kartu Ringkasan Detail Transaksi -->
        <div class="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-[#E4E4E7] dark:border-[#27272A] space-y-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-[#71717A] dark:text-[#A1A1AA]">Keterangan:</span>
            <span class="font-bold text-[#09090B] dark:text-[#F4F4F5] truncate max-w-[200px]">${titleText}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[#71717A] dark:text-[#A1A1AA]">Pos Kategori:</span>
            <span class="font-semibold text-[#09090B] dark:text-[#F4F4F5]">${tx.category || 'Umum'}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[#71717A] dark:text-[#A1A1AA]">Rekening:</span>
            <span class="font-semibold text-[#09090B] dark:text-[#F4F4F5]">${accountName}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[#71717A] dark:text-[#A1A1AA]">Tanggal:</span>
            <span class="text-[#71717A] dark:text-[#A1A1AA]">${dateFormatted}</span>
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] text-sm">
            <span class="font-semibold text-[#71717A] dark:text-[#A1A1AA]">Nominal:</span>
            <span class="font-extrabold ${isExpense ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">
              ${isExpense ? '- ' : '+ '}${amountFormatted}
            </span>
          </div>
        </div>

        <p class="text-xs text-rose-600 dark:text-rose-400/90 leading-relaxed bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
          * Saldo pada rekening terkait akan dikembalikan/disesuaikan kembali secara otomatis.
        </p>

        <!-- Tombol Aksi -->
        <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
          <button
            id="btn-cancel-delete"
            type="button"
            class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            id="btn-confirm-delete"
            type="button"
            class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all cursor-pointer active:opacity-85 flex items-center gap-2"
          >
            <i data-lucide="trash-2" class="w-4 h-4"></i>
            <span id="btn-confirm-delete-text">Ya, Hapus</span>
          </button>
        </div>

      </div>
    </div>
  `;

  renderIcons(root);

  const handleCancel = () => {
    closeModal();
    if (typeof options.onCancel === 'function') {
      options.onCancel();
    }
  };

  root.querySelector('#btn-cancel-delete')?.addEventListener('click', handleCancel);
  root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
      handleCancel();
    }
  });

  const confirmBtn = root.querySelector('#btn-confirm-delete');
  let isDeleting = false;

  confirmBtn?.addEventListener('click', async () => {
    if (isDeleting) return;
    isDeleting = true;

    const btnText = root.querySelector('#btn-confirm-delete-text');
    if (btnText) btnText.textContent = 'Menghapus...';
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
      if (typeof options.onConfirm === 'function') {
        await options.onConfirm();
      }
      closeModal();
    } catch (err) {
      console.error('[openConfirmDeleteTransactionModal] Gagal menghapus transaksi:', err);
      alert('Gagal menghapus transaksi: ' + (err.message || err));
      isDeleting = false;
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('opacity-70', 'cursor-not-allowed');
      if (btnText) btnText.textContent = 'Ya, Hapus';
    }
  });
}

/**
 * Membuka modal konfirmasi hapus kartu/rekening bank kustom in-app
 * @param {Object} options
 * @param {Object} options.account - Data rekening yang akan dihapus
 * @param {() => Promise<void> | void} options.onConfirm - Callback saat tombol konfirmasi ditekan
 * @param {() => void} [options.onCancel] - Callback saat dibatalkan
 */
export function openConfirmDeleteWalletModal(options = {}) {
  const root = getModalRoot();
  if (!root) return;

  const account = options.account || {};
  const accountName = account.name || 'Rekening';
  const balanceFormatted = formatRupiah(account.balance || 0);

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div class="w-full max-w-sm rounded-2xl bg-[#FFFFFF] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        
        <!-- Header & Ikon Peringatan -->
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-[#09090B] dark:text-[#F4F4F5] tracking-tight">Hapus Rekening?</h3>
            <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Tindakan ini tidak dapat dibatalkan</p>
          </div>
        </div>

        <!-- Rincian Rekening -->
        <div class="p-3.5 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] space-y-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-[#71717A] dark:text-[#A1A1AA]">Nama Rekening:</span>
            <span class="font-bold text-[#09090B] dark:text-[#F4F4F5] text-right">${accountName}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[#71717A] dark:text-[#A1A1AA]">Nomor Rekening:</span>
            <span class="font-mono text-[#71717A] dark:text-[#A1A1AA]">${account.accountNumber || '-'}</span>
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] text-sm">
            <span class="font-semibold text-[#71717A] dark:text-[#A1A1AA]">Saldo Terakhir:</span>
            <span class="font-extrabold text-[#09090B] dark:text-[#F4F4F5]">
              ${balanceFormatted}
            </span>
          </div>
        </div>

        <p class="text-xs text-rose-600 dark:text-rose-400/90 leading-relaxed bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
          * Seluruh pencatatan yang menggunakan kartu/rekening ini tetap tersimpan di riwayat.
        </p>

        <!-- Tombol Aksi -->
        <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
          <button
            id="btn-cancel-delete-wallet"
            type="button"
            class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer active:opacity-80"
          >
            Batal
          </button>
          <button
            id="btn-confirm-delete-wallet"
            type="button"
            class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors cursor-pointer active:opacity-85 flex items-center gap-2"
          >
            <i data-lucide="trash-2" class="w-4 h-4"></i>
            <span id="btn-confirm-delete-wallet-text">Ya, Hapus</span>
          </button>
        </div>

      </div>
    </div>
  `;

  renderIcons(root);

  const handleCancel = () => {
    closeModal();
    if (typeof options.onCancel === 'function') {
      options.onCancel();
    }
  };

  root.querySelector('#btn-cancel-delete-wallet')?.addEventListener('click', handleCancel);
  root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
      handleCancel();
    }
  });

  const confirmBtn = root.querySelector('#btn-confirm-delete-wallet');
  let isDeleting = false;

  confirmBtn?.addEventListener('click', async () => {
    if (isDeleting) return;
    isDeleting = true;

    const btnText = root.querySelector('#btn-confirm-delete-wallet-text');
    if (btnText) btnText.textContent = 'Menghapus...';
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
      if (typeof options.onConfirm === 'function') {
        await options.onConfirm();
      }
      closeModal();
    } catch (err) {
      console.error('[openConfirmDeleteWalletModal] Gagal menghapus rekening:', err);
      alert('Gagal menghapus rekening: ' + (err.message || err));
      isDeleting = false;
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('opacity-70', 'cursor-not-allowed');
      if (btnText) btnText.textContent = 'Ya, Hapus';
    }
  });
}

/**
 * Membuka modal konfirmasi hapus pos anggaran kustom in-app
 * @param {Object} options
 * @param {Object} options.category - Data kategori yang akan dihapus
 * @param {() => Promise<void> | void} options.onConfirm - Callback saat tombol konfirmasi ditekan
 * @param {() => void} [options.onCancel] - Callback saat dibatalkan
 */
export function openConfirmDeleteCategoryModal(options = {}) {
  const root = getModalRoot();
  if (!root) return;

  const category = options.category || {};
  const catName = category.name || 'Pos Anggaran';

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div class="w-full max-w-sm rounded-2xl bg-[#FFFFFF] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        
        <!-- Header & Ikon Peringatan -->
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-[#09090B] dark:text-[#F4F4F5] tracking-tight">Hapus Pos Anggaran?</h3>
            <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Tindakan ini tidak dapat dibatalkan</p>
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <p class="text-[#71717A] dark:text-[#A1A1AA]">
            Apakah Anda yakin ingin menghapus pos anggaran <strong class="text-[#09090B] dark:text-[#F4F4F5]">"${catName}"</strong>?
          </p>
        </div>

        <!-- Tombol Aksi -->
        <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
          <button
            id="btn-cancel-delete-cat"
            type="button"
            class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer active:opacity-80"
          >
            Batal
          </button>
          <button
            id="btn-confirm-delete-cat"
            type="button"
            class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors cursor-pointer active:opacity-85 flex items-center gap-2"
          >
            <i data-lucide="trash-2" class="w-4 h-4"></i>
            <span id="btn-confirm-delete-cat-text">Ya, Hapus</span>
          </button>
        </div>

      </div>
    </div>
  `;

  renderIcons(root);

  const handleCancel = () => {
    closeModal();
    if (typeof options.onCancel === 'function') {
      options.onCancel();
    }
  };

  root.querySelector('#btn-cancel-delete-cat')?.addEventListener('click', handleCancel);
  root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
      handleCancel();
    }
  });

  const confirmBtn = root.querySelector('#btn-confirm-delete-cat');
  let isDeleting = false;

  confirmBtn?.addEventListener('click', async () => {
    if (isDeleting) return;
    isDeleting = true;

    const btnText = root.querySelector('#btn-confirm-delete-cat-text');
    if (btnText) btnText.textContent = 'Menghapus...';
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
      if (typeof options.onConfirm === 'function') {
        await options.onConfirm();
      }
      closeModal();
    } catch (err) {
      console.error('[openConfirmDeleteCategoryModal] Gagal menghapus pos anggaran:', err);
      alert('Gagal menghapus pos anggaran: ' + (err.message || err));
      isDeleting = false;
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('opacity-70', 'cursor-not-allowed');
      if (btnText) btnText.textContent = 'Ya, Hapus';
    }
  });
}




