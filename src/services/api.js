// src/services/api.js
// Layanan integrasi REST API Cloudflare Worker & D1 Database

const API_BASE_URL = 'https://budget-tracker-worker.reinaldazahara.workers.dev';

/**
 * Mendapatkan header Authorization Bearer dari token sesi aktif
 * @returns {Record<string, string>}
 */
function getAuthHeader() {
  try {
    const token = sessionStorage.getItem('budget_tracker_jwt_token');
    if (token) {
      return { 'Authorization': `Bearer ${token}` };
    }
  } catch (e) {}
  return {};
}

/**
 * Registrasi akun pengguna baru ke Cloudflare Worker D1 (POST /api/register)
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>}
 */
export async function registerApi(email, password) {
  const res = await fetch(`${API_BASE_URL}/api/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Registrasi gagal (${res.status} ${res.statusText})`);
  }
  return data;
}

/**
 * Login pengguna dan mendapatkan token JWT dari Cloudflare Worker D1 (POST /api/login)
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ success: boolean, token: string, user: Object }>}
 */
export async function loginApi(email, password) {
  const res = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Login gagal (${res.status} ${res.statusText})`);
  }
  return data;
}

/**
 * Mengubah struktur state lokal frontend ke skema tabel Cloudflare D1
 * @param {Object} state - State aplikasi (accounts, transactions, categories)
 * @returns {{ wallets: Array, transactions: Array, budgets: Array }}
 */
export function formatStateToCloudPayload(state = {}) {
  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  const transactions = Array.isArray(state.transactions) ? state.transactions : [];
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const monthYear = state.selectedMonth || new Date().toISOString().slice(0, 7);

  const wallets = accounts.map((acc) => ({
    id: String(acc.id),
    name: acc.name,
    balance: Number(acc.balance) || 0,
    color: acc.theme || acc.color || 'default',
  }));

  const cloudTransactions = transactions.map((t) => ({
    id: String(t.id),
    wallet_id: String(t.wallet_id || t.accountId || accounts[0]?.id || 'wallet-default'),
    amount: Number(t.amount) || 0,
    type: t.type === 'income' ? 'income' : 'expense',
    category: t.category || 'Umum',
    note: t.note || '',
    date: t.date || new Date().toISOString(),
  }));

  const budgets = categories.map((c) => ({
    id: String(c.id),
    category: c.name,
    allocated: Number(c.budget) || 0,
    month_year: monthYear,
  }));

  return {
    wallets,
    transactions: cloudTransactions,
    budgets,
  };
}

/**
 * Mengambil seluruh data dari Cloudflare Worker D1 (GET /api/sync)
 * @returns {Promise<{ wallets: Array, transactions: Array, budgets: Array }>}
 */
export async function fetchCloudData() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 detik timeout

  try {
    const res = await fetch(`${API_BASE_URL}/api/sync`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Gagal mengambil data cloud (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || 'Respon API cloud tidak valid.');
    }

    return result.data || { wallets: [], transactions: [], budgets: [] };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Mengirim seluruh data mutasi ke Cloudflare Worker D1 (POST /api/sync)
 * @param {Object} stateOrPayload - State store atau payload siap kirim
 * @returns {Promise<Object>}
 */
export async function pushCloudData(stateOrPayload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const payload = (stateOrPayload && stateOrPayload.accounts)
      ? formatStateToCloudPayload(stateOrPayload)
      : stateOrPayload;

    const res = await fetch(`${API_BASE_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Gagal menyimpan ke cloud (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || 'Gagal memproses sinkronisasi cloud.');
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Memindai dan mengekstrak data struk belanja via Cloudflare Worker & Google Gemini Flash (POST /api/scan-receipt)
 * @param {string} base64Image - String Base64 gambar struk
 * @param {string} [mimeType='image/jpeg'] - Tipe MIME gambar
 * @returns {Promise<{ merchant: string, amount: number, date: string, category: string, notes: string }>}
 */
export async function scanReceiptWithAI(base64Image, mimeType = 'image/jpeg') {
  let cleanBase64 = base64Image || '';
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }
  cleanBase64 = cleanBase64.trim();

  if (!cleanBase64) {
    throw new Error('Data gambar struk kosong atau tidak valid.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000); // 35 detik timeout untuk AI OCR

  try {
    const res = await fetch(`${API_BASE_URL}/api/scan-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        image: cleanBase64,
        mimeType: mimeType || 'image/jpeg',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Gagal menganalisis struk (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Respon AI tidak mengembalikan data yang valid.');
    }

    return result.data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Analisis struk melebihi batas waktu (timeout). Pastikan koneksi internet stabil dan coba kembali.');
    }
    throw error;
  }
}

/**
 * Menghapus transaksi di Cloudflare Worker D1 (DELETE /api/transactions/:id)
 * @param {string} id - ID transaksi yang akan dihapus
 * @returns {Promise<Object>}
 */
export async function deleteTransactionApi(id) {
  if (!id) {
    throw new Error('ID transaksi diperlukan untuk menghapus.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Gagal menghapus transaksi (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[deleteTransactionApi] Error saat menghapus transaksi ke cloud:', error);
    throw error;
  }
}
