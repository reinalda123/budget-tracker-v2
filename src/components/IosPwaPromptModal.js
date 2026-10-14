// src/components/IosPwaPromptModal.js
import { renderIcons } from '../utils/icons.js';

const STORAGE_KEY = 'budget_tracker_ios_pwa_dismissed_until';
const DEFAULT_DISMISS_DAYS = 3;

/**
 * Memeriksa apakah perangkat berbasis iOS (iPhone, iPad, iPod, atau iPadOS dengan Safari desktop mode).
 * @returns {boolean}
 */
export function isIOS() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = window.navigator.userAgent || window.navigator.vendor || '';
  const isIosDevice = /iPhone|iPad|iPod/i.test(ua);
  const isIPadOS =
    (navigator.platform === 'MacIntel' || ua.includes('Macintosh')) &&
    navigator.maxTouchPoints > 1;
  return isIosDevice || isIPadOS;
}

/**
 * Memeriksa apakah aplikasi SUDAH berjalan dalam mode standalone (PWA terpasang di layar utama).
 * @returns {boolean}
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.navigator.standalone === true ||
    Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );
}

/**
 * Memeriksa apakah browser yang digunakan adalah Safari murni di iOS:
 * - Berbasis iOS.
 * - BUKAN in-app browser (Instagram, TikTok, Facebook, Twitter, Line, dll.).
 * - BUKAN browser pihak ketiga di iOS (Chrome CriOS, Firefox FxiOS, Edge EdgiOS, Opera OPiOS).
 * - Menggunakan engine WebKit dengan token Safari asli.
 * @returns {boolean}
 */
export function isPureIOSSafari() {
  if (!isIOS()) return false;
  const ua = window.navigator.userAgent || '';

  // Deteksi in-app browser populer
  const isInApp = /Instagram|musical_ly|TikTok|ByteLocale|FBAN|FBAV|FB_IAB|Twitter|Line\/|MicroMessenger|Snapchat|BytedanceWebview/i.test(ua);
  if (isInApp) return false;

  // Deteksi browser alternatif di iOS
  const isThirdParty = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Focus/i.test(ua);
  if (isThirdParty) return false;

  // Safari asli pada iOS menyertakan AppleWebKit dan Safari
  const hasWebKit = /AppleWebKit/i.test(ua);
  const hasSafari = /Safari/i.test(ua);

  return hasWebKit && hasSafari;
}

/**
 * Memeriksa apakah modal panduan install sedang di-mute (disembunyikan) di localStorage.
 * @returns {boolean}
 */
export function isPromptDismissed() {
  try {
    const rawVal = localStorage.getItem(STORAGE_KEY);
    if (!rawVal) return false;
    const dismissedUntil = parseInt(rawVal, 10);
    if (isNaN(dismissedUntil)) return false;
    return Date.now() < dismissedUntil;
  } catch (e) {
    return false;
  }
}

/**
 * Menyimpan timestamp penutupan modal ke localStorage agar tidak muncul kembali selama rentang waktu tertentu.
 * @param {number} [days=3] - Durasi sembunyikan dalam hari (default: 3 hari)
 */
export function dismissPrompt(days = DEFAULT_DISMISS_DAYS) {
  try {
    const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_KEY, String(expiry));
  } catch (e) {
    console.warn('[PWA] Gagal menyimpan status dismissed ke localStorage:', e);
  }
}

/**
 * Menghapus status dismissed dari localStorage (berguna untuk testing atau pemicu manual).
 */
export function resetPromptDismissal() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

/**
 * Mengecek apakah modal panduan install iOS layak ditampilkan.
 * @returns {boolean}
 */
export function shouldShowIosInstallPrompt() {
  return isPureIOSSafari() && !isStandalone() && !isPromptDismissed();
}

/**
 * Mendapatkan atau membuat root container untuk modal panduan PWA.
 * @returns {HTMLElement}
 */
function getPromptRoot() {
  let root = document.querySelector('#ios-pwa-prompt-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ios-pwa-prompt-root';
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Menutup modal panduan install dengan animasi transisi keluar yang halus.
 * @param {number} [dismissDays=3]
 */
export function hideIosInstallPrompt(dismissDays = DEFAULT_DISMISS_DAYS) {
  const root = getPromptRoot();
  const backdrop = root.querySelector('#ios-pwa-backdrop');
  const card = root.querySelector('#ios-pwa-card');

  if (dismissDays > 0) {
    dismissPrompt(dismissDays);
  }

  if (backdrop && card) {
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    card.classList.remove('translate-y-0', 'sm:scale-100', 'opacity-100');
    card.classList.add('translate-y-6', 'sm:scale-95', 'opacity-0');

    setTimeout(() => {
      root.innerHTML = '';
    }, 250);
  } else {
    root.innerHTML = '';
  }
}

/**
 * Menampilkan Modal Panduan Install PWA khusus iOS Safari dengan gaya Monokrom Minimalis Swiss.
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Jika true, lewati pengecekan perangkat/dismiss (berguna untuk pengujian UI).
 * @param {number} [options.dismissDays=3] - Jumlah hari sembunyikan jika ditutup.
 */
export function showIosInstallPrompt(options = {}) {
  const { force = false, dismissDays = DEFAULT_DISMISS_DAYS } = options;

  if (!force && !shouldShowIosInstallPrompt()) {
    return;
  }

  const root = getPromptRoot();

  // Markup Bottom Sheet Monokrom Minimalis Swiss
  root.innerHTML = `
    <div
      id="ios-pwa-backdrop"
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 opacity-0 transition-opacity duration-250 ease-out"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-pwa-title"
    >
      <div
        id="ios-pwa-card"
        class="w-full max-w-md mx-auto rounded-2xl bg-[#FFFFFF] dark:bg-[#121214] border border-[#E4E4E7] dark:border-[#27272A] shadow-2xl p-5 sm:p-6 transition-all duration-300 ease-out transform translate-y-6 sm:translate-y-0 sm:scale-95 opacity-0 relative overflow-hidden"
      >
        <!-- Pegangan Geser (Bottom Sheet Indicator khas iOS) -->
        <div class="w-10 h-1 rounded-full bg-[#E4E4E7] dark:bg-[#27272A] mx-auto mb-4 sm:hidden"></div>

        <!-- Bagian Header Modal -->
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              <i data-lucide="smartphone" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 id="ios-pwa-title" class="text-sm sm:text-base font-bold text-[#09090B] dark:text-[#F4F4F5] tracking-tight">
                Pasang di Layar Utama (iOS)
              </h3>
              <p class="text-[11px] sm:text-xs text-[#71717A] dark:text-[#A1A1AA] mt-0.5">
                Akses cepat layar penuh & pengalaman instan seperti aplikasi native.
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-ios-pwa"
            class="p-1.5 rounded-full text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-[#F9F9F8] dark:hover:bg-[#27272A] transition cursor-pointer shrink-0"
            aria-label="Tutup panduan"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Daftar Panduan 3 Langkah Monokrom dengan Ikon -->
        <div class="space-y-2.5 mb-5">
          <!-- Langkah 1 -->
          <div class="flex items-start gap-3 p-2.5 rounded-xl bg-[#F9F9F8] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A]">
            <div class="w-8 h-8 rounded-lg bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-center text-[#09090B] dark:text-[#F4F4F5] shrink-0 mt-0.5 shadow-2xs">
              <i data-lucide="share" class="w-4 h-4"></i>
            </div>
            <div class="text-left flex-1 min-w-0">
              <p class="text-xs font-semibold text-[#09090B] dark:text-[#F4F4F5]">
                1. Tekan ikon Bagikan (Share)
              </p>
              <p class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5 leading-relaxed">
                Ketuk tombol kotak dengan panah ke atas di bilah menu Safari bagian bawah.
              </p>
            </div>
          </div>

          <!-- Langkah 2 -->
          <div class="flex items-start gap-3 p-2.5 rounded-xl bg-[#F9F9F8] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A]">
            <div class="w-8 h-8 rounded-lg bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-center text-[#09090B] dark:text-[#F4F4F5] shrink-0 mt-0.5 shadow-2xs">
              <i data-lucide="square-plus" class="w-4 h-4"></i>
            </div>
            <div class="text-left flex-1 min-w-0">
              <p class="text-xs font-semibold text-[#09090B] dark:text-[#F4F4F5]">
                2. Pilih "Tambahkan ke Layar Utama"
              </p>
              <p class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5 leading-relaxed">
                Gulir menu tindakan ke bawah dan ketuk <span class="font-medium text-[#09090B] dark:text-[#F4F4F5]">"Add to Home Screen"</span>.
              </p>
            </div>
          </div>

          <!-- Langkah 3 -->
          <div class="flex items-start gap-3 p-2.5 rounded-xl bg-[#F9F9F8] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A]">
            <div class="w-8 h-8 rounded-lg bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-center text-[#09090B] dark:text-[#F4F4F5] shrink-0 mt-0.5 shadow-2xs">
              <i data-lucide="plus" class="w-4 h-4"></i>
            </div>
            <div class="text-left flex-1 min-w-0">
              <p class="text-xs font-semibold text-[#09090B] dark:text-[#F4F4F5]">
                3. Tekan "Tambah" di Pojok Kanan Atas
              </p>
              <p class="text-[11px] text-[#71717A] dark:text-[#A1A1AA] mt-0.5 leading-relaxed">
                Ketuk <span class="font-medium text-[#09090B] dark:text-[#F4F4F5]">"Tambah" (Add)</span> untuk menyelesaikan pemasangan.
              </p>
            </div>
          </div>
        </div>

        <!-- Tombol Aksi Bawah -->
        <div class="flex flex-col gap-2">
          <button
            type="button"
            id="btn-understand-ios-pwa"
            class="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-center transition bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] active:scale-[0.98] cursor-pointer shadow-xs"
          >
            Mengerti, Saya Pasang Sekarang
          </button>
          <button
            type="button"
            id="btn-later-ios-pwa"
            class="w-full py-1.5 text-center text-[11px] font-medium text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-[#F4F4F5] transition cursor-pointer"
          >
            Nanti Saja (Ingatkan 3 Hari Lagi)
          </button>
        </div>
      </div>
    </div>
  `;

  renderIcons(root);

  // Animasi transisi masuk
  requestAnimationFrame(() => {
    const backdrop = root.querySelector('#ios-pwa-backdrop');
    const card = root.querySelector('#ios-pwa-card');
    if (backdrop && card) {
      backdrop.classList.remove('opacity-0');
      backdrop.classList.add('opacity-100');
      card.classList.remove('translate-y-6', 'sm:scale-95', 'opacity-0');
      card.classList.add('translate-y-0', 'sm:scale-100', 'opacity-100');
    }
  });

  // Event Listeners Penutupan
  const closeBtn = root.querySelector('#btn-close-ios-pwa');
  const understandBtn = root.querySelector('#btn-understand-ios-pwa');
  const laterBtn = root.querySelector('#btn-later-ios-pwa');
  const backdrop = root.querySelector('#ios-pwa-backdrop');

  closeBtn?.addEventListener('click', () => hideIosInstallPrompt(dismissDays));
  understandBtn?.addEventListener('click', () => hideIosInstallPrompt(dismissDays));
  laterBtn?.addEventListener('click', () => hideIosInstallPrompt(dismissDays));

  // Tutup jika klik area di luar card
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      hideIosInstallPrompt(dismissDays);
    }
  });
}

/**
 * Inisialisasi otomatis pemantauan iOS PWA saat aplikasi dimuat.
 * Memberikan jeda singkat agar halaman utama selesai dirender terlebih dahulu.
 * @param {Object} [options]
 * @param {number} [options.delay=1500] - Jeda waktu dalam ms sebelum menampilkan modal.
 */
export function initIosInstallPrompt(options = {}) {
  const { delay = 1500 } = options;

  if (typeof window === 'undefined') return;

  // Ekspos helper di window untuk kemudahan pengujian developer via console
  window.showIosInstallPrompt = showIosInstallPrompt;
  window.resetIosPromptDismissal = resetPromptDismissal;

  if (shouldShowIosInstallPrompt()) {
    setTimeout(() => {
      showIosInstallPrompt();
    }, delay);
  }
}

