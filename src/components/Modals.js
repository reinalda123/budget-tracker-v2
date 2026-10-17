// src/components/Modals.js
import { store, getState, setState, transferBalance, addCategory, updateCategoryBudget, updateWalletName, updateWalletBalance, addAccount, deleteTransaction, updateTransaction, triggerImmediateSync } from '../state/store.js';
import { compressReceiptImage } from '../services/scanner.js';
import { scanReceiptWithAI, deleteTransactionApi, updateTransactionApi, updateWalletBalanceApi, createTransactionApi, sendChatMessageApi, fetchChatHistoryApi, clearChatHistoryApi } from '../services/api.js';
import { login } from '../services/auth.js';
import { formatRupiah } from '../utils/formatters.js';
import { formatDateIndo } from '../utils/dates.js';
import { renderIcons } from '../utils/icons.js';
import { showToast } from '../utils/toast.js';

const modalRoot = () => document.querySelector('#modal-root');
const getModalRoot = modalRoot;


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

  // Pencocokan rekening awal jika terdeteksi dari struk / draft
  const initialAccountId = initialData?.accountId || initialData?.wallet_id || null;
  const initialAccountName = (initialData?.account_name || initialData?.wallet_name || '').toLowerCase();

  let matchedAccount = null;
  if (initialAccountId) {
    matchedAccount = accounts.find((a) => String(a.id) === String(initialAccountId));
  }
  if (!matchedAccount && initialAccountName) {
    matchedAccount = accounts.find((a) =>
      a.name.toLowerCase() === initialAccountName ||
      a.name.toLowerCase().includes(initialAccountName) ||
      initialAccountName.includes(a.name.toLowerCase())
    );
  }
  const selectedAccountId = matchedAccount ? matchedAccount.id : (accounts[0]?.id || 'acc-main');

  // Kategori bawaan untuk transaksi bertipe pemasukan
  const defaultIncomeCategories = ['Gaji & Pemasukan', 'Gaji', 'Bonus', 'Investasi', 'Transfer Masuk', 'Pemasukan Lain'];
  const baseCategoryNames = categories.map((c) => c.name);
  const incomeCategoriesToAdd = defaultIncomeCategories.filter(
    (inc) => !baseCategoryNames.some((cn) => cn.toLowerCase() === inc.toLowerCase())
  );

  const allCategoryNames = [
    ...baseCategoryNames,
    ...incomeCategoriesToAdd,
  ];

  // Mencocokkan kategori AI dengan master kategori aplikasi
  const matchingCat = allCategoryNames.find(
    (cn) => cn.toLowerCase() === rawCategory.toLowerCase() ||
           cn.toLowerCase().includes(rawCategory.toLowerCase()) ||
           (rawCategory && rawCategory.toLowerCase().includes(cn.toLowerCase()))
  );
  let categoryMode = (!matchingCat && rawCategory) ? 'custom' : 'select';
  const selectedCatName = matchingCat || (rawCategory || (initialType === 'income' ? (incomeCategoriesToAdd[0] || 'Gaji & Pemasukan') : (categories[0]?.name || 'Lainnya')));

  // Siapkan opsi kategori dropdown
  const categoryOptionsHtml = [
    (!matchingCat && rawCategory && rawCategory !== 'Lainnya')
      ? `<option value="${rawCategory}" selected>${rawCategory} (AI)</option>`
      : '',
    ...allCategoryNames.map((cName) => {
      const isSel = cName === selectedCatName;
      return `<option value="${cName}" ${isSel ? 'selected' : ''}>${cName}</option>`;
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
            <label id="label-tx-amount" class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
              ${initialType === 'income' ? 'Nominal Pemasukan (Rp)' : 'Nominal (Rp)'}
            </label>
            <div class="relative">
              <span id="prefix-tx-amount" class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${initialType === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#71717A] dark:text-[#A1A1AA]'} font-bold text-sm">Rp</span>
              <input
                id="tx_amount"
                type="number"
                step="any"
                min="0"
                required
                value="${initialAmount}"
                placeholder="0"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#09090B] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 ${initialType === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#09090B] dark:text-[#F4F4F5]'} font-extrabold text-lg placeholder-zinc-300 dark:placeholder-zinc-600 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              >
            </div>
          </div>

          <!-- Kategori & Rekening Sumber -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider">
                  Kategori
                </label>
                <!-- Toggle Mode: Pilih vs Ketik Bebas -->
                <div class="inline-flex p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-[#E4E4E7] dark:border-[#27272A] text-[11px]">
                  <button
                    type="button"
                    id="btn-cat-mode-select"
                    class="px-2 py-0.5 rounded-md font-semibold transition-all ${categoryMode === 'select' ? 'bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]'}"
                  >
                    Pilih Pos
                  </button>
                  <button
                    type="button"
                    id="btn-cat-mode-custom"
                    class="px-2 py-0.5 rounded-md font-semibold transition-all ${categoryMode === 'custom' ? 'bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]'}"
                  >
                    Ketik Bebas
                  </button>
                </div>
              </div>

              <!-- Container Dropdown Pos Anggaran -->
              <div id="container-cat-select" class="${categoryMode === 'select' ? '' : 'hidden'}">
                <select
                  id="tx_category"
                  class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
                >
                  ${categoryOptionsHtml}
                </select>
              </div>

              <!-- Container Input Teks Bebas (Tanpa Plafon Anggaran) -->
              <div id="container-cat-custom" class="${categoryMode === 'custom' ? '' : 'hidden'}">
                <input
                  id="tx_category_custom"
                  type="text"
                  value="${categoryMode === 'custom' ? rawCategory : ''}"
                  placeholder="Ketik kategori bebas (tanpa pos plafon)..."
                  class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none placeholder-zinc-300 dark:placeholder-zinc-600"
                >
              </div>
            </div>

            <div>
              <label id="label-tx-account" class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                ${initialType === 'income' ? 'Rekening Tujuan / Penerima' : 'Rekening / Dompet'}
              </label>
              <select
                id="tx_account"
                required
                class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
              >
                ${accounts.length > 0
                  ? accounts.map((a) => `<option value="${a.id}" ${String(a.id) === String(selectedAccountId) ? 'selected' : ''}>${a.name} (${a.provider || 'Bank'})</option>`).join('')
                  : '<option value="acc-main" selected>Dompet Utama (Tunai)</option>'}
              </select>
            </div>
          </div>

          <!-- Tanggal & Catatan -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="w-full max-w-full min-w-0 overflow-hidden box-border">
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Tanggal</label>
              <input
                id="tx_date"
                type="date"
                required
                value="${initialDate}"
                style="-webkit-appearance: none; appearance: none; display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;"
                class="w-full max-w-full min-w-0 box-border px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
              >
            </div>

            <div class="w-full max-w-full min-w-0">
              <label id="label-tx-note" class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                ${initialType === 'income' ? 'Penerimaan / Sumber Dana' : 'Catatan'}
              </label>
              <input
                id="tx_note"
                type="text"
                required
                value="${initialNote}"
                placeholder="${initialType === 'income' ? 'Contoh: Transfer gaji, bonus, penerimaan dana' : 'Contoh: Makan siang tim'}"
                class="w-full max-w-full min-w-0 box-border px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm bg-[#FFFFFF] dark:bg-[#09090B] placeholder-zinc-300 dark:placeholder-zinc-600 outline-none"
              >
            </div>
          </div>

          <!-- Tombol Aksi Submit: Grid 2 Kolom Seimbang di Mobile (< sm), Flex Rapat Kanan di Desktop -->
          <div class="pt-3 grid grid-cols-2 gap-2.5 sm:flex sm:items-center sm:justify-end sm:gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-tx"
              type="button"
              class="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer text-center flex items-center justify-center whitespace-nowrap"
            >
              Batal
            </button>
            <button
              id="btn-save-verification"
              type="submit"
              class="w-full sm:w-auto px-4 sm:px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85 flex items-center justify-center gap-1.5 sm:gap-2 shadow-xs text-center whitespace-nowrap"
            >
              <i data-lucide="check" class="w-4 h-4 shrink-0"></i>
              <span class="inline md:hidden">Simpan</span>
              <span class="hidden md:inline">Simpan Transaksi</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  // Setup radio tipe transaksi toggle visual & labels
  const radioLabels = root.querySelectorAll('input[name="tx_type"]');
  const labelTxAmount = root.querySelector('#label-tx-amount');
  const prefixTxAmount = root.querySelector('#prefix-tx-amount');
  const amountInput = root.querySelector('#tx_amount');
  const labelTxAccount = root.querySelector('#label-tx-account');
  const labelTxNote = root.querySelector('#label-tx-note');
  const noteInput = root.querySelector('#tx_note');
  const categorySelect = root.querySelector('#tx_category');

  radioLabels.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const isExpense = e.target.value === 'expense';
      const expenseLabel = root.querySelector('input[value="expense"]').parentElement;
      const incomeLabel = root.querySelector('input[value="income"]').parentElement;

      if (isExpense) {
        expenseLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-400 font-bold text-sm transition-all';
        incomeLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm cursor-pointer transition-all';

        // Sesuaikan styling & label untuk pengeluaran
        if (labelTxAmount) labelTxAmount.textContent = 'Nominal (Rp)';
        if (prefixTxAmount) prefixTxAmount.className = 'absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm';
        if (amountInput) {
          amountInput.classList.remove('text-emerald-600', 'dark:text-emerald-400');
          amountInput.classList.add('text-[#09090B]', 'dark:text-[#F4F4F5]');
        }
        if (labelTxAccount) labelTxAccount.textContent = 'Rekening / Dompet';
        if (labelTxNote) labelTxNote.textContent = 'Catatan';
        if (noteInput && (!noteInput.value || noteInput.placeholder.includes('penerimaan'))) {
          noteInput.placeholder = 'Contoh: Makan siang tim';
        }
      } else {
        incomeLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer border-emerald-600/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-sm transition-all';
        expenseLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm cursor-pointer transition-all';

        // Sesuaikan styling & label hijau untuk pemasukan
        if (labelTxAmount) labelTxAmount.textContent = 'Nominal Pemasukan (Rp)';
        if (prefixTxAmount) prefixTxAmount.className = 'absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-600 dark:text-emerald-400 font-bold text-sm';
        if (amountInput) {
          amountInput.classList.remove('text-[#09090B]', 'dark:text-[#F4F4F5]');
          amountInput.classList.add('text-emerald-600', 'dark:text-emerald-400');
        }
        if (labelTxAccount) labelTxAccount.textContent = 'Rekening Tujuan / Penerima';
        if (labelTxNote) labelTxNote.textContent = 'Penerimaan / Sumber Dana';
        if (noteInput && (!noteInput.value || noteInput.placeholder.includes('Makan siang'))) {
          noteInput.placeholder = 'Contoh: Transfer gaji, bonus, penerimaan dana';
        }

        // Tawarkan kategori pemasukan jika saat ini masih di kategori belanja biasa
        if (categorySelect && (categorySelect.value === 'Makanan & Minuman' || categorySelect.value === 'Belanja' || categorySelect.value === 'Transportasi')) {
          const incOpt = categorySelect.querySelector('option[value="Gaji & Pemasukan"]') || categorySelect.querySelector('option[value="Gaji"]');
          if (incOpt) {
            categorySelect.value = incOpt.value;
          }
        }
      }
    });
  });

  // Setup toggle mode kategori: Pilih Pos vs Ketik Bebas
  const btnCatModeSelect = root.querySelector('#btn-cat-mode-select');
  const btnCatModeCustom = root.querySelector('#btn-cat-mode-custom');
  const containerCatSelect = root.querySelector('#container-cat-select');
  const containerCatCustom = root.querySelector('#container-cat-custom');
  const inputCatCustom = root.querySelector('#tx_category_custom');

  btnCatModeSelect?.addEventListener('click', () => {
    categoryMode = 'select';
    containerCatSelect?.classList.remove('hidden');
    containerCatCustom?.classList.add('hidden');
    btnCatModeSelect.className = 'px-2 py-0.5 rounded-md font-semibold transition-all bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs';
    btnCatModeCustom.className = 'px-2 py-0.5 rounded-md font-semibold transition-all text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]';
  });

  btnCatModeCustom?.addEventListener('click', () => {
    categoryMode = 'custom';
    containerCatSelect?.classList.add('hidden');
    containerCatCustom?.classList.remove('hidden');
    btnCatModeCustom.className = 'px-2 py-0.5 rounded-md font-semibold transition-all bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs';
    btnCatModeSelect.className = 'px-2 py-0.5 rounded-md font-semibold transition-all text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]';
    inputCatCustom?.focus();
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

      let category = '';
      if (categoryMode === 'custom') {
        category = inputCatCustom?.value?.trim() || 'Lainnya';
      } else {
        const categorySelect = root.querySelector('#tx_category');
        category = categorySelect?.value || selectedCatName || 'Lainnya';
      }

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

      // Deteksi transaksi masuk / income dari hasil ekstraksi Gemini AI
      const rawText = `${extracted.merchant || ''} ${extracted.notes || ''} ${extracted.category || ''} ${extracted.type || ''}`.toLowerCase();
      const isIncome = extracted.type === 'income' ||
        extracted.is_income === true ||
        rawText.includes('transfer masuk') ||
        rawText.includes('dana masuk') ||
        rawText.includes('uang masuk') ||
        rawText.includes('penerimaan') ||
        rawText.includes('gaji') ||
        rawText.includes('payroll') ||
        rawText.includes('setoran') ||
        rawText.includes('top up') ||
        rawText.includes('topup');

      const txType = isIncome ? 'income' : (extracted.type || 'expense');
      const defaultCategory = isIncome
        ? (extracted.category && extracted.category !== 'Belanja' ? extracted.category : 'Gaji & Pemasukan')
        : (extracted.category || 'Belanja');

      // 4. Arahkan pengguna ke form transaksi yang sudah terisi untuk diverifikasi sebelum disimpan
      openTransactionModal({
        initialData: {
          type: txType,
          amount: extracted.amount || 0,
          date: extracted.date || new Date().toISOString().slice(0, 10),
          category: defaultCategory,
          notes: extracted.notes || '',
          merchant: extracted.merchant || '',
          accountId: extracted.accountId || extracted.wallet_id || null,
          account_name: extracted.account_name || extracted.wallet_name || null,
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
 * Menampilkan Modal Edit Saldo Rekening (Menyesuaikan saldo rekening secara manual)
 * @param {Object} wallet - Data rekening { id, name, balance, type, ... }
 * @param {Object} [options]
 * @param {(updatedAccount: Object) => void} [options.onSuccess]
 */
export function openEditWalletBalanceModal(wallet, options = {}) {
  const root = modalRoot();
  if (!root || !wallet) return;

  const walletId = wallet.id;
  const currentName = wallet.name || 'Rekening';
  const currentBalance = Math.max(0, Number(wallet.balance) || 0);
  const walletType = wallet.type || 'Bank';

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] w-full max-w-sm sm:max-w-md p-6 sm:p-7 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="wallet" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-[#09090B] dark:text-[#F4F4F5]">Edit Saldo Rekening</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Sesuaikan nilai saldo riil pada rekening</p>
            </div>
          </div>
          <button id="btn-close-edit-balance" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Form Edit Saldo -->
        <form id="form-edit-wallet-balance" class="space-y-4">
          <!-- Info Nama Rekening (Label Informasi Read-Only) -->
          <div class="p-3.5 rounded-xl bg-[#F9F9F8] dark:bg-[#09090B]/60 border border-[#E4E4E7] dark:border-[#27272A] flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider block">Nama Rekening</span>
              <p class="text-sm font-bold text-[#09090B] dark:text-[#F4F4F5] truncate">${currentName}</p>
              <span class="inline-block mt-0.5 text-[10px] font-semibold text-[#71717A] dark:text-[#A1A1AA] px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 border border-zinc-300/40 dark:border-zinc-700/50">${walletType}</span>
            </div>
            <div class="text-right shrink-0">
              <span class="text-[10px] font-bold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider block">Saldo Saat Ini</span>
              <p class="text-xs sm:text-sm font-bold text-[#71717A] dark:text-[#A1A1AA]">${formatRupiah(currentBalance)}</p>
            </div>
          </div>

          <!-- Input Saldo Baru -->
          <div>
            <label for="wallet_new_balance" class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
              Saldo Baru (Rp)
            </label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm">Rp</span>
              <input
                id="wallet_new_balance"
                type="number"
                min="0"
                step="any"
                required
                value="${currentBalance}"
                placeholder="0"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-base outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-[#FFFFFF] dark:bg-[#09090B] placeholder-zinc-300 dark:placeholder-zinc-600"
              >
            </div>
            <!-- Live Preview Format Ribuan / Rupiah -->
            <p id="preview-new-balance" class="text-xs text-[#71717A] dark:text-[#A1A1AA] mt-1.5 font-medium flex items-center gap-1">
              <span>Pratinjau:</span>
              <span class="font-bold text-[#09090B] dark:text-[#F4F4F5]">${formatRupiah(currentBalance)}</span>
            </p>
          </div>

          <!-- Tombol Aksi: Batal & Simpan Perubahan -->
          <div class="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <button
              id="btn-cancel-edit-balance"
              type="button"
              class="px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              id="btn-submit-edit-balance"
              type="submit"
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85 flex items-center gap-2"
            >
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  // Update live preview pratinjau nominal
  const balanceInput = root.querySelector('#wallet_new_balance');
  const previewEl = root.querySelector('#preview-new-balance');
  balanceInput?.addEventListener('input', () => {
    const rawVal = balanceInput.value;
    const num = Number(rawVal);
    if (!isNaN(num) && num >= 0 && rawVal.trim() !== '') {
      previewEl.innerHTML = `<span>Pratinjau:</span> <span class="font-bold text-[#09090B] dark:text-[#F4F4F5]">${formatRupiah(num)}</span>`;
    } else {
      previewEl.innerHTML = `<span>Pratinjau:</span> <span class="font-bold text-[#09090B] dark:text-[#F4F4F5]">Rp 0</span>`;
    }
  });

  // Event handler tutup modal
  root.querySelector('#btn-close-edit-balance')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-edit-balance')?.addEventListener('click', closeModal);
  root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  // Event handler submit form
  const form = root.querySelector('#form-edit-wallet-balance');
  const submitBtn = root.querySelector('#btn-submit-edit-balance');
  let isSaving = false;

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSaving) return;

    const newBalanceNum = Number(balanceInput?.value);
    if (isNaN(newBalanceNum) || newBalanceNum < 0) {
      alert('Nominal saldo harus berupa angka yang valid (minimal Rp 0).');
      return;
    }

    isSaving = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <span class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
        <span>Menyimpan...</span>
      `;
    }

    // 1. Perbarui state lokal secara reaktif langsung
    const updatedAcc = store.updateWalletBalance(walletId, newBalanceNum);

    // 2. Tutup modal
    closeModal();

    // 3. Tampilkan toast notifikasi sukses
    showToast(`Saldo ${currentName} berhasil diperbarui menjadi ${formatRupiah(newBalanceNum)}`, 'success');

    // 4. Sinkronisasi langsung ke Cloudflare D1 via Worker
    try {
      await updateWalletBalanceApi(walletId, newBalanceNum);
    } catch (err) {
      console.warn('[EditBalanceModal] Gagal sinkronisasi update saldo ke Cloudflare Worker:', err);
    }

    if (typeof options.onSuccess === 'function') {
      options.onSuccess(updatedAcc);
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
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] w-full max-w-md md:max-w-lg lg:max-w-[480px] p-6 sm:p-7 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
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

          <!-- Saldo Awal & Tipe Rekening Sejajar di Desktop -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-base outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-[#FFFFFF] dark:bg-[#09090B] placeholder-zinc-300 dark:placeholder-zinc-600"
                >
              </div>
            </div>

            <!-- Input Tipe Rekening Bebas (User bebas mengetik: E-Wallet, Bank Digital, Tunai) -->
            <div>
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                Tipe Rekening
              </label>
              <input
                id="acc_type"
                type="text"
                required
                placeholder="Contoh: E-Wallet, Bank Digital, Tunai"
                value="Bank"
                class="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] bg-[#FFFFFF] dark:bg-[#09090B] text-sm font-medium outline-none placeholder-zinc-300 dark:placeholder-zinc-600"
              >
            </div>
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
              class="px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85 shadow-xs"
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
    const type = root.querySelector('#acc_type').value.trim() || 'Bank';

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
 * Menampilkan Modal Edit Transaksi
 * @param {Object} tx - Data transaksi yang akan diedit
 * @param {Object} [options]
 * @param {(updatedTx: Object) => void} [options.onSuccess]
 * @param {() => void} [options.onDelete]
 */
export function openEditTransactionModal(tx, options = {}) {
  const root = modalRoot();
  if (!root || !tx) return;

  const state = getState();
  const accounts = state.accounts || [];
  const categories = state.categories || [];

  const txType = tx.type || 'expense';
  const txAmount = Math.abs(Number(tx.amount) || 0);
  const txDate = tx.date ? String(tx.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const txCategory = tx.category || 'Umum';
  const txNote = tx.note || tx.notes || '';
  const currentWalletId = String(tx.wallet_id || tx.accountId || accounts[0]?.id || '');

  // Cek apakah kategori saat ini ada di master categories pos anggaran
  const isExistingCategory = categories.some((c) => c.name.toLowerCase() === txCategory.toLowerCase());
  let editCatMode = isExistingCategory ? 'select' : 'custom';

  // Siapkan opsi kategori
  const categoryOptionsHtml = [
    ...categories.map((c) => {
      const isSel = c.name.toLowerCase() === txCategory.toLowerCase();
      return `<option value="${c.name}" ${isSel ? 'selected' : ''}>${c.name}</option>`;
    }),
    `<option value="Lainnya" ${txCategory === 'Lainnya' ? 'selected' : ''}>Lainnya</option>`,
  ].join('');

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-lg w-full p-6 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] flex items-center justify-center">
              <i data-lucide="pencil" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-[#09090B] dark:text-[#F4F4F5]">Edit Transaksi</h3>
              <p class="text-xs text-[#71717A] dark:text-[#A1A1AA]">Perbarui detail mutasi atau hapus transaksi ini</p>
            </div>
          </div>
          <button id="btn-close-edit-tx" type="button" class="p-2 text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Form Edit Transaksi -->
        <form id="form-edit-transaction" class="space-y-4">
          
          <!-- Tipe Transaksi: Pengeluaran / Pemasukan -->
          <div>
            <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Tipe Transaksi</label>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer ${txType === 'expense' ? 'border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA]'} font-bold text-sm transition-all">
                <input type="radio" name="edit_tx_type" value="expense" ${txType === 'expense' ? 'checked' : ''} class="hidden">
                <i data-lucide="arrow-down-left" class="w-4 h-4"></i> Pengeluaran
              </label>
              <label class="flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer ${txType === 'income' ? 'border-emerald-600/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA]'} font-bold text-sm transition-all">
                <input type="radio" name="edit_tx_type" value="income" ${txType === 'income' ? 'checked' : ''} class="hidden">
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
                id="edit_tx_amount"
                type="number"
                step="any"
                min="0"
                required
                value="${txAmount}"
                placeholder="0"
                class="w-full pl-11 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#09090B] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] font-extrabold text-lg outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              >
            </div>
          </div>

          <!-- Kategori & Rekening Sumber -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider">
                  Kategori
                </label>
                <!-- Toggle Mode: Pilih vs Ketik Bebas -->
                <div class="inline-flex p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-[#E4E4E7] dark:border-[#27272A] text-[11px]">
                  <button
                    type="button"
                    id="btn-edit-cat-mode-select"
                    class="px-2 py-0.5 rounded-md font-semibold transition-all ${editCatMode === 'select' ? 'bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]'}"
                  >
                    Pilih Pos
                  </button>
                  <button
                    type="button"
                    id="btn-edit-cat-mode-custom"
                    class="px-2 py-0.5 rounded-md font-semibold transition-all ${editCatMode === 'custom' ? 'bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]'}"
                  >
                    Ketik Bebas
                  </button>
                </div>
              </div>

              <!-- Container Dropdown Pos Anggaran -->
              <div id="container-edit-cat-select" class="${editCatMode === 'select' ? '' : 'hidden'}">
                <select
                  id="edit_tx_category"
                  class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
                >
                  ${categoryOptionsHtml}
                </select>
              </div>

              <!-- Container Input Teks Bebas (Tanpa Plafon Anggaran) -->
              <div id="container-edit-cat-custom" class="${editCatMode === 'custom' ? '' : 'hidden'}">
                <input
                  id="edit_tx_category_custom"
                  type="text"
                  value="${editCatMode === 'custom' ? txCategory : ''}"
                  placeholder="Ketik kategori bebas (tanpa pos plafon)..."
                  class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none placeholder-zinc-300 dark:placeholder-zinc-600"
                >
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Rekening / Dompet</label>
              <select
                id="edit_tx_account"
                required
                class="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
              >
                ${accounts.length > 0
                  ? accounts.map((a) => `<option value="${a.id}" ${String(a.id) === currentWalletId ? 'selected' : ''}>${a.name} (${a.provider || a.type || 'Bank'})</option>`).join('')
                  : '<option value="acc-main" selected>Dompet Utama (Tunai)</option>'}
              </select>
            </div>
          </div>

          <!-- Tanggal & Catatan -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="w-full max-w-full min-w-0 overflow-hidden box-border">
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Tanggal</label>
              <input
                id="edit_tx_date"
                type="date"
                required
                value="${txDate}"
                style="-webkit-appearance: none; appearance: none; display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;"
                class="w-full max-w-full min-w-0 box-border px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm font-medium bg-[#FFFFFF] dark:bg-[#09090B] outline-none"
              >
            </div>

            <div class="w-full max-w-full min-w-0">
              <label class="block text-xs font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider mb-1.5">Catatan</label>
              <input
                id="edit_tx_note"
                type="text"
                required
                value="${txNote}"
                placeholder="Contoh: Makan siang tim"
                class="w-full max-w-full min-w-0 box-border px-3 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] focus:border-[#09090B] dark:focus:border-[#F4F4F5] focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 text-[#09090B] dark:text-[#F4F4F5] text-sm bg-[#FFFFFF] dark:bg-[#09090B] placeholder-zinc-300 dark:placeholder-zinc-600 outline-none"
              >
            </div>
          </div>

          <!-- Tombol Aksi: Mobile (Baris 1: Batal & Simpan, Baris 2: Hapus Mandiri Full-Width) & Desktop (Sejajar Kiri-Kanan) -->
          <div class="pt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 md:gap-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            <!-- Baris Atas Mobile: Grid 2 Kolom Seimbang (Batal & Simpan Perubahan) / Kanan Desktop -->
            <div class="grid grid-cols-2 gap-2.5 w-full md:w-auto md:flex md:items-center md:gap-2 order-1 md:order-2">
              <button
                id="btn-cancel-edit-tx"
                type="button"
                class="w-full md:w-auto px-4 py-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#27272A] text-[#71717A] dark:text-[#A1A1AA] hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors cursor-pointer text-center flex items-center justify-center whitespace-nowrap"
              >
                Batal
              </button>
              <button
                type="submit"
                class="w-full md:w-auto px-4 sm:px-5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-white dark:text-[#09090B] font-semibold text-sm transition-all cursor-pointer active:opacity-85 flex items-center justify-center gap-1.5 sm:gap-2 shadow-xs text-center whitespace-nowrap"
              >
                <i data-lucide="check" class="w-4 h-4 shrink-0"></i>
                <span class="inline md:hidden">Simpan</span>
                <span class="hidden md:inline">Simpan Perubahan</span>
              </button>
            </div>

            <!-- Baris Bawah Mobile: Tombol Hapus Transaksi (Membentang Penuh w-full) / Kiri Desktop -->
            <button
              id="btn-delete-from-edit"
              type="button"
              class="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-xs font-bold transition-colors cursor-pointer active:opacity-80 shadow-2xs order-2 md:order-1"
            >
              <i data-lucide="trash-2" class="w-4 h-4 shrink-0"></i>
              <span>Hapus Transaksi</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  `;

  renderIcons(root);

  // Setup radio tipe transaksi toggle visual
  const radioLabels = root.querySelectorAll('input[name="edit_tx_type"]');
  radioLabels.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const isExpense = e.target.value === 'expense';
      const expenseLabel = root.querySelector('input[name="edit_tx_type"][value="expense"]').parentElement;
      const incomeLabel = root.querySelector('input[name="edit_tx_type"][value="income"]').parentElement;

      if (isExpense) {
        expenseLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-400 font-bold text-sm transition-all';
        incomeLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm cursor-pointer transition-all';
      } else {
        incomeLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer border-emerald-600/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-sm transition-all';
        expenseLabel.className = 'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-[#E4E4E7] dark:border-[#27272A] bg-zinc-50/50 dark:bg-zinc-800/50 text-[#71717A] dark:text-[#A1A1AA] font-bold text-sm cursor-pointer transition-all';
      }
    });
  });

  // Setup toggle mode kategori: Pilih Pos vs Ketik Bebas
  const btnEditCatModeSelect = root.querySelector('#btn-edit-cat-mode-select');
  const btnEditCatModeCustom = root.querySelector('#btn-edit-cat-mode-custom');
  const containerEditCatSelect = root.querySelector('#container-edit-cat-select');
  const containerEditCatCustom = root.querySelector('#container-edit-cat-custom');
  const inputEditCatCustom = root.querySelector('#edit_tx_category_custom');

  btnEditCatModeSelect?.addEventListener('click', () => {
    editCatMode = 'select';
    containerEditCatSelect?.classList.remove('hidden');
    containerEditCatCustom?.classList.add('hidden');
    btnEditCatModeSelect.className = 'px-2 py-0.5 rounded-md font-semibold transition-all bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs';
    btnEditCatModeCustom.className = 'px-2 py-0.5 rounded-md font-semibold transition-all text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]';
  });

  btnEditCatModeCustom?.addEventListener('click', () => {
    editCatMode = 'custom';
    containerEditCatSelect?.classList.add('hidden');
    containerEditCatCustom?.classList.remove('hidden');
    btnEditCatModeCustom.className = 'px-2 py-0.5 rounded-md font-semibold transition-all bg-white dark:bg-[#121214] text-[#09090B] dark:text-[#F4F4F5] shadow-2xs';
    btnEditCatModeSelect.className = 'px-2 py-0.5 rounded-md font-semibold transition-all text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5]';
    inputEditCatCustom?.focus();
  });

  // Tombol Close & Batal
  root.querySelector('#btn-close-edit-tx')?.addEventListener('click', closeModal);
  root.querySelector('#btn-cancel-edit-tx')?.addEventListener('click', closeModal);

  // Tombol Hapus Transaksi dari dalam Modal Edit (Memicu konfirmasi ganda)
  root.querySelector('#btn-delete-from-edit')?.addEventListener('click', () => {
    openConfirmDeleteTransactionModal({
      transaction: tx,
      onConfirm: async () => {
        deleteTransaction(tx.id);
        showToast('Transaksi berhasil dihapus', 'success');
        try {
          await deleteTransactionApi(tx.id);
        } catch (err) {
          console.warn('[EditModal] Gagal sinkronisasi DELETE ke Cloudflare Worker:', err);
        }
        closeModal();
        if (typeof options.onDelete === 'function') {
          options.onDelete();
        }
      },
    });
  });

  // Form submit (Simpan Perubahan)
  const form = root.querySelector('#form-edit-transaction');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const typeRadio = root.querySelector('input[name="edit_tx_type"]:checked');
    const type = typeRadio ? typeRadio.value : txType;
    const amount = Number(root.querySelector('#edit_tx_amount')?.value);

    if (!amount || amount <= 0) {
      alert('Nominal harus lebih besar dari 0');
      return;
    }

    let category = '';
    if (editCatMode === 'custom') {
      category = inputEditCatCustom?.value?.trim() || 'Lainnya';
    } else {
      category = root.querySelector('#edit_tx_category')?.value || 'Lainnya';
    }

    const accountId = root.querySelector('#edit_tx_account')?.value || currentWalletId;
    const selectedAccount = accounts.find((a) => String(a.id) === String(accountId));
    const accountName = selectedAccount?.name || 'Rekening';
    const date = root.querySelector('#edit_tx_date')?.value || txDate;
    const note = root.querySelector('#edit_tx_note')?.value?.trim() || '';

    const updatedTx = updateTransaction(tx.id, {
      type,
      amount,
      category,
      wallet_id: accountId,
      accountId,
      accountName,
      date,
      note,
      notes: note,
    });

    showToast('Transaksi berhasil diperbarui', 'success');
    closeModal();

    try {
      await updateTransactionApi(tx.id, {
        type,
        amount,
        category,
        wallet_id: accountId,
        date,
        note,
      });
    } catch (err) {
      console.warn('[EditModal] Gagal sinkronisasi PUT ke Cloudflare Worker:', err);
    }

    if (typeof options.onSuccess === 'function') {
      options.onSuccess(updatedTx);
    }
  });
}

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
  const root = modalRoot();
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
  const root = modalRoot();
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

/**
 * Helper untuk parsing intensi pencatatan transaksi dari pesan teks obrolan AI
 * @param {string} text
 * @param {Array} accounts
 * @param {Array} categories
 * @returns {Object|null}
 */
export function parseTransactionIntent(text, accounts = [], categories = []) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // Abaikan jika pertanyaan umum non-pencatatan
  if (
    lower.includes('?') ||
    lower.startsWith('apakah') ||
    lower.startsWith('bagaimana') ||
    lower.startsWith('gimana') ||
    lower.startsWith('apa saja') ||
    lower.startsWith('kenapa') ||
    lower.startsWith('mengapa') ||
    lower.includes('aman kah') ||
    lower.includes('aman tidak') ||
    lower.includes('aman gak')
  ) {
    return null;
  }

  // 1. Deteksi Nominal Transaksi
  let amount = 0;
  const jtMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:jt|juta)\b/);
  const rbMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:rb|ribu|k)\b/);
  const rpMatch = lower.match(/(?:rp\.?|idr)\s*(\d+(?:[.,]\d+)*)/);
  const plainNumberMatch = lower.match(/\b(\d{1,3}(?:\.\d{3})+|\d{4,9})\b/);

  if (jtMatch) {
    amount = parseFloat(jtMatch[1].replace(',', '.')) * 1000000;
  } else if (rbMatch) {
    amount = parseFloat(rbMatch[1].replace(',', '.')) * 1000;
  } else if (rpMatch) {
    const raw = rpMatch[1].replace(/\./g, '').replace(',', '.');
    amount = parseFloat(raw);
  } else if (plainNumberMatch) {
    const raw = plainNumberMatch[1].replace(/\./g, '').replace(',', '.');
    amount = parseFloat(raw);
  }

  if (!amount || isNaN(amount) || amount <= 0) return null;

  // 2. Deteksi Tipe Transaksi (Income vs Expense)
  const incomeKeywords = [
    'pemasukan', 'income', 'gaji', 'transfer masuk', 'dana masuk',
    'uang masuk', 'freelance', 'bonus', 'dividen', 'cair', 'dapat uang',
    'terima uang', 'penerimaan', 'setoran'
  ];
  const isIncome = incomeKeywords.some((kw) => lower.includes(kw));
  const type = isIncome ? 'income' : 'expense';

  // 3. Deteksi Rekening
  let matchedAccount = null;
  let accountClarificationNeeded = true;
  for (const acc of accounts) {
    if (lower.includes(acc.name.toLowerCase())) {
      matchedAccount = acc;
      accountClarificationNeeded = false;
      break;
    }
  }
  if (!matchedAccount) {
    const commonAliases = ['bni', 'bca', 'mandiri', 'bri', 'gopay', 'ovo', 'dana', 'shopeepay', 'cash', 'tunai', 'jago', 'seabank'];
    for (const alias of commonAliases) {
      if (lower.includes(alias)) {
        matchedAccount = accounts.find((a) => a.name.toLowerCase().includes(alias)) || { id: 'acc-' + alias, name: alias.toUpperCase() };
        accountClarificationNeeded = false;
        break;
      }
    }
  }
  if (!matchedAccount) {
    matchedAccount = accounts[0] || { id: 'acc-main', name: 'Dompet Utama' };
    accountClarificationNeeded = true;
  }

  // 4. Deteksi Kategori
  let categoryName = isIncome ? 'Gaji & Pemasukan' : 'Belanja';
  const categoryKeywords = {
    'Makanan': ['makan', 'kopi', 'ngopi', 'cafe', 'resto', 'sarapan', 'lunch', 'dinner', 'snack', 'minum', 'bakso', 'mie'],
    'Transportasi': ['bensin', 'pertalite', 'pertamax', 'ojol', 'grab', 'gojek', 'parkir', 'tol', 'kereta', 'mrt', 'busway'],
    'Tagihan': ['listrik', 'pln', 'pdam', 'air', 'wifi', 'indihome', 'pulsa', 'kuota', 'bpjs', 'netflix', 'spotify'],
    'Belanja': ['belanja', 'supermarket', 'indomaret', 'alfamart', 'shopee', 'tokopedia', 'baju', 'kaos', 'sepatu'],
    'Gaji': ['gaji', 'salary', 'payroll', 'upah', 'freelance', 'honor'],
    'Kesehatan': ['obat', 'dokter', 'apotek', 'klinik', 'vitamin', 'rumahsakit', 'rs'],
  };

  for (const cat of categories) {
    if (lower.includes(cat.name.toLowerCase())) {
      categoryName = cat.name;
      break;
    }
  }
  if (categoryName === (isIncome ? 'Gaji & Pemasukan' : 'Belanja')) {
    for (const [catGroup, words] of Object.entries(categoryKeywords)) {
      if (words.some((w) => lower.includes(w))) {
        const found = categories.find((c) => c.name.toLowerCase().includes(catGroup.toLowerCase()));
        categoryName = found ? found.name : (catGroup === 'Makanan' ? 'Makanan & Minuman' : catGroup);
        break;
      }
    }
  }

  // 5. Bersihkan Deskripsi / Keterangan Transaksi
  let desc = text;
  const stripWords = [
    'catat', 'tolong', 'masukkan', 'tambahkan', 'pengeluaran', 'pemasukan', 'transaksi',
    'pakai', 'via', 'dari', 'ke', 'buat', 'untuk', 'sebesar', 'seharga', 'rp', 'idr', 'beli', 'bayar'
  ];
  const words = desc.split(/\s+/).filter((w) => {
    const lw = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (stripWords.includes(lw)) return false;
    if (accounts.some((a) => a.name.toLowerCase() === lw)) return false;
    if (['bni', 'bca', 'mandiri', 'bri', 'gopay', 'ovo', 'dana'].includes(lw)) return false;
    if (w.match(/^(?:rp\.?|idr)?\d+(?:[.,]\d+)*(?:jt|juta|rb|ribu|k)?$/i)) return false;
    return true;
  });
  desc = words.join(' ').trim();
  if (!desc) {
    desc = isIncome ? 'Penerimaan Dana' : categoryName;
  }
  desc = desc.charAt(0).toUpperCase() + desc.slice(1);

  return {
    type,
    amount,
    description: desc,
    category_name: categoryName,
    account_name: matchedAccount.name,
    accountId: matchedAccount.id,
    accountClarificationNeeded,
  };
}

/**
 * Merender kartu draft transaksi interaktif (Opsi B) di balon pesan AI Chat
 * @param {Object} data
 * @param {('expense'|'income')} [data.type='expense']
 * @param {number} data.amount
 * @param {string} [data.description]
 * @param {string} [data.category_name]
 * @param {string} [data.account_name]
 * @param {string} [data.accountId]
 * @param {string} [data.date]
 * @param {Object} [options]
 * @param {(tx: Object) => void} [options.onSaveDraft]
 * @returns {HTMLDivElement}
 */
export function renderDraftTransactionCard(data = {}, options = {}) {
  const card = document.createElement('div');
  card.className = 'rounded-2xl p-3.5 mt-2 bg-white dark:bg-[#18181B] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col gap-2.5 text-left text-xs sm:text-sm';

  const type = data.type === 'income' ? 'income' : 'expense';
  const amountNum = Number(data.amount) || 0;
  const description = data.description || data.notes || data.merchant || 'Transaksi';
  const categoryName = data.category_name || data.category || (type === 'income' ? 'Gaji & Pemasukan' : 'Belanja');
  let accountName = data.account_name || data.accountName || 'Dompet Utama';
  let accountId = data.accountId || data.wallet_id || null;
  const date = data.date || new Date().toISOString().slice(0, 10);

  let isSaved = false;
  let isSaving = false;

  const isIncome = type === 'income';

  card.innerHTML = `
    <!-- Header Kartu: Badge Tipe & Nominal -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        ${isIncome
          ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
               <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
               Pemasukan
             </span>`
          : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
               <i data-lucide="arrow-down-left" class="w-3 h-3"></i>
               Pengeluaran
             </span>`
        }
      </div>
      <span class="text-sm sm:text-base font-extrabold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
        ${isIncome ? '+' : '-'}${formatRupiah(amountNum)}
      </span>
    </div>

    <!-- Baris Detail: Rekening, Kategori, Keterangan -->
    <div class="flex flex-col gap-1.5 py-0.5">
      <div class="flex items-center gap-2 text-xs flex-wrap">
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200/60 dark:border-zinc-700/60 text-xs">
          <i data-lucide="wallet" class="w-3 h-3 text-zinc-400"></i>
          <span class="draft-account-label">${accountName}</span>
        </span>
        <span class="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          <i data-lucide="folder-open" class="w-3 h-3 text-zinc-400"></i>
          <span class="draft-category-label">${categoryName}</span>
        </span>
      </div>
      <p class="text-xs text-zinc-700 dark:text-zinc-300 font-medium line-clamp-2 mt-0.5">
        ${description}
      </p>
    </div>

    <!-- Tombol Aksi (Dua Tombol Sejajar) -->
    <div class="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
      <button
        type="button"
        class="btn-save-draft bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
      >
        <i data-lucide="check" class="w-3.5 h-3.5"></i>
        <span>Simpan ke Kas</span>
      </button>

      <button
        type="button"
        class="btn-edit-draft border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs px-3 py-1.5 rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer flex items-center justify-center gap-1 active:scale-95"
      >
        <i data-lucide="pencil" class="w-3 h-3"></i>
        <span>Edit</span>
      </button>
    </div>
  `;

  renderIcons(card);

  const btnSave = card.querySelector('.btn-save-draft');
  const btnEdit = card.querySelector('.btn-edit-draft');
  const labelAccount = card.querySelector('.draft-account-label');

  // Helper method untuk memperbarui rekening secara reaktif
  card.updateAccount = (newAccName, newAccId) => {
    accountName = newAccName;
    if (newAccId) accountId = newAccId;
    data.account_name = newAccName;
    if (newAccId) data.accountId = newAccId;
    if (labelAccount) {
      labelAccount.textContent = newAccName;
    }
  };

  card.isSaved = () => isSaved;

  // Interaksi tombol Simpan ke Kas
  btnSave?.addEventListener('click', async () => {
    if (isSaved || isSaving) return;
    isSaving = true;

    btnSave.disabled = true;
    btnSave.innerHTML = `
      <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
      <span>Menyimpan...</span>
    `;

    try {
      const state = getState();
      const accounts = state.accounts || [];
      const categories = state.categories || [];

      // Cari rekening target
      let targetAccount = null;
      if (accountId) {
        targetAccount = accounts.find((a) => String(a.id) === String(accountId));
      }
      if (!targetAccount && accountName) {
        targetAccount = accounts.find(
          (a) => a.name.toLowerCase() === accountName.toLowerCase() ||
                 a.name.toLowerCase().includes(accountName.toLowerCase()) ||
                 accountName.toLowerCase().includes(a.name.toLowerCase())
        );
      }
      if (!targetAccount) {
        targetAccount = accounts[0] || { id: 'acc-main', name: 'Dompet Utama' };
      }

      const txCategory = categoryName || (type === 'income' ? 'Gaji & Pemasukan' : 'Belanja');
      const txNotes = description || 'Transaksi';

      const newTx = {
        id: `tx-${Date.now()}`,
        type,
        amount: amountNum,
        category: txCategory,
        accountId: targetAccount.id,
        wallet_id: targetAccount.id,
        wallet: targetAccount.id,
        accountName: targetAccount.name,
        date: date || new Date().toISOString().slice(0, 10),
        notes: txNotes,
        note: txNotes,
        receiptImage: data.receiptImage || null,
        created_at: new Date().toISOString(),
      };

      // 1. Simpan transaksi langsung ke Cloudflare D1 via Worker API
      await createTransactionApi({
        id: newTx.id,
        wallet_id: targetAccount.id,
        accountId: targetAccount.id,
        amount: amountNum,
        type,
        category: txCategory,
        note: txNotes,
        notes: txNotes,
        date: newTx.date,
      });

      // 2. Perbarui saldo akun
      const updatedAccounts = accounts.map((a) => {
        if (String(a.id) === String(targetAccount.id)) {
          const currentBal = Number(a.balance) || 0;
          return {
            ...a,
            balance: type === 'expense' ? currentBal - amountNum : currentBal + amountNum,
          };
        }
        return a;
      });

      // 3. Perbarui pemakaian anggaran jika pengeluaran
      const updatedCategories = categories.map((c) => {
        if (c.name === txCategory && type === 'expense') {
          return {
            ...c,
            spent: (Number(c.spent) || 0) + amountNum,
          };
        }
        return c;
      });

      // 4. Simpan ke state global
      setState({
        transactions: [newTx, ...(state.transactions || [])],
        accounts: updatedAccounts,
        categories: updatedCategories,
      });

      // Pemicu event dispatch
      document.dispatchEvent(new CustomEvent('transaction-saved', { detail: newTx }));

      if (typeof options.onSaveDraft === 'function') {
        options.onSaveDraft(newTx);
      }

      showToast('Transaksi berhasil disimpan ke kas', 'success');

      // Transformasi tombol ke status visual "✓ Tersimpan" (disabled)
      isSaved = true;
      btnSave.disabled = true;
      btnSave.className = 'btn-save-draft bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-default opacity-100';
      btnSave.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>✓ Tersimpan</span>`;

      if (btnEdit) {
        btnEdit.disabled = true;
        btnEdit.className = 'btn-edit-draft border border-zinc-200/50 dark:border-zinc-800 text-xs px-3 py-1.5 rounded-xl text-zinc-400 dark:text-zinc-600 opacity-40 cursor-not-allowed pointer-events-none flex items-center justify-center gap-1';
      }

      renderIcons(card);
    } catch (err) {
      console.error('[renderDraftTransactionCard] Gagal menyimpan draft transaksi:', err);
      btnSave.disabled = false;
      btnSave.className = 'btn-save-draft bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs';
      btnSave.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>Simpan ke Kas</span>`;
      renderIcons(card);
      showToast('Gagal menyimpan transaksi: ' + (err.message || err), 'error');
    } finally {
      isSaving = false;
    }
  });

  // Interaksi tombol Edit
  btnEdit?.addEventListener('click', () => {
    if (isSaved) return;
    openTransactionModal({
      initialData: {
        type,
        amount: amountNum,
        category: categoryName,
        notes: description,
        merchant: '',
        accountId,
        account_name: accountName,
        date,
      },
      onSuccess: (savedTx) => {
        isSaved = true;
        btnSave.disabled = true;
        btnSave.className = 'btn-save-draft bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-default opacity-100';
        btnSave.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>✓ Tersimpan</span>`;

        if (btnEdit) {
          btnEdit.disabled = true;
          btnEdit.className = 'btn-edit-draft border border-zinc-200/50 dark:border-zinc-800 text-xs px-3 py-1.5 rounded-xl text-zinc-400 dark:text-zinc-600 opacity-40 cursor-not-allowed pointer-events-none flex items-center justify-center gap-1';
        }

        renderIcons(card);

        if (typeof options.onSaveDraft === 'function') {
          options.onSaveDraft(savedTx);
        }
      },
    });
  });

  return card;
}

/**
 * Merender deretan chip interaktif rekening aktif untuk quick-select
 * @param {Object} [options]
 * @param {Array} [options.accounts]
 * @param {string} [options.label='Pilih rekening:']
 * @param {(account: Object) => void} [options.onSelect]
 * @returns {HTMLDivElement}
 */
export function renderAccountQuickSelectChips(options = {}) {
  const accounts = options.accounts || getState().accounts || [];
  const container = document.createElement('div');
  container.className = 'account-chips-container mt-2 flex flex-col gap-1.5';

  const labelText = options.label || 'Pilih rekening:';
  const label = document.createElement('p');
  label.className = 'text-[11px] font-medium text-zinc-500 dark:text-zinc-400';
  label.textContent = labelText;
  container.appendChild(label);

  const chipsWrapper = document.createElement('div');
  chipsWrapper.className = 'flex items-center gap-1.5 flex-wrap';

  accounts.forEach((acc) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'account-chip px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 select-none';
    chip.setAttribute('data-account-id', acc.id);
    chip.setAttribute('data-account-name', acc.name);
    chip.innerHTML = `
      <i data-lucide="wallet" class="w-3 h-3 text-zinc-400"></i>
      <span>${acc.name}</span>
    `;

    chip.addEventListener('click', () => {
      if (typeof options.onSelect === 'function') {
        options.onSelect(acc);
      }
      chipsWrapper.querySelectorAll('.account-chip').forEach((c) => {
        c.className = 'account-chip px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 select-none';
      });
      chip.className = 'account-chip px-2.5 py-1 rounded-full text-xs font-semibold bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] border border-transparent transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 select-none shadow-xs';
      renderIcons(chipsWrapper);
    });

    chipsWrapper.appendChild(chip);
  });

  container.appendChild(chipsWrapper);
  renderIcons(container);
  return container;
}

/**
 * Menampilkan Modal / Drawer Tanya AI Finansial
 * Asisten AI cerdas untuk konsultasi anggaran, evaluasi pengeluaran, dan burn rate.
 * @param {Object} [options]
 */
export function openChatAiModal(options = {}) {
  const root = modalRoot();
  if (!root) return;

  const state = getState();
  const transactions = state.transactions || [];
  const categories = state.categories || [];
  const accounts = state.accounts || [];

  // Hitung ringkasan keuangan terkini dari state D1
  const totalBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentDay = now.getDate();
  const remainingDays = Math.max(1, daysInMonth - currentDay);

  const thisMonthExpenses = transactions
    .filter((t) => t.type === 'expense' && (t.date || '').startsWith(currentMonthStr))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const thisMonthIncome = transactions
    .filter((t) => t.type === 'income' && (t.date || '').startsWith(currentMonthStr))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const dailyBurnRate = currentDay > 0 ? Math.round(thisMonthExpenses / currentDay) : 0;

  const getWelcomeMessageHtml = () => `
    <!-- Welcome Message from AI -->
    <div class="flex items-start gap-2.5">
      <div class="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
        <i data-lucide="bot" class="w-4 h-4"></i>
      </div>
      <div class="bg-zinc-100 dark:bg-zinc-800/80 text-[#09090B] dark:text-[#F4F4F5] p-3.5 rounded-2xl rounded-tl-xs max-w-[88%] space-y-2 border border-zinc-200/60 dark:border-zinc-700/60">
        <p>Halo! Saya <strong>AI Finansial</strong> Anda. 🤖</p>
        <p class="text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
          Saya terhubung langsung ke data mutasi Cloudflare D1 Anda. Silakan tanyakan ringkasan keuangan, analisis pos pengeluaran, atau evaluasi burn rate!
        </p>
        <div class="pt-2 border-t border-zinc-200 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
          <span>Total Saldo: <strong class="text-[#09090B] dark:text-[#F4F4F5]">${formatRupiah(totalBalance)}</strong></span>
          <span>Pengeluaran: <strong class="text-rose-600 dark:text-rose-400">${formatRupiah(thisMonthExpenses)}</strong></span>
        </div>
      </div>
    </div>
  `;

  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div id="chat-ai-card" class="bg-[#FFFFFF] dark:bg-[#121214] rounded-2xl shadow-2xl border border-[#E4E4E7] dark:border-[#27272A] max-w-lg w-full flex flex-col h-[85vh] max-h-[640px] my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        
        <!-- Header Modal -->
        <div class="flex items-center justify-between p-3.5 sm:p-5 border-b border-[#E4E4E7] dark:border-[#27272A] shrink-0 bg-white/50 dark:bg-[#121214]/50 backdrop-blur-md">
          <div class="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 mr-2 sm:mr-3">
            <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
              <i data-lucide="bot" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h3 class="text-sm sm:text-base font-bold text-[#09090B] dark:text-[#F4F4F5] truncate">AI Chat Finansial</h3>
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  Online
                </span>
              </div>
              <p class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] truncate">Konsultasi & Analisis Anggaran</p>
            </div>
          </div>

          <!-- Kontainer Aksi Pojok Kanan Atas -->
          <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <!-- Tombol Trash2 (Clear Chat) -->
            <button
              id="btn-clear-chat-ai"
              type="button"
              title="Bersihkan Obrolan"
              class="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer active:scale-95"
            >
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>

            <!-- Tombol X (Close Modal) -->
            <button
              id="btn-close-chat-ai"
              type="button"
              title="Tutup Modal"
              class="w-8 h-8 rounded-full flex items-center justify-center text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95"
            >
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Chat Stream Container -->
        <div id="chat-ai-messages" class="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs sm:text-sm">
          <div id="chat-history-loading" class="flex items-center justify-center py-12 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <div class="w-4 h-4 border-2 border-zinc-400 dark:border-zinc-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Memuat riwayat percakapan...</span>
          </div>
        </div>

        <!-- Quick Suggestion Chips -->
        <div class="px-3 sm:px-4 py-2 border-t border-[#E4E4E7]/60 dark:border-[#27272A]/60 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button type="button" class="chat-suggestion-chip shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer select-none" data-prompt="Bagaimana ringkasan keuangan saya bulan ini?">
            💡 Ringkasan bulan ini
          </button>
          <button type="button" class="chat-suggestion-chip shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer select-none" data-prompt="Apa saja kategori pengeluaran terbesar saya?">
            📊 Pengeluaran terbesar
          </button>
          <button type="button" class="chat-suggestion-chip shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer select-none" data-prompt="Berapa daily burn rate saya dan tips penghematannya?">
            🔥 Daily Burn Rate
          </button>
          <button type="button" class="chat-suggestion-chip shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer select-none" data-prompt="Bagaimana status alokasi pos anggaran saya?">
            🎯 Evaluasi pos anggaran
          </button>
        </div>

        <!-- Chat Input Form -->
        <div class="p-3 sm:p-4 border-t border-[#E4E4E7] dark:border-[#27272A] bg-white dark:bg-[#121214] shrink-0">
          <form id="chat-ai-form" class="flex items-center gap-2">
            <input
              type="text"
              id="chat-ai-input"
              placeholder="Tanyakan analisis keuangan atau saran pos anggaran..."
              autocomplete="off"
              class="flex-1 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-zinc-100 dark:bg-zinc-800/80 border border-[#E4E4E7] dark:border-[#27272A] text-[#09090B] dark:text-[#F4F4F5] placeholder-[#71717A] dark:placeholder-[#A1A1AA] focus:outline-hidden focus:ring-2 focus:ring-[#09090B] dark:focus:ring-white transition-all"
            />
            <button
              type="submit"
              id="btn-chat-ai-send"
              title="Kirim Pertanyaan"
              class="px-3.5 py-2.5 rounded-xl bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center shrink-0 active:opacity-85 shadow-2xs"
            >
              <i data-lucide="send" class="w-4 h-4"></i>
            </button>
          </form>
        </div>

      </div>
    </div>
  `;

  renderIcons(root);

  const messagesContainer = root.querySelector('#chat-ai-messages');
  const chatForm = root.querySelector('#chat-ai-form');
  const chatInput = root.querySelector('#chat-ai-input');
  const closeBtn = root.querySelector('#btn-close-chat-ai');
  const backdrop = root.querySelector('#modal-backdrop');

  const scrollToBottom = () => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  const generateAiReply = (question) => {
    const q = question.toLowerCase();

    // 1. Ringkasan Keuangan
    if (q.includes('ringkasan') || q.includes('bulan ini') || q.includes('keuangan')) {
      const netMonth = thisMonthIncome - thisMonthExpenses;
      const netText = netMonth >= 0
        ? `Surplus bersih bulan ini adalah <strong>+${formatRupiah(netMonth)}</strong>.`
        : `Defisit bulan ini sebesar <strong class="text-rose-500">-${formatRupiah(Math.abs(netMonth))}</strong>.`;

      return `
        <p>📊 <strong>Ringkasan Finansial Bulan Ini (${currentMonthStr}):</strong></p>
        <ul class="list-disc list-inside space-y-1 text-[#71717A] dark:text-[#A1A1AA] mt-1.5">
          <li>Total Pemasukan: <span class="text-emerald-600 dark:text-emerald-400 font-semibold">${formatRupiah(thisMonthIncome)}</span></li>
          <li>Total Pengeluaran: <span class="text-rose-600 dark:text-rose-400 font-semibold">${formatRupiah(thisMonthExpenses)}</span></li>
          <li>Total Saldo Bersih Seluruh Rekening: <span class="font-semibold text-[#09090B] dark:text-[#F4F4F5]">${formatRupiah(totalBalance)}</span></li>
        </ul>
        <p class="mt-2 text-[#71717A] dark:text-[#A1A1AA]">${netText}</p>
      `;
    }

    // 2. Kategori Pengeluaran Terbesar
    if (q.includes('terbesar') || q.includes('kategori') || q.includes('pos')) {
      const catMap = {};
      transactions
        .filter((t) => t.type === 'expense' && (t.date || '').startsWith(currentMonthStr))
        .forEach((t) => {
          const c = t.category || 'Lainnya';
          catMap[c] = (catMap[c] || 0) + (Number(t.amount) || 0);
        });

      const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
      if (sortedCats.length === 0) {
        return `<p>Belum ada transaksi pengeluaran yang tercatat pada bulan ini (${currentMonthStr}). Pengeluaran Anda masih Rp 0!</p>`;
      }

      const listHtml = sortedCats.slice(0, 4).map(([cat, amt], i) => {
        const pct = thisMonthExpenses > 0 ? Math.round((amt / thisMonthExpenses) * 100) : 0;
        return `<li><strong>#${i + 1} ${cat}</strong>: ${formatRupiah(amt)} (${pct}%)</li>`;
      }).join('');

      return `
        <p>📈 <strong>Top Pos Pengeluaran Bulan Ini:</strong></p>
        <ul class="list-disc list-inside space-y-1 text-[#71717A] dark:text-[#A1A1AA] mt-1.5">
          ${listHtml}
        </ul>
        <p class="mt-2 text-[#71717A] dark:text-[#A1A1AA]">Pengeluaran terbesar ada di kategori <strong>${sortedCats[0][0]}</strong>. Mengontrol pos ini akan memberikan dampak penghematan terbesar.</p>
      `;
    }

    // 3. Daily Burn Rate
    if (q.includes('burn rate') || q.includes('daily') || q.includes('tips') || q.includes('hemat')) {
      const projectedMonth = dailyBurnRate * daysInMonth;
      const safeDailyBudget = remainingDays > 0 && totalBalance > 0
        ? Math.round((totalBalance * 0.3) / remainingDays)
        : 0;

      return `
        <p>🔥 <strong>Analisis Daily Burn Rate:</strong></p>
        <ul class="list-disc list-inside space-y-1 text-[#71717A] dark:text-[#A1A1AA] mt-1.5">
          <li>Rata-rata Pengeluaran Harian: <strong>${formatRupiah(dailyBurnRate)}/hari</strong></li>
          <li>Sisa Hari Bulan Ini: <strong>${remainingDays} hari</strong></li>
          <li>Estimasi Pengeluaran Akhir Bulan: <strong>${formatRupiah(projectedMonth)}</strong></li>
        </ul>
        <p class="mt-2 text-[#71717A] dark:text-[#A1A1AA]">💡 <em>Rekomendasi Cerdas:</em> Pertahankan pengeluaran harian di bawah <strong>${formatRupiah(Math.max(50000, safeDailyBudget))}</strong> agar rasio tabungan Anda tetap terjaga sehat.</p>
      `;
    }

    // 4. Evaluasi Pos Anggaran
    if (q.includes('anggaran') || q.includes('plafon') || q.includes('evaluasi')) {
      if (!categories || categories.length === 0) {
        return `<p>Anda belum memiliki pos anggaran yang dialokasikan. Tambahkan pos anggaran di tab Beranda untuk mulai melacak batas pengeluaran per kategori.</p>`;
      }

      const overBudget = [];
      const healthyBudget = [];

      categories.forEach((cat) => {
        const spent = transactions
          .filter((t) => t.type === 'expense' && t.category === cat.name && (t.date || '').startsWith(currentMonthStr))
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const limit = Number(cat.monthlyBudget) || 0;
        if (limit > 0) {
          const ratio = (spent / limit) * 100;
          if (ratio >= 90) {
            overBudget.push(`${cat.name} (${Math.round(ratio)}% - ${formatRupiah(spent)} / ${formatRupiah(limit)})`);
          } else {
            healthyBudget.push(`${cat.name} (${Math.round(ratio)}%)`);
          }
        }
      });

      if (overBudget.length > 0) {
        return `
          <p>⚠️ <strong>Peringatan Plafon Anggaran:</strong></p>
          <p class="text-rose-600 dark:text-rose-400 mt-1">Kategori berikut mendekati atau melebihi kuota:</p>
          <ul class="list-disc list-inside space-y-1 text-[#71717A] dark:text-[#A1A1AA] mt-1">
            ${overBudget.map(c => `<li>${c}</li>`).join('')}
          </ul>
        `;
      }

      return `
        <p>✅ <strong>Kondisi Anggaran Aman!</strong></p>
        <p class="text-[#71717A] dark:text-[#A1A1AA] mt-1">Seluruh pos anggaran kategori Anda saat ini berada dalam batas aman di bawah kuota bulanan.</p>
      `;
    }

    // Default Jawaban Bantuan Umum
    return `
      <p>Terima kasih atas pertanyaannya! 💡</p>
      <p class="text-[#71717A] dark:text-[#A1A1AA] leading-relaxed mt-1">
        Berdasarkan data rekening aktif Anda dengan total saldo <strong>${formatRupiah(totalBalance)}</strong> dan pengeluaran <strong>${formatRupiah(thisMonthExpenses)}</strong>, portofolio kas Anda stabil. Anda dapat memilih salah satu chip rekomendasi di atas untuk evaluasi mendalam.
      </p>
    `;
  };

  let activeDraftCard = null;
  let chatHistory = [];
  const sendBtn = root.querySelector('#btn-chat-ai-send');

  const appendUserBubble = (content) => {
    const userBubble = document.createElement('div');
    userBubble.className = 'flex items-start justify-end gap-2.5 animate-in fade-in duration-100';
    const bubbleCard = document.createElement('div');
    bubbleCard.className = 'bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] px-3.5 py-2.5 rounded-2xl rounded-tr-xs max-w-[85%] text-xs sm:text-sm font-medium leading-relaxed';
    const p = document.createElement('p');
    p.textContent = content;
    bubbleCard.appendChild(p);
    userBubble.appendChild(bubbleCard);
    messagesContainer.appendChild(userBubble);
    scrollToBottom();
    return userBubble;
  };

  const appendAssistantBubble = (content, draftData = null) => {
    const aiBubble = document.createElement('div');
    aiBubble.className = 'flex items-start gap-2.5 animate-in fade-in duration-150';

    const aiBubbleInner = document.createElement('div');
    aiBubbleInner.className = 'bg-zinc-100 dark:bg-zinc-800/80 text-[#09090B] dark:text-[#F4F4F5] p-3.5 rounded-2xl rounded-tl-xs max-w-[90%] sm:max-w-[88%] space-y-2 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col';

    if (content) {
      const p = document.createElement('div');
      p.className = 'leading-relaxed space-y-1.5 text-xs sm:text-sm';
      if (!content.includes('<p>') && !content.includes('<div>') && !content.includes('<ul>')) {
        p.innerHTML = `<p>${content.replace(/\n/g, '<br/>')}</p>`;
      } else {
        p.innerHTML = content;
      }
      aiBubbleInner.appendChild(p);
    }

    if (draftData) {
      const draftCard = renderDraftTransactionCard(draftData, {
        onSaveDraft: () => {
          if (activeDraftCard === draftCard) {
            activeDraftCard = null;
          }
        },
      });
      activeDraftCard = draftCard;
      aiBubbleInner.appendChild(draftCard);

      const currentAccounts = getState().accounts || [];
      if (draftData.needs_account_clarification && currentAccounts.length > 0) {
        const clarificationMsg = document.createElement('p');
        clarificationMsg.className = 'text-xs text-zinc-500 dark:text-zinc-400 mt-1';
        clarificationMsg.textContent = draftData.type === 'income'
          ? 'Masuk ke rekening mana nih? Klik salah satu di bawah jika ingin mengubah:'
          : 'Bayar pakai apa nih? Klik salah satu di bawah jika ingin mengubah:';
        aiBubbleInner.appendChild(clarificationMsg);

        const chipsEl = renderAccountQuickSelectChips({
          accounts: currentAccounts,
          label: 'Pilihan rekening aktif:',
          onSelect: (selectedAcc) => {
            draftCard.updateAccount(selectedAcc.name, selectedAcc.id);
            if (chatInput) {
              chatInput.value = selectedAcc.name;
            }
            showToast(`Rekening diatur ke ${selectedAcc.name}`, 'info');
          },
        });
        aiBubbleInner.appendChild(chipsEl);
      }
    }

    aiBubble.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
        <i data-lucide="bot" class="w-4 h-4"></i>
      </div>
    `;
    aiBubble.appendChild(aiBubbleInner);
    messagesContainer.appendChild(aiBubble);
    renderIcons(aiBubble);
    scrollToBottom();
    return aiBubble;
  };

  const showTypingIndicator = () => {
    removeTypingIndicator();
    const typingBubble = document.createElement('div');
    typingBubble.id = 'chat-ai-typing-indicator';
    typingBubble.className = 'flex items-start gap-2.5 animate-in fade-in duration-150';
    typingBubble.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[#09090B] dark:text-[#F4F4F5] border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
        <i data-lucide="bot" class="w-4 h-4"></i>
      </div>
      <div class="bg-zinc-100 dark:bg-zinc-800/80 text-[#09090B] dark:text-[#F4F4F5] px-3.5 py-3 rounded-2xl rounded-tl-xs border border-zinc-200/60 dark:border-zinc-700/60 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:0.2s]"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:0.4s]"></span>
      </div>
    `;
    messagesContainer.appendChild(typingBubble);
    renderIcons(typingBubble);
    scrollToBottom();
  };

  const removeTypingIndicator = () => {
    const indicator = messagesContainer?.querySelector('#chat-ai-typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  };

  const loadChatHistory = async () => {
    try {
      const messages = await fetchChatHistoryApi();
      if (messagesContainer) {
        messagesContainer.innerHTML = '';
      }

      if (Array.isArray(messages) && messages.length > 0) {
        chatHistory = messages.map((m) => ({ role: m.role, content: m.content }));
        for (const msg of messages) {
          if (msg.role === 'user') {
            appendUserBubble(msg.content);
          } else if (msg.role === 'assistant') {
            const draftData = msg.metadata?.draft || (msg.type === 'draft_card' ? msg.metadata : null);
            appendAssistantBubble(msg.content, draftData);
          }
        }
      } else {
        chatHistory = [];
        if (messagesContainer) {
          messagesContainer.innerHTML = getWelcomeMessageHtml();
          renderIcons(messagesContainer);
        }
      }
    } catch (err) {
      console.warn('[openChatAiModal] Gagal memuat riwayat percakapan dari Cloudflare D1:', err);
      chatHistory = [];
      if (messagesContainer) {
        messagesContainer.innerHTML = getWelcomeMessageHtml();
        renderIcons(messagesContainer);
      }
    } finally {
      scrollToBottom();
    }
  };

  const handleSendMessage = async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || !messagesContainer) return;

    // Render pesan user secara optimistik
    appendUserBubble(trimmed);

    // 1. Periksa apakah user mengklarifikasi rekening untuk draft aktif yang belum disimpan
    const currentAccounts = getState().accounts || [];
    const matchingAcc = currentAccounts.find((a) =>
      trimmed.toLowerCase() === a.name.toLowerCase() ||
      trimmed.toLowerCase().includes(a.name.toLowerCase()) ||
      a.name.toLowerCase().includes(trimmed.toLowerCase())
    );

    if (activeDraftCard && !activeDraftCard.isSaved() && matchingAcc && !trimmed.match(/\d/)) {
      activeDraftCard.updateAccount(matchingAcc.name, matchingAcc.id);
      chatHistory.push({ role: 'user', content: trimmed });
      const confirmationText = `Rekening draf telah disesuaikan ke <strong>${matchingAcc.name}</strong>. Silakan klik tombol <strong>Simpan ke Kas</strong> pada kartu di atas untuk menyimpan. 👍`;
      chatHistory.push({ role: 'assistant', content: `Rekening draf telah disesuaikan ke ${matchingAcc.name}.` });
      appendAssistantBubble(confirmationText);
      return;
    }

    // 2. Disable input & button kirim, tampilkan animasi typing bot
    if (chatInput) {
      chatInput.disabled = true;
    }
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    showTypingIndicator();

    try {
      const response = await sendChatMessageApi(trimmed, chatHistory);
      removeTypingIndicator();

      if (response) {
        chatHistory.push({ role: 'user', content: trimmed });
        chatHistory.push({ role: 'assistant', content: response.content || '' });

        const draftData = response.type === 'draft_card' && response.metadata?.draft ? response.metadata.draft : null;
        appendAssistantBubble(response.content, draftData);
      }
    } catch (err) {
      removeTypingIndicator();
      console.warn('[handleSendMessage] Gagal menghubungi endpoint AI /api/chat:', err);

      // Fallback respons lokal jika Worker offline / terjadi timeout
      const localIntent = parseTransactionIntent(trimmed, currentAccounts, getState().categories || []);
      if (localIntent) {
        const typeLabel = localIntent.type === 'income' ? 'pemasukan' : 'pengeluaran';
        appendAssistantBubble(`Saya sudah menyiapkan draf pencatatan <strong>${typeLabel}</strong> untuk Anda:`, localIntent);
      } else {
        const localReply = generateAiReply(trimmed);
        appendAssistantBubble(localReply);
      }
      showToast('Koneksi AI online terganggu, beralih ke asisten lokal.', 'warning');
    } finally {
      if (chatInput) {
        chatInput.disabled = false;
        chatInput.focus();
      }
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      scrollToBottom();
    }
  };

  // Event kirim form
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!chatInput) return;
    const text = chatInput.value;
    chatInput.value = '';
    handleSendMessage(text);
  });

  // Event chip saran
  root.querySelectorAll('.chat-suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        handleSendMessage(prompt);
      }
    });
  });

  // Event bersihkan obrolan (Custom In-App Confirm Dialog dengan koneksi D1)
  const clearChatBtn = root.querySelector('#btn-clear-chat-ai');
  clearChatBtn?.addEventListener('click', () => {
    if (root.querySelector('#clear-chat-confirm-backdrop')) return;

    const confirmOverlay = document.createElement('div');
    confirmOverlay.id = 'clear-chat-confirm-backdrop';
    confirmOverlay.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150';
    confirmOverlay.innerHTML = `
      <div id="clear-chat-confirm-card" class="w-full max-w-xs sm:max-w-sm rounded-2xl bg-white dark:bg-[#18181B] border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl flex flex-col items-center text-center zoom-in-95 duration-150">
        <div class="w-11 h-11 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center mb-3">
          <i data-lucide="trash-2" class="w-5 h-5"></i>
        </div>
        <h4 class="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">Bersihkan Percakapan?</h4>
        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-5">Semua riwayat obrolan di layar dan database Cloudflare D1 akan dikosongkan.</p>
        <div class="flex items-center gap-2.5 w-full">
          <button
            type="button"
            id="btn-confirm-cancel-clear"
            class="flex-1 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer active:scale-95"
          >
            Batal
          </button>
          <button
            type="button"
            id="btn-confirm-execute-clear"
            class="flex-1 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-sm active:scale-95"
          >
            Hapus
          </button>
        </div>
      </div>
    `;

    root.appendChild(confirmOverlay);
    renderIcons(confirmOverlay);

    const closeConfirmDialog = () => {
      confirmOverlay.remove();
    };

    // Klik Batal
    confirmOverlay.querySelector('#btn-confirm-cancel-clear')?.addEventListener('click', closeConfirmDialog);

    // Klik Backdrop luar
    confirmOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'clear-chat-confirm-backdrop') {
        closeConfirmDialog();
      }
    });

    // Klik Hapus (Clear Chat di Cloudflare D1 & UI)
    confirmOverlay.querySelector('#btn-confirm-execute-clear')?.addEventListener('click', async () => {
      const btnExec = confirmOverlay.querySelector('#btn-confirm-execute-clear');
      if (btnExec) {
        btnExec.disabled = true;
        btnExec.textContent = 'Menghapus...';
      }

      try {
        await clearChatHistoryApi();
        closeConfirmDialog();
        activeDraftCard = null;
        chatHistory = [];
        if (messagesContainer) {
          messagesContainer.innerHTML = `
            <div class="py-1 text-center animate-in fade-in duration-150">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-[#71717A] dark:text-[#A1A1AA] border border-zinc-200/60 dark:border-zinc-700/60">
                <i data-lucide="trash-2" class="w-3 h-3 text-rose-500"></i>
                Riwayat percakapan dibersihkan
              </span>
            </div>
            ${getWelcomeMessageHtml()}
          `;
          renderIcons(messagesContainer);
          scrollToBottom();
        }
        showToast('Riwayat percakapan berhasil dibersihkan', 'success');
      } catch (err) {
        closeConfirmDialog();
        console.error('[openChatAiModal] Gagal menghapus riwayat chat:', err);
        showToast('Gagal menghapus riwayat chat: ' + (err.message || err), 'error');
      }
    });
  });

  // Close handlers
  const handleClose = () => {
    window.removeEventListener('keydown', handleEsc);
    closeModal();
  };

  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      const existingConfirm = root.querySelector('#clear-chat-confirm-backdrop');
      if (existingConfirm) {
        existingConfirm.remove();
        return;
      }
      handleClose();
    }
  };
  window.addEventListener('keydown', handleEsc);

  closeBtn?.addEventListener('click', handleClose);
  backdrop?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
      handleClose();
    }
  });

  // Inisialisasi: Muat riwayat percakapan dari D1
  loadChatHistory();
}
