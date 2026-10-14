// src/utils/dates.js

/**
 * Memformat tanggal ke dalam format bahasa Indonesia (contoh: 13 Oktober 2026).
 * @param {string|number|Date} dateStr - Nilai tanggal berupa ISO string, timestamp, atau Date instance.
 * @param {Intl.DateTimeFormatOptions} [options] - Opsi konfigurasi format tanggal tambahan.
 * @returns {string}
 */
export function formatDateIndo(dateStr, options = {}) {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const defaultOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  };

  return new Intl.DateTimeFormat('id-ID', defaultOptions).format(date);
}

/**
 * Menghitung sisa hari dalam bulan berjalan dari tanggal acuan.
 * Rumus: total hari dalam bulan tersebut dikurangi tanggal saat ini.
 * @param {string|number|Date} [referenceDate=new Date()] - Tanggal acuan (default hari ini).
 * @returns {number} Jumlah sisa hari hingga akhir bulan (>= 0).
 */
export function getRemainingDaysInMonth(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  if (isNaN(date.getTime())) return 0;

  const year = date.getFullYear();
  const month = date.getMonth();

  // Menentukan hari terakhir pada bulan tersebut
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = date.getDate();

  return Math.max(0, totalDaysInMonth - currentDay);
}

