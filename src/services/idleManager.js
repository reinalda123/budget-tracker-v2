// src/services/idleManager.js

/**
 * Manajer inaktivitas dan penguncian sesi otomatis.
 * Mendeteksi interaksi pengguna dan perpindahan tab (visibilitychange).
 */
export class IdleManager {
  /**
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=300000] - Durasi inaktivitas sebelum lock (default: 5 menit = 300.000 ms).
   * @param {() => void} [options.onLock] - Callback saat sesi dikunci.
   * @param {boolean} [options.lockOnHidden=true] - Otomatis kunci saat tab diminimalkan / disembunyikan.
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000; // default 5 menit
    this.onLock = typeof options.onLock === 'function' ? options.onLock : () => {};
    this.lockOnHidden = options.lockOnHidden ?? true;

    this.timerId = null;
    this.isRunning = false;
    this.isLocked = false;
    this.lastActivityTime = Date.now();
    this.throttleIntervalMs = 1000; // Pembatasan frekuensi penanganan event

    this.interactionEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];

    // Binding listener untuk preserve context this
    this.handleUserActivity = this.handleUserActivity.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  /**
   * Menangani aktivitas pengguna dengan throttling agar performa tetap optimal.
   */
  handleUserActivity() {
    if (this.isLocked || !this.isRunning) return;

    const now = Date.now();
    if (now - this.lastActivityTime >= this.throttleIntervalMs) {
      this.lastActivityTime = now;
      this.reset();
    }
  }

  /**
   * Menangani perpindahan tab atau browser diminimalkan.
   */
  handleVisibilityChange() {
    if (!this.isRunning || this.isLocked) return;

    if (this.lockOnHidden && document.visibilityState === 'hidden') {
      this.lock('visibility_hidden');
    }
  }

  /**
   * Mengunci sesi secara otomatis atau manual.
   * @param {string} [reason='idle_timeout'] - Alasan sesi dikunci.
   */
  lock(reason = 'idle_timeout') {
    if (this.isLocked) return;

    this.isLocked = true;
    this.clearTimer();

    try {
      this.onLock({ reason, timestamp: Date.now() });
    } catch (error) {
      console.error('[IdleManager] Error saat menjalankan onLock callback:', error);
    }
  }

  /**
   * Membuka kunci sesi dan melanjutkan monitoring aktivitas.
   */
  unlock() {
    this.isLocked = false;
    this.reset();
  }

  /**
   * Mereset timer inaktivitas kembali ke awal.
   */
  reset() {
    if (!this.isRunning || this.isLocked) return;

    this.clearTimer();
    this.timerId = window.setTimeout(() => {
      this.lock('idle_timeout');
    }, this.timeoutMs);
  }

  /**
   * Membersihkan timer timeout yang aktif.
   * @private
   */
  clearTimer() {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Memulai pemantauan inaktivitas dan event interaksi pengguna.
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isLocked = false;
    this.lastActivityTime = Date.now();

    // Daftarkan listener interaksi pengguna (passive mode untuk efisiensi scroll/touch)
    this.interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, this.handleUserActivity, { passive: true });
    });

    // Deteksi jika tab browser disembunyikan / diminimalkan
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.reset();
  }

  /**
   * Menghentikan pemantauan dan membersihkan seluruh event listener.
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.clearTimer();

    this.interactionEvents.forEach((eventName) => {
      window.removeEventListener(eventName, this.handleUserActivity);
    });

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /**
   * Mengetahui apakah sesi saat ini dalam keadaan terkunci.
   * @returns {boolean}
   */
  isSessionLocked() {
    return this.isLocked;
  }
}

// Instance default singleton untuk kemudahan penggunaan langsung
let defaultIdleManager = null;

/**
 * Menginisialisasi atau mendapatkan instance default IdleManager.
 * @param {Object} [options]
 * @returns {IdleManager}
 */
export function initIdleManager(options) {
  if (defaultIdleManager) {
    defaultIdleManager.stop();
  }
  defaultIdleManager = new IdleManager(options);
  defaultIdleManager.start();
  return defaultIdleManager;
}

export function getIdleManager() {
  return defaultIdleManager;
}

