// src/services/api.js
// Layanan integrasi REST API Cloudflare Worker & D1 Database

const API_BASE_URL = 'https://budget-tracker-worker.reinaldazahara.workers.dev';

/**
 * Mendapatkan header Authorization Bearer dari token sesi aktif
 * @returns {Record<string, string>}
 */
function getAuthHeader() {
  try {
    const token = localStorage.getItem('budget_tracker_jwt_token');
    if (token) {
      return { 'Authorization': `Bearer ${token}` };
    }
  } catch (e) {}
  return {};
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
    type: acc.type || 'Bank',
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
 * Mengambil daftar transaksi pengguna langsung dari Cloudflare D1 (GET /api/transactions)
 * @returns {Promise<Array>}
 */
export async function fetchTransactionsApi() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/transactions`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Gagal mengambil data transaksi (${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Mengambil daftar kartu rekening/dompet pengguna langsung dari Cloudflare D1 (GET /api/wallets)
 * @returns {Promise<Array>}
 */
export async function fetchWalletsApi() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallets`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Gagal mengambil data kartu rekening (${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Mengambil daftar pos anggaran pengguna langsung dari Cloudflare D1 (GET /api/budgets)
 * @returns {Promise<Array>}
 */
export async function fetchBudgetsApi() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/budgets`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Gagal mengambil data pos anggaran (${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
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
      if (res.status === 401) {
        try {
          localStorage.removeItem('budget_tracker_jwt_token');
          localStorage.removeItem('budget_tracker_user');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:expired'));
          }
        } catch (e) {}
      }
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
      if (res.status === 401) {
        try {
          localStorage.removeItem('budget_tracker_jwt_token');
          localStorage.removeItem('budget_tracker_user');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:expired'));
          }
        } catch (e) {}
      }
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

/**
 * Menyimpan transaksi baru secara langsung ke Cloudflare Worker D1 (POST /api/transactions)
 * Wajib mendapatkan status konfirmasi sukses (HTTP 201).
 * @param {Object} tx - Objek transaksi
 * @returns {Promise<Object>}
 */
export async function createTransactionApi(tx) {
  if (!tx) {
    throw new Error('Data transaksi diperlukan untuk menyimpan.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(tx),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok || res.status !== 201) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Gagal menyimpan transaksi ke Cloudflare D1 (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[createTransactionApi] Error saat menyimpan transaksi ke cloud:', error);
    throw error;
  }
}

/**
 * Memperbarui transaksi di Cloudflare Worker D1 (PUT /api/transactions/:id)
 * Wajib mendapatkan status konfirmasi sukses (HTTP 200).
 * @param {string} id - ID transaksi
 * @param {Object} tx - Data pembaruan
 * @returns {Promise<Object>}
 */
export async function updateTransactionApi(id, tx) {
  if (!id) {
    throw new Error('ID transaksi diperlukan untuk memperbarui.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/transactions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(tx),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok || res.status !== 200) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Gagal memperbarui transaksi di Cloudflare D1 (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[updateTransactionApi] Error saat memperbarui transaksi ke cloud:', error);
    throw error;
  }
}

/**
 * Memperbarui saldo kartu rekening/dompet di Cloudflare Worker D1 (PUT /api/wallets/:id)
 * Wajib mendapatkan status konfirmasi sukses (HTTP 200).
 * @param {string} id - ID dompet/rekening
 * @param {number} balance - Saldo baru
 * @returns {Promise<Object>}
 */
export async function updateWalletBalanceApi(id, balance) {
  if (!id) {
    throw new Error('ID rekening diperlukan untuk memperbarui saldo.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ balance: Number(balance) || 0 }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Gagal memperbarui saldo rekening (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[updateWalletBalanceApi] Error saat memperbarui saldo rekening ke cloud:', error);
    throw error;
  }
}

/**
 * Menghapus kartu rekening/dompet di Cloudflare Worker D1 (DELETE /api/wallets/:id)
 * Wajib mendapatkan status konfirmasi sukses (HTTP 200).
 * @param {string} id - ID dompet/rekening
 * @returns {Promise<Object>}
 */
export async function deleteWalletApi(id) {
  if (!id) {
    throw new Error('ID rekening diperlukan untuk menghapus.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallets/${encodeURIComponent(id)}`, {
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
      throw new Error(errJson?.error || `Gagal menghapus kartu rekening (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[deleteWalletApi] Error saat menghapus rekening ke cloud:', error);
    throw error;
  }
}

/**
 * Menghapus pos anggaran/kategori di Cloudflare Worker D1 (DELETE /api/budgets/:id)
 * Wajib mendapatkan status konfirmasi sukses (HTTP 200).
 * @param {string} id - ID pos anggaran atau nama kategori
 * @returns {Promise<Object>}
 */
export async function deleteBudgetApi(id) {
  if (!id) {
    throw new Error('ID pos anggaran diperlukan untuk menghapus.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/budgets/${encodeURIComponent(id)}`, {
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
      throw new Error(errJson?.error || `Gagal menghapus pos anggaran (${res.status} ${res.statusText})`);
    }

    const result = await res.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[deleteBudgetApi] Error saat menghapus pos anggaran ke cloud:', error);
    throw error;
  }
}


