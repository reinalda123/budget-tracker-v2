// src/utils/formatters.js

/**
 * Memformat angka menjadi format mata uang Rupiah (IDR).
 * @param {number|string} num - Nilai angka yang akan diformat.
 * @returns {string} Contoh: "Rp 150.000"
 */
export function formatRupiah(num) {
  const value = typeof num === 'number' ? num : Number(num);
  if (isNaN(value)) {
    return 'Rp 0';
  }

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Menyamarkan (mask) nilai/saldo jika mode sensor (isMasked) aktif.
 * @param {any} val - Nilai yang akan ditampilkan jika tidak disensor.
 * @param {boolean} [isMasked=false] - Status apakah nilai harus disamarkan.
 * @param {string} [maskPlaceholder='••••••'] - Teks pengganti sensor.
 * @returns {any|string}
 */
export function maskValue(val, isMasked = false, maskPlaceholder = '••••••') {
  return isMasked ? maskPlaceholder : val;
}

/**
 * Menyamarkan nomor rekening/akun bank dengan menyisakan 4 digit terakhir.
 * @param {string|number} acc - Nomor rekening yang akan disamarkan.
 * @returns {string} Contoh: "•••• 4321"
 */
export function maskAccountNumber(acc) {
  if (acc === null || acc === undefined) return '';

  const cleanStr = String(acc).trim();
  if (cleanStr.length === 0) return '';
  if (cleanStr.length <= 4) return cleanStr;

  const lastFour = cleanStr.slice(-4);
  return `•••• ${lastFour}`;
}

