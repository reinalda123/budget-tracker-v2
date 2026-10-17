// worker.js
// Cloudflare Worker REST API untuk Sinkronisasi Local-First Budget Tracker dengan Cloudflare D1 & Autentikasi JWT
// Dilengkapi Isolasi Multi-User KETAT, Validasi Koneksi D1 Riil, dan Konfirmasi Persistensi Remote.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const DEFAULT_DEV_JWT_SECRET = 'dev-fallback-secret-budget-tracker-2026-key';

/**
 * Helper untuk response JSON dengan CORS header
 * @param {any} data
 * @param {number} [status=200]
 * @returns {Response}
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

// ==========================================
// 1. Web Crypto Helper: PBKDF2 Password Hash
// ==========================================

/**
 * Menghasilkan salt acak hexadecimal
 * @param {number} [bytes=16]
 * @returns {string}
 */
function generateSalt(bytes = 16) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Melakukan hash password dengan PBKDF2 (SHA-256, 100.000 iterasi) via Web Crypto API
 * @param {string} password
 * @param {string} salt
 * @returns {Promise<string>}
 */
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    256 // 32 bytes
  );

  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Memverifikasi kesesuaian password
 * @param {string} password
 * @param {string} salt
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, salt, storedHash) {
  const calculatedHash = await hashPassword(password, salt);
  return calculatedHash === storedHash;
}

// ==========================================
// 2. Web Crypto Helper: JWT (HMAC-SHA256)
// ==========================================

function uint8ArrayToBase64Url(uint8) {
  let binary = '';
  for (let i = 0; i < uint8.byteLength; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncodeJson(obj) {
  const enc = new TextEncoder();
  const bytes = enc.encode(JSON.stringify(obj));
  return uint8ArrayToBase64Url(bytes);
}

function base64UrlDecodeJson(str) {
  const bytes = base64UrlToUint8Array(str);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(bytes));
}

/**
 * Membuat token JWT (HMAC-SHA256)
 * @param {Object} payload
 * @param {string} secretKey
 * @returns {Promise<string>}
 */
async function createJWT(payload, secretKey) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const h64 = base64UrlEncodeJson(header);
  const p64 = base64UrlEncodeJson(payload);
  const dataToSign = `${h64}.${p64}`;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    enc.encode(dataToSign)
  );

  const s64 = uint8ArrayToBase64Url(new Uint8Array(signatureBuffer));
  return `${dataToSign}.${s64}`;
}

/**
 * Memverifikasi token JWT dan mengembalikan isi payload jika valid
 * @param {string} token
 * @param {string} secretKey
 * @returns {Promise<Object | null>}
 */
async function verifyJWT(token, secretKey) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [h64, p64, s64] = parts;
  const dataToSign = `${h64}.${p64}`;
  const enc = new TextEncoder();

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64UrlToUint8Array(s64);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      enc.encode(dataToSign)
    );

    if (!isValid) return null;

    const payload = base64UrlDecodeJson(p64);

    // Cek kadaluwarsa (exp)
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Middleware helper untuk validasi Bearer Token JWT
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Object | null>} User payload ({ id, userId, email }) jika valid, null jika tidak
 */
async function authenticateRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  const secretKey = env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
  const payload = await verifyJWT(token, secretKey);
  if (!payload) return null;

  const userId = payload.userId || payload.id || payload.sub;
  if (!userId) return null;

  return {
    ...payload,
    id: userId,
    userId: userId,
  };
}

/**
 * Memastikan tabel chat_messages dan indeksnya tersedia di D1 (idempotent)
 * @param {D1Database} db
 */
async function ensureChatMessagesTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        type TEXT DEFAULT 'text' CHECK (type IN ('text', 'draft_card')),
        metadata TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages (created_at DESC)
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages (user_id)
    `).run();
  } catch (err) {
    // Abaikan jika tabel atau indeks sudah ada
  }
}

/**
 * Heuristic router & extractor fallback jika Google Gemini API offline atau timeout
 * @param {string} text
 * @param {Array} accounts
 * @param {Array} categories
 * @param {Object} summary
 * @returns {Object}
 */
function fallbackTransactionRouter(text, accounts = [], categories = [], summary = {}) {
  const lower = (text || '').toLowerCase().trim();

  // 1. Cek apakah ini pertanyaan umum / sapaan / konsultasi non-pencatatan
  const questionWords = ['?', 'apakah', 'bagaimana', 'gimana', 'apa saja', 'berapa', 'kenapa', 'mengapa', 'tips', 'saran', 'halo', 'hai', 'pagi', 'siang', 'malam'];
  const isQuestion = questionWords.some((w) => lower.includes(w)) || (!lower.match(/\d/) && !lower.includes('catat'));

  if (isQuestion && !lower.includes('catat')) {
    let reply = `Halo! Saya asisten finansial AI Anda. Saat ini total saldo aktif Anda Rp${(summary.totalBalance || 0).toLocaleString('id-ID')} dan total pengeluaran bulan ini Rp${(summary.thisMonthExpenses || 0).toLocaleString('id-ID')}. Ada yang ingin Anda konsultasikan?`;
    if (lower.includes('burn rate') || lower.includes('harian')) {
      reply = 'Daily burn rate Anda dihitung dari total pengeluaran bulanan dibagi hari berjalan. Menjaga pengeluaran harian di bawah plafon aman akan menjaga stabilitas tabungan Anda.';
    } else if (lower.includes('kategori') || lower.includes('pos') || lower.includes('terbesar')) {
      reply = 'Anda dapat melihat rincian pos anggaran dan kategori pengeluaran terbesar langsung melalui kartu alokasi pos anggaran di dashboard.';
    }
    return {
      is_transaction: false,
      reply,
    };
  }

  // 2. Ekstraksi Nominal
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

  if (!amount || isNaN(amount) || amount <= 0) {
    return {
      is_transaction: false,
      reply: 'Saya belum mendeteksi nominal transaksi. Silakan sertakan angka transaksi (contoh: Catat kopi 25rb atau Gaji 5jt).',
    };
  }

  // 3. Deteksi Tipe Transaksi
  const incomeKeywords = ['pemasukan', 'income', 'gaji', 'transfer masuk', 'dana masuk', 'uang masuk', 'freelance', 'bonus', 'dividen', 'cair', 'dapat uang', 'terima uang', 'setoran', 'payroll'];
  const isIncome = incomeKeywords.some((kw) => lower.includes(kw));
  const type = isIncome ? 'income' : 'expense';

  // 4. Deteksi Akun
  let matchedAccount = null;
  let needsAccountClarification = accounts.length > 1;

  for (const acc of accounts) {
    if (lower.includes(acc.name.toLowerCase())) {
      matchedAccount = acc;
      needsAccountClarification = false;
      break;
    }
  }

  if (!matchedAccount) {
    const commonAliases = ['bni', 'bca', 'mandiri', 'bri', 'gopay', 'ovo', 'dana', 'shopeepay', 'cash', 'tunai', 'jago', 'seabank'];
    for (const alias of commonAliases) {
      if (lower.includes(alias)) {
        matchedAccount = accounts.find((a) => a.name.toLowerCase().includes(alias)) || { id: 'acc-' + alias, name: alias.toUpperCase() };
        needsAccountClarification = false;
        break;
      }
    }
  }

  if (!matchedAccount) {
    matchedAccount = accounts[0] || { id: 'acc-main', name: 'Dompet Utama' };
  }

  // 5. Deteksi Kategori
  let categoryName = isIncome ? 'Gaji & Pemasukan' : 'Belanja';
  const categoryKeywords = {
    'Makanan & Minuman': ['makan', 'kopi', 'ngopi', 'cafe', 'resto', 'sarapan', 'lunch', 'dinner', 'snack', 'minum', 'bakso', 'mie'],
    'Transportasi': ['bensin', 'pertalite', 'pertamax', 'ojol', 'grab', 'gojek', 'parkir', 'tol', 'kereta', 'mrt', 'busway'],
    'Tagihan & Utilitas': ['listrik', 'pln', 'pdam', 'air', 'wifi', 'indihome', 'pulsa', 'kuota', 'bpjs', 'netflix', 'spotify'],
    'Belanja': ['belanja', 'supermarket', 'indomaret', 'alfamart', 'shopee', 'tokopedia', 'baju', 'kaos', 'sepatu'],
    'Gaji & Pemasukan': ['gaji', 'salary', 'payroll', 'upah', 'freelance', 'honor'],
    'Kesehatan': ['obat', 'dokter', 'apotek', 'klinik', 'vitamin', 'rumahsakit', 'rs'],
  };

  for (const cat of categories) {
    if (lower.includes(cat.toLowerCase())) {
      categoryName = cat;
      break;
    }
  }

  if (categoryName === (isIncome ? 'Gaji & Pemasukan' : 'Belanja')) {
    for (const [catGroup, words] of Object.entries(categoryKeywords)) {
      if (words.some((w) => lower.includes(w))) {
        categoryName = catGroup;
        break;
      }
    }
  }

  // 6. Bersihkan Deskripsi
  const stripWords = ['catat', 'tolong', 'masukkan', 'tambahkan', 'pengeluaran', 'pemasukan', 'transaksi', 'pakai', 'via', 'dari', 'ke', 'buat', 'untuk', 'sebesar', 'seharga', 'rp', 'idr', 'beli', 'bayar'];
  const descWords = text.split(/\s+/).filter((w) => {
    const lw = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (stripWords.includes(lw)) return false;
    if (accounts.some((a) => a.name.toLowerCase() === lw)) return false;
    if (['bni', 'bca', 'mandiri', 'bri', 'gopay', 'ovo', 'dana'].includes(lw)) return false;
    if (w.match(/^(?:rp\.?|idr)?\d+(?:[.,]\d+)*(?:jt|juta|rb|ribu|k)?$/i)) return false;
    return true;
  });
  let desc = descWords.join(' ').trim();
  if (!desc) {
    desc = isIncome ? 'Penerimaan Dana' : categoryName;
  }
  desc = desc.charAt(0).toUpperCase() + desc.slice(1);

  const formattedAmt = 'Rp' + Math.round(amount).toLocaleString('id-ID');
  const reply = needsAccountClarification
    ? `Catat ${desc} ${formattedAmt}. Mau dipotong dari / masuk ke rekening mana?`
    : `Saya sudah menyiapkan draf pencatatan ${type === 'income' ? 'pemasukan' : 'pengeluaran'} untuk Anda.`;

  return {
    is_transaction: true,
    needs_account_clarification: needsAccountClarification,
    type,
    amount: Math.round(amount),
    description: desc,
    category_name: categoryName,
    account_id: matchedAccount.id,
    account_name: matchedAccount.name,
    reply,
    available_accounts: accounts.map((a) => a.name),
  };
}

// ==========================================
// 3. Handler Utama Cloudflare Worker
// ==========================================

export default {
  /**
   * @param {Request} request
   * @param {{ DB: D1Database, GEMINI_API_KEY?: string, JWT_SECRET?: string }} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    // 1. Tangani Preflight CORS (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // ===================================================================
      // 2. Health & Status Check Endpoint (Validasi Riil Koneksi Database D1)
      // ===================================================================
      if (pathname === '/' || pathname === '/api' || pathname === '/api/health' || pathname === '/api/status') {
        let dbStatus = 'disconnected';
        let dbPingMs = null;
        let dbError = null;

        if (env.DB) {
          const startPing = Date.now();
          try {
            // Jalankan query riil ke Cloudflare D1 untuk validasi konektivitas nyata
            const pingRes = await env.DB.prepare('SELECT 1 as healthy').first();
            if (pingRes && pingRes.healthy === 1) {
              dbStatus = 'healthy';
              dbPingMs = Date.now() - startPing;
            } else {
              dbStatus = 'degraded';
            }
          } catch (err) {
            dbStatus = 'error';
            dbError = err.message;
          }
        }

        const isHealthy = dbStatus === 'healthy';
        return jsonResponse({
          name: 'Budget Tracker Cloudflare D1 API',
          version: '2.0.0',
          status: isHealthy ? 'online' : (dbStatus === 'degraded' ? 'degraded' : 'offline'),
          database: {
            status: dbStatus,
            pingMs: dbPingMs,
            error: dbError,
            type: 'Cloudflare D1',
          },
          auth: 'JWT (Web Crypto PBKDF2 + HMAC-SHA256)',
          jwtConfigured: Boolean(env.JWT_SECRET),
          gemini: env.GEMINI_API_KEY ? 'Configured' : 'Not Configured',
          timestamp: new Date().toISOString(),
          endpoints: {
            health: '/api/health (GET)',
            login: '/api/login (POST)',
            transactions: '/api/transactions (POST, PUT, DELETE - Protected)',
            wallets: '/api/wallets/:id (PUT, PATCH, DELETE - Protected)',
            budgets: '/api/budgets/:id (DELETE - Protected)',
            sync: '/api/sync (GET, POST - Protected)',
            scanReceipt: '/api/scan-receipt (POST - Protected)',
            chat: '/api/chat (GET, POST, DELETE - Protected)',
          },
        }, isHealthy ? 200 : 503);
      }

      // ===================================================================
      // Endpoint /api/register: Dinonaktifkan Publik (Gunakan CLI create-user.cjs)
      // ===================================================================
      if (pathname === '/api/register') {
        return jsonResponse({
          success: false,
          error: 'Pendaftaran akun publik dinonaktifkan. Gunakan skrip CLI `node scripts/create-user.cjs` untuk mendaftarkan akun baru ke Cloudflare D1.',
        }, 403);
      }

      // ===================================================================
      // Endpoint POST /api/login: Autentikasi Pengguna & Penerbitan Token JWT
      // ===================================================================
      if (pathname === '/api/login' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan pada konfigurasi Worker.',
          }, 500);
        }

        const body = await request.json().catch(() => ({}));
        const rawEmail = String(body.email || body.username || '').trim();
        const password = String(body.password || '');

        if (!rawEmail || !password) {
          return jsonResponse({
            success: false,
            error: 'Email dan kata sandi wajib diisi.',
          }, 400);
        }

        // Pencarian user Case-Insensitive (LOWER(TRIM(email)) = LOWER(TRIM(?)))
        const user = await env.DB.prepare(
          'SELECT id, email, password_hash, salt FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))'
        ).bind(rawEmail).first();

        if (!user) {
          return jsonResponse({
            success: false,
            error: 'Email atau kata sandi tidak sesuai.',
          }, 401);
        }

        // Verifikasi password hash via PBKDF2 Web Crypto API
        const isMatch = await verifyPassword(password, user.salt, user.password_hash);
        if (!isMatch) {
          return jsonResponse({
            success: false,
            error: 'Email atau kata sandi tidak sesuai.',
          }, 401);
        }

        // Buat token JWT berstandar HMAC-SHA256 (Masa aktif 7 hari) dengan userId unik dan valid
        const secretKey = env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
        const now = Math.floor(Date.now() / 1000);
        const expTime = now + 7 * 24 * 3600;

        const jwtPayload = {
          sub: user.id,
          userId: user.id,
          id: user.id,
          email: user.email,
          name: user.email.split('@')[0],
          iat: now,
          exp: expTime,
        };

        const token = await createJWT(jwtPayload, secretKey);

        return jsonResponse({
          success: true,
          message: 'Login berhasil.',
          token,
          user: {
            id: user.id,
            userId: user.id,
            email: user.email,
            name: user.email.split('@')[0],
          },
        });
      }

      // ===================================================================
      // Endpoint POST /api/scan-receipt: Analisis Struk Belanja AI (Protected)
      // ===================================================================
      if (pathname === '/api/scan-receipt' && request.method === 'POST') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return jsonResponse({
            success: false,
            error: 'GEMINI_API_KEY belum dikonfigurasi pada Cloudflare Worker environment (gunakan wrangler secret put GEMINI_API_KEY).',
          }, 500);
        }

        const payload = await request.json().catch(() => ({}));
        let base64Image = payload.image || '';
        const mimeType = payload.mimeType || 'image/jpeg';

        if (base64Image.includes(',')) {
          base64Image = base64Image.split(',')[1];
        }
        base64Image = base64Image.trim();

        if (!base64Image) {
          return jsonResponse({
            success: false,
            error: 'Payload gambar struk (base64) tidak boleh kosong.',
          }, 400);
        }

        const geminiPrompt = `Ekstrak informasi dari bukti transaksi / struk ini. Kembalikan HANYA format JSON valid tanpa markdown, dengan struktur berikut:
{
  "merchant": "nama toko / penerima / pengirim",
  "amount": total nominal angka tanpa titik/koma (number),
  "date": "YYYY-MM-DD",
  "category": "kategori yang sesuai (misal: Makanan & Minuman, Belanja, Transportasi, Tagihan & Utilitas, Gaji & Pemasukan, Lainnya)",
  "type": "income" | "expense",
  "account_name": "nama bank atau dompet digital jika tertera (misal BCA, BNI, Mandiri, BRI, GoPay, OVO, Dana, ShopeePay), atau null jika tidak ada",
  "notes": "ringkasan barang atau keterangan transaksi"
}
Petunjuk Penentuan Type:
- Jika terdapat kata kunci seperti 'CR', 'Credit', 'Dana Masuk', 'Transfer Masuk', 'Payment Received', 'Setoran', 'Pemasukan', 'Top Up Masuk', tentukan type: "income".
- Jika pembelian barang, kasir toko, nota debit, struk restoran/bensin/pembayaran tagihan, tentukan type: "expense".`;

        const MODELS = [
          'gemini-3.5-flash-lite',
          'gemini-3.1-flash-lite',
          'gemini-2.5-flash-lite',
          'gemini-3-flash-preview',
          'gemini-3.6-flash',
          'gemini-3.7-flash',
          'gemini-3.8-flash',
        ];

        const geminiPayload = {
          contents: [
            {
              parts: [
                {
                  text: geminiPrompt,
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        };

        let successfulData = null;
        let successfulModel = null;
        let lastError = null;
        let lastStatus = 500;

        for (const model of MODELS) {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

          try {
            const geminiRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(geminiPayload),
            });

            if (geminiRes.ok) {
              const geminiData = await geminiRes.json();
              let rawContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              rawContent = rawContent.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

              const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
              if (!jsonMatch) {
                throw new Error('Gagal mengekstrak struktur JSON dari hasil AI.');
              }

              let parsed;
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch (e) {
                throw new Error('Format data hasil Gemini AI bukan JSON yang valid.');
              }

              const rawType = String(parsed.type || '').toLowerCase();
              const isIncome = rawType === 'income' ||
                ['cr', 'credit', 'dana masuk', 'transfer masuk', 'uang masuk', 'setoran'].some((kw) =>
                  String(parsed.merchant || '').toLowerCase().includes(kw) ||
                  String(parsed.notes || '').toLowerCase().includes(kw)
                );
              const detectedType = isIncome ? 'income' : 'expense';

              successfulData = {
                merchant: String(parsed.merchant || 'Struk Belanja').trim(),
                amount: Math.round(Number(parsed.amount) || 0),
                date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : new Date().toISOString().slice(0, 10),
                category: String(parsed.category || (detectedType === 'income' ? 'Gaji & Pemasukan' : 'Belanja')).trim(),
                type: detectedType,
                account_name: parsed.account_name ? String(parsed.account_name).trim() : null,
                notes: String(parsed.notes || '').trim(),
              };
              successfulModel = model;
              break;
            }

            const errorText = await geminiRes.text();
            let parsedError = errorText;
            try {
              const errObj = JSON.parse(errorText);
              parsedError = errObj.error?.message || errorText;
            } catch {}

            lastStatus = geminiRes.status;
            lastError = `[${model}] Status ${geminiRes.status}: ${parsedError}`;

            if (geminiRes.status === 429 || geminiRes.status === 503) {
              continue;
            }
          } catch (err) {
            lastError = `[${model}] ${err.message}`;
            continue;
          }
        }

        if (!successfulData) {
          return jsonResponse({
            success: false,
            error: `Semua model AI gagal memproses struk. Kendala terakhir: ${lastError}`,
          }, lastStatus >= 400 && lastStatus < 500 ? lastStatus : 503);
        }

        return jsonResponse({
          success: true,
          data: successfulData,
          model: successfulModel,
        });
      }

      // ===================================================================
      // Endpoint /api/chat: Router & Extractor AI, Riwayat & Hapus Chat (Protected & Scoped)
      // ===================================================================
      if (pathname === '/api/chat') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan pada konfigurasi Worker.',
          }, 500);
        }

        await ensureChatMessagesTable(env.DB);

        // -----------------------------------------------------------------
        // GET /api/chat: Ambil 50 riwayat pesan percakapan terakhir user
        // -----------------------------------------------------------------
        if (request.method === 'GET') {
          try {
            const queryResult = await env.DB.prepare(`
              SELECT id, role, content, type, metadata, created_at
              FROM (
                SELECT id, role, content, type, metadata, created_at
                FROM chat_messages
                WHERE user_id = ? OR user_id IS NULL
                ORDER BY created_at DESC
                LIMIT 50
              )
              ORDER BY created_at ASC
            `).bind(authUser.userId).all();

            const messages = (queryResult.results || []).map((msg) => {
              let parsedMeta = null;
              if (msg.metadata) {
                try {
                  parsedMeta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
                } catch {
                  parsedMeta = null;
                }
              }
              return {
                id: msg.id,
                role: msg.role,
                content: msg.content,
                type: msg.type || 'text',
                metadata: parsedMeta,
                created_at: Number(msg.created_at) || Date.now(),
              };
            });

            return jsonResponse({
              success: true,
              messages,
            });
          } catch (err) {
            return jsonResponse({
              success: false,
              error: `Gagal mengambil riwayat pesan chat: ${err.message}`,
            }, 500);
          }
        }

        // -----------------------------------------------------------------
        // DELETE /api/chat: Hapus riwayat chat user
        // -----------------------------------------------------------------
        if (request.method === 'DELETE') {
          try {
            await env.DB.prepare(
              'DELETE FROM chat_messages WHERE user_id = ? OR user_id IS NULL'
            ).bind(authUser.userId).run();

            return jsonResponse({
              success: true,
              message: 'Riwayat percakapan berhasil dihapus.',
            });
          } catch (err) {
            return jsonResponse({
              success: false,
              error: `Gagal menghapus riwayat chat: ${err.message}`,
            }, 500);
          }
        }

        // -----------------------------------------------------------------
        // POST /api/chat: Router & Extractor LLM Transaksi Finansial
        // -----------------------------------------------------------------
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const userMessage = String(body.message || '').trim();
          const clientHistory = Array.isArray(body.history) ? body.history : [];

          if (!userMessage) {
            return jsonResponse({
              success: false,
              error: 'Pesan chat (message) tidak boleh kosong.',
            }, 400);
          }

          // 1. Ambil data dompet / rekening user dari Cloudflare D1
          const walletsResult = await env.DB.prepare(
            'SELECT id, name, balance, type FROM wallets WHERE user_id = ? ORDER BY created_at ASC'
          ).bind(authUser.userId).all();
          const accounts = (walletsResult.results || []).map((w) => ({
            id: w.id,
            name: w.name,
            balance: Number(w.balance) || 0,
            type: w.type || 'Bank',
          }));

          // 2. Ambil kategori anggaran user & default
          const budgetsResult = await env.DB.prepare(
            'SELECT DISTINCT category FROM budgets WHERE user_id = ?'
          ).bind(authUser.userId).all();
          const userBudgetCat = (budgetsResult.results || []).map((b) => b.category).filter(Boolean);
          const defaultCategories = [
            'Makanan & Minuman',
            'Transportasi',
            'Tagihan & Utilitas',
            'Belanja',
            'Hiburan',
            'Pendidikan',
            'Kesehatan',
            'Gaji & Pemasukan',
            'Investasi',
            'Lain-lain',
          ];
          const categories = Array.from(new Set([...userBudgetCat, ...defaultCategories]));

          // 3. Ringkasan Finansial (Total Saldo & Pengeluaran Bulan Berjalan)
          const totalBalance = accounts.reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);
          const currentMonthPrefix = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
          const expenseResult = await env.DB.prepare(
            `SELECT SUM(amount) as total_expenses FROM transactions
             WHERE user_id = ? AND type = 'expense' AND date LIKE ?`
          ).bind(authUser.userId, `${currentMonthPrefix}%`).first();
          const thisMonthExpenses = Number(expenseResult?.total_expenses) || 0;

          const financialSummary = {
            totalBalance,
            thisMonthExpenses,
            activeWalletsCount: accounts.length,
          };

          // 4. Simpan pesan pengguna ke Cloudflare D1
          const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const userCreatedAt = Date.now();
          await env.DB.prepare(`
            INSERT INTO chat_messages (id, user_id, role, content, type, metadata, created_at)
            VALUES (?, ?, 'user', ?, 'text', NULL, ?)
          `).bind(userMsgId, authUser.userId, userMessage, userCreatedAt).run();

          // 5. Ekstraksi LLM via Gemini Flash (atau Fallback)
          let extractedData = null;
          const apiKey = env.GEMINI_API_KEY;

          if (apiKey) {
            const accountsListStr = accounts.length > 0
              ? accounts.map((a) => `- ID: "${a.id}", Nama: "${a.name}", Saldo: Rp${a.balance.toLocaleString('id-ID')}`).join('\n')
              : 'Tidak ada rekening terdaftar.';

            const categoriesListStr = categories.join(', ');

            // Format percakapan riwayat singkat (maksimal 6 interaksi terakhir)
            const recentHistory = clientHistory.slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Asisten'}: ${h.content}`).join('\n');

            const systemPrompt = `Anda adalah asisten finansial cerdas Budget Tracker.
Daftar rekening pengguna yang tersedia:
${accountsListStr}

Daftar kategori yang tersedia:
${categoriesListStr}

Ringkasan finansial pengguna:
- Total Saldo Aktif: Rp${totalBalance.toLocaleString('id-ID')}
- Total Pengeluaran Bulan Ini (${currentMonthPrefix}): Rp${thisMonthExpenses.toLocaleString('id-ID')}

${recentHistory ? `Riwayat percakapan sebelumnya:\n${recentHistory}\n` : ''}
Pesan terbaru pengguna: "${userMessage}"

Tugas Anda:
1. Analisis apakah pesan pengguna merupakan niat untuk MENCATAT TRANSAKSI (pengeluaran atau pemasukan), ATAU merupakan percakapan biasa / sapaan / konsultasi keuangan.
2. JIKA BUKAN TRANSAKSI (konsultasi, sapaan, tanya tips hemat, analisis burn rate, evaluasi plafon anggaran, dll):
   Kembalikan HANYA format JSON valid tanpa markdown dengan skema:
   {
     "is_transaction": false,
     "reply": "Jawaban analitis, ramah, to the point dalam bahasa Indonesia."
   }
3. JIKA MERUPAKAN NIAT MENCATAT TRANSAKSI:
   - Ekstrak:
     * type: 'expense' (pengeluaran/beli/bayar) ATAU 'income' (pemasukan/gaji/transfer masuk/cair/bonus)
     * amount: angka total (number) tanpa titik/koma/simbol
     * description: ringkasan nama barang/transaksi (contoh: "Kopi Kenangan", "Bensin Shell", "Gaji Pokok")
     * category_name: nama kategori yang paling relevan dari daftar kategori yang disediakan
     * account_id: id rekening yang paling cocok jika user menyebutkan nama bank/dompetnya, ATAU jika user hanya memiliki 1 rekening maka gunakan id rekening tersebut, ATAU null jika belum jelas dan user punya lebih dari 1 rekening
     * account_name: nama rekening yang cocok, ATAU null jika belum ditentukan
     * needs_account_clarification: boolean. BERNILAI TRUE jika user memiliki LEBIH DARI 1 rekening DAN user TIDAK menyebutkan rekening mana yang dipakai. BERNILAI FALSE jika user hanya punya 1 rekening ATAU user secara eksplisit menyebut rekening yang dipakai.
     * reply:
       - Jika needs_account_clarification === true: Buat kalimat klarifikasi ramah yang menanyakan rekening tujuan/asal, contoh: "Catat [deskripsi] [nominal]. Mau dipotong dari / masuk ke rekening mana?"
       - Jika needs_account_clarification === false: Buat konfirmasi singkat, contoh: "Saya sudah menyiapkan draf pencatatan untuk Anda."
   Kembalikan HANYA format JSON valid tanpa markdown dengan skema:
   {
     "is_transaction": true,
     "needs_account_clarification": boolean,
     "type": "expense" | "income",
     "amount": number,
     "description": string,
     "category_name": string,
     "account_id": string | null,
     "account_name": string | null,
     "reply": string
   }`;

            const MODELS = [
              'gemini-3.5-flash-lite',
              'gemini-3.1-flash-lite',
              'gemini-2.5-flash-lite',
              'gemini-3-flash-preview',
              'gemini-3.6-flash',
              'gemini-3.7-flash',
              'gemini-3.8-flash',
            ];

            const geminiPayload = {
              contents: [
                {
                  parts: [
                    {
                      text: systemPrompt,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            };

            for (const model of MODELS) {
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
              try {
                const res = await fetch(geminiUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(geminiPayload),
                });

                if (res.ok) {
                  const data = await res.json();
                  let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
                  const match = text.match(/\{[\s\S]*\}/);
                  if (match) {
                    const parsed = JSON.parse(match[0]);
                    extractedData = parsed;
                    break;
                  }
                }
              } catch {
                // Lanjut ke model berikutnya jika model ini gagal
              }
            }
          }

          // Jika Gemini gagal atau tidak ada API Key, gunakan fallbackTransactionRouter
          if (!extractedData) {
            extractedData = fallbackTransactionRouter(userMessage, accounts, categories, financialSummary);
          }

          // 6. Siapkan Tipe & Metadata Respon Asisten
          const assistantMsgId = `msg-${Date.now() + 1}-${Math.random().toString(36).substring(2, 7)}`;
          const assistantCreatedAt = Date.now();
          let msgType = 'text';
          let metadata = null;
          let replyContent = extractedData.reply || 'Ada hal lain yang dapat saya bantu?';

          if (extractedData.is_transaction && Number(extractedData.amount) > 0) {
            msgType = 'draft_card';

            // Tentukan rekening default jika account_id masih kosong
            let finalAccountId = extractedData.account_id;
            let finalAccountName = extractedData.account_name;

            if (!finalAccountId && accounts.length > 0) {
              finalAccountId = accounts[0].id;
              finalAccountName = accounts[0].name;
            }

            metadata = {
              draft: {
                type: extractedData.type === 'income' ? 'income' : 'expense',
                amount: Math.round(Number(extractedData.amount) || 0),
                description: String(extractedData.description || 'Transaksi').trim(),
                category: String(extractedData.category_name || (extractedData.type === 'income' ? 'Gaji & Pemasukan' : 'Belanja')).trim(),
                accountId: finalAccountId,
                account_name: finalAccountName,
                needs_account_clarification: !!extractedData.needs_account_clarification,
                available_accounts: accounts.map((a) => a.name),
              },
            };
          }

          // 7. Simpan pesan asisten ke Cloudflare D1
          const stringifiedMetadata = metadata ? JSON.stringify(metadata) : null;
          await env.DB.prepare(`
            INSERT INTO chat_messages (id, user_id, role, content, type, metadata, created_at)
            VALUES (?, ?, 'assistant', ?, ?, ?, ?)
          `).bind(assistantMsgId, authUser.userId, replyContent, msgType, stringifiedMetadata, assistantCreatedAt).run();

          // 8. Kembalikan response JSON
          return jsonResponse({
            success: true,
            data: {
              id: assistantMsgId,
              role: 'assistant',
              content: replyContent,
              type: msgType,
              metadata: metadata,
              created_at: assistantCreatedAt,
            },
          });
        }

        return jsonResponse({
          success: false,
          error: `Metode ${request.method} tidak didukung pada endpoint /api/chat.`,
        }, 405);
      }

      // ===================================================================
      // Endpoint POST /api/transactions: Tambah Transaksi Tunggal (Protected & Scoped)
      // Mengembalikan HTTP 201 konfirmasi sukses tersimpan di D1
      // ===================================================================
      if (pathname === '/api/transactions' && request.method === 'POST') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan pada konfigurasi Worker.',
          }, 500);
        }

        const body = await request.json().catch(() => ({}));
        const txId = String(body.id || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
        const walletId = String(body.wallet_id || body.accountId || 'wallet-default');
        const amount = Math.abs(Number(body.amount) || 0);
        const type = body.type === 'income' ? 'income' : 'expense';
        const category = String(body.category || 'Umum').trim();
        const note = String(body.note || '').trim();
        const date = String(body.date || new Date().toISOString().slice(0, 10));

        const statements = [
          env.DB.prepare(
            `INSERT INTO transactions (id, user_id, wallet_id, amount, type, category, note, date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               wallet_id = excluded.wallet_id,
               amount = excluded.amount,
               type = excluded.type,
               category = excluded.category,
               note = excluded.note,
               date = excluded.date
             WHERE transactions.user_id = ?`
          ).bind(txId, authUser.userId, walletId, amount, type, category, note, date, authUser.userId)
        ];

        // Sesuaikan saldo dompet user jika walletId ada
        if (walletId && walletId !== 'wallet-default') {
          if (type === 'expense') {
            statements.push(
              env.DB.prepare('UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(amount, walletId, authUser.userId)
            );
          } else if (type === 'income') {
            statements.push(
              env.DB.prepare('UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(amount, walletId, authUser.userId)
            );
          }
        }

        await env.DB.batch(statements);

        return jsonResponse({
          success: true,
          message: 'Transaksi berhasil disimpan permanen ke Cloudflare D1.',
          data: {
            id: txId,
            user_id: authUser.userId,
            wallet_id: walletId,
            amount,
            type,
            category,
            note,
            date,
          },
        }, 201);
      }

      // ===================================================================
      // Endpoint PUT /api/transactions/:id: Update Transaksi (Protected & Scoped)
      // Mengembalikan HTTP 200 konfirmasi sukses
      // ===================================================================
      const updateTxMatch = pathname.match(/^\/api\/transactions\/([^\/]+)$/);
      if (request.method === 'PUT' && updateTxMatch) {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan.',
          }, 500);
        }

        const txId = decodeURIComponent(updateTxMatch[1]);
        const existingTx = await env.DB.prepare(
          'SELECT id, user_id, wallet_id, amount, type FROM transactions WHERE id = ? AND user_id = ?'
        ).bind(txId, authUser.userId).first();

        if (!existingTx) {
          return jsonResponse({
            success: false,
            error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses untuk memperbaruinya.',
          }, 404);
        }

        const body = await request.json().catch(() => ({}));
        const newAmount = body.amount !== undefined ? Math.abs(Number(body.amount)) : existingTx.amount;
        const newType = body.type || existingTx.type;
        const newCategory = body.category !== undefined ? String(body.category).trim() : null;
        const newNote = body.note !== undefined ? String(body.note).trim() : null;
        const newDate = body.date || null;
        const newWalletId = body.wallet_id || existingTx.wallet_id;

        await env.DB.prepare(
          `UPDATE transactions SET
             wallet_id = COALESCE(?, wallet_id),
             amount = ?,
             type = ?,
             category = COALESCE(?, category),
             note = COALESCE(?, note),
             date = COALESCE(?, date)
           WHERE id = ? AND user_id = ?`
        ).bind(newWalletId, newAmount, newType, newCategory, newNote, newDate, txId, authUser.userId).run();

        return jsonResponse({
          success: true,
          message: 'Transaksi berhasil diperbarui di Cloudflare D1.',
          data: {
            id: txId,
            user_id: authUser.userId,
            amount: newAmount,
            type: newType,
          },
        }, 200);
      }

      // ===================================================================
      // Endpoint DELETE /api/transactions/:id: Hapus Transaksi (Protected & Scoped)
      // Mengembalikan HTTP 200 konfirmasi sukses
      // ===================================================================
      const deleteTxMatch = pathname.match(/^\/api\/transactions\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteTxMatch) {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        const txId = decodeURIComponent(deleteTxMatch[1]);
        if (!txId) {
          return jsonResponse({
            success: false,
            error: 'Parameter ID transaksi tidak valid.',
          }, 400);
        }

        if (!env.DB) {
          return jsonResponse({
            success: true,
            message: 'Transaksi berhasil dihapus (Local mode)',
            deletedId: txId,
          }, 200);
        }

        // 1. Cari data transaksi HANYA milik user yang sedang aktif (Strict Isolation)
        const existingTx = await env.DB.prepare(
          'SELECT id, user_id, wallet_id, amount, type FROM transactions WHERE id = ? AND user_id = ?'
        ).bind(txId, authUser.userId).first();

        if (!existingTx) {
          return jsonResponse({
            success: false,
            error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses untuk menghapusnya.',
          }, 404);
        }

        const statements = [];

        // 2. Sesuaikan saldo rekening jika ada wallet_id milik user ini
        if (existingTx.wallet_id) {
          const amount = Number(existingTx.amount) || 0;
          if (existingTx.type === 'expense') {
            statements.push(
              env.DB.prepare(
                'UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
              ).bind(amount, String(existingTx.wallet_id), authUser.userId)
            );
          } else if (existingTx.type === 'income') {
            statements.push(
              env.DB.prepare(
                'UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
              ).bind(amount, String(existingTx.wallet_id), authUser.userId)
            );
          }
        }

        // 3. Hapus transaksi dengan filter user_id KETAT
        statements.push(
          env.DB.prepare(
            'DELETE FROM transactions WHERE id = ? AND user_id = ?'
          ).bind(txId, authUser.userId)
        );

        await env.DB.batch(statements);

        return jsonResponse({
          success: true,
          message: 'Transaksi berhasil dihapus dari Cloudflare D1.',
          deletedId: txId,
        }, 200);
      }

      // ===================================================================
      // Endpoint PUT /api/wallets/:id & PATCH /api/wallets/:id: Perbarui Saldo Rekening (Protected & Scoped)
      // ===================================================================
      const updateWalletMatch = pathname.match(/^\/api\/wallets\/([^\/]+)$/);
      if ((request.method === 'PUT' || request.method === 'PATCH') && updateWalletMatch) {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        const walletId = decodeURIComponent(updateWalletMatch[1]);
        if (!walletId) {
          return jsonResponse({
            success: false,
            error: 'Parameter ID rekening tidak valid.',
          }, 400);
        }

        let body = {};
        try {
          body = await request.json();
        } catch (e) {
          return jsonResponse({
            success: false,
            error: 'Format request body tidak valid (harus JSON).',
          }, 400);
        }

        if (body.balance === undefined || body.balance === null || isNaN(Number(body.balance))) {
          return jsonResponse({
            success: false,
            error: 'Parameter balance wajib diisi dengan angka yang valid.',
          }, 400);
        }

        const newBalance = Number(body.balance);

        if (!env.DB) {
          return jsonResponse({
            success: true,
            message: 'Saldo rekening berhasil diperbarui (Local mode)',
            updatedId: walletId,
            balance: newBalance,
          }, 200);
        }

        // Update kolom balance pada tabel wallets di Cloudflare D1 berdasarkan id rekening dan user_id
        await env.DB.prepare(
          'UPDATE wallets SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
        ).bind(newBalance, walletId, authUser.userId).run();

        return jsonResponse({
          success: true,
          message: 'Saldo rekening berhasil diperbarui di Cloudflare D1.',
          updatedId: walletId,
          balance: newBalance,
        }, 200);
      }

      // ===================================================================
      // Endpoint DELETE /api/wallets/:id: Hapus Rekening Dompet (Protected & Scoped)
      // ===================================================================
      const deleteWalletMatch = pathname.match(/^\/api\/wallets\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteWalletMatch) {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        const walletId = decodeURIComponent(deleteWalletMatch[1]);
        if (!walletId) {
          return jsonResponse({
            success: false,
            error: 'Parameter ID rekening tidak valid.',
          }, 400);
        }

        if (!env.DB) {
          return jsonResponse({
            success: true,
            message: 'Rekening berhasil dihapus (Local mode)',
            deletedId: walletId,
          }, 200);
        }

        // Hapus dompet/rekening dari D1 dengan filter user_id KETAT
        await env.DB.prepare(
          'DELETE FROM wallets WHERE id = ? AND user_id = ?'
        ).bind(walletId, authUser.userId).run();

        return jsonResponse({
          success: true,
          message: 'Kartu rekening berhasil dihapus dari Cloudflare D1.',
          deletedId: walletId,
        }, 200);
      }

      // ===================================================================
      // Endpoint DELETE /api/budgets/:id: Hapus Pos Anggaran (Protected & Scoped)
      // ===================================================================
      const deleteBudgetMatch = pathname.match(/^\/api\/budgets\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteBudgetMatch) {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        const budgetId = decodeURIComponent(deleteBudgetMatch[1]);
        if (!budgetId) {
          return jsonResponse({
            success: false,
            error: 'Parameter ID pos anggaran tidak valid.',
          }, 400);
        }

        if (!env.DB) {
          return jsonResponse({
            success: true,
            message: 'Pos anggaran berhasil dihapus (Local mode)',
            deletedId: budgetId,
          }, 200);
        }

        // Hapus pos anggaran dari D1 dengan filter user_id KETAT (bisa berdasarkan id atau nama kategori)
        await env.DB.prepare(
          'DELETE FROM budgets WHERE (id = ? OR category = ?) AND user_id = ?'
        ).bind(budgetId, budgetId, authUser.userId).run();

        return jsonResponse({
          success: true,
          message: 'Pos anggaran berhasil dihapus dari Cloudflare D1.',
          deletedId: budgetId,
        }, 200);
      }

      // ===================================================================
      // Endpoint GET /api/transactions: Ambil Transaksi (Protected & Scoped)
      // ===================================================================
      if (pathname === '/api/transactions' && request.method === 'GET') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({ success: true, data: [] }, 200);
        }

        const res = await env.DB.prepare(
          'SELECT id, user_id, wallet_id, amount, type, category, note, date, created_at FROM transactions WHERE user_id = ? ORDER BY date DESC'
        ).bind(authUser.userId).all();

        return jsonResponse({
          success: true,
          data: res?.results || [],
        }, 200);
      }

      // ===================================================================
      // Endpoint GET /api/wallets & GET /api/cards: Ambil Rekening (Protected & Scoped)
      // ===================================================================
      if ((pathname === '/api/wallets' || pathname === '/api/cards') && request.method === 'GET') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({ success: true, data: [] }, 200);
        }

        const res = await env.DB.prepare(
          'SELECT id, user_id, name, balance, color, type, created_at, updated_at FROM wallets WHERE user_id = ? ORDER BY created_at ASC'
        ).bind(authUser.userId).all();

        return jsonResponse({
          success: true,
          data: res?.results || [],
        }, 200);
      }

      // ===================================================================
      // Endpoint GET /api/budgets: Ambil Pos Anggaran (Protected & Scoped)
      // ===================================================================
      if (pathname === '/api/budgets' && request.method === 'GET') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({ success: true, data: [] }, 200);
        }

        const res = await env.DB.prepare(
          'SELECT id, user_id, category, allocated, month_year FROM budgets WHERE user_id = ? ORDER BY month_year DESC'
        ).bind(authUser.userId).all();

        return jsonResponse({
          success: true,
          data: res?.results || [],
        }, 200);
      }

      // ===================================================================
      // Endpoint GET /api/sync: Ambil Data (Protected & Strictly User-Scoped)
      // Mencegah kebocoran data antar user: hanya mengembalikan data milik authUser.userId
      // ===================================================================
      if (pathname === '/api/sync' && request.method === 'GET') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan pada konfigurasi Worker.',
          }, 500);
        }

        // Query data terfilter KETAT berdasarkan user_id milik pengguna yang login
        const [walletsResult, transactionsResult, budgetsResult] = await env.DB.batch([
          env.DB.prepare('SELECT id, user_id, name, balance, color, type, created_at, updated_at FROM wallets WHERE user_id = ? ORDER BY created_at ASC').bind(authUser.userId),
          env.DB.prepare('SELECT id, user_id, wallet_id, amount, type, category, note, date, created_at FROM transactions WHERE user_id = ? ORDER BY date DESC').bind(authUser.userId),
          env.DB.prepare('SELECT id, user_id, category, allocated, month_year FROM budgets WHERE user_id = ? ORDER BY month_year DESC').bind(authUser.userId),
        ]);

        return jsonResponse({
          success: true,
          data: {
            wallets: walletsResult?.results || [],
            transactions: transactionsResult?.results || [],
            budgets: budgetsResult?.results || [],
          },
          user: {
            id: authUser.userId,
            userId: authUser.userId,
            email: authUser.email,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // ===================================================================
      // Endpoint POST /api/sync: Simpan Batch Data (Protected & Strictly User-Scoped)
      // Menjamin seluruh mutasi tersimpan permanen di Cloudflare D1 dengan konfirmasi HTTP 200
      // ===================================================================
      if (pathname === '/api/sync' && request.method === 'POST') {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return jsonResponse({
            success: false,
            error: 'Akses ditolak. Sesi tidak valid atau telah kadaluwarsa. Silakan login terlebih dahulu.',
          }, 401);
        }

        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan pada konfigurasi Worker.',
          }, 500);
        }

        const payload = await request.json().catch(() => ({}));
        const wallets = Array.isArray(payload.wallets) ? payload.wallets : [];
        const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
        const budgets = Array.isArray(payload.budgets) ? payload.budgets : [];

        const statements = [];

        // Batch statement untuk Wallets (Upsert dengan user_id pengguna aktif)
        for (const w of wallets) {
          if (!w.id || !w.name) continue;
          statements.push(
            env.DB.prepare(
              `INSERT INTO wallets (id, user_id, name, balance, color, type, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 balance = excluded.balance,
                 color = excluded.color,
                 type = excluded.type,
                 updated_at = CURRENT_TIMESTAMP
               WHERE wallets.user_id = ?`
            ).bind(
              String(w.id),
              authUser.userId,
              String(w.name),
              Number(w.balance) || 0,
              String(w.color || w.theme || 'default'),
              String(w.type || 'Bank'),
              authUser.userId
            )
          );
        }

        // Batch statement untuk Transactions (Upsert dengan user_id pengguna aktif)
        for (const t of transactions) {
          if (!t.id) continue;
          const safeType = t.type === 'income' ? 'income' : 'expense';
          statements.push(
            env.DB.prepare(
              `INSERT INTO transactions (id, user_id, wallet_id, amount, type, category, note, date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 wallet_id = excluded.wallet_id,
                 amount = excluded.amount,
                 type = excluded.type,
                 category = excluded.category,
                 note = excluded.note,
                 date = excluded.date
               WHERE transactions.user_id = ?`
            ).bind(
              String(t.id),
              authUser.userId,
              String(t.wallet_id || t.accountId || 'default-wallet'),
              Number(t.amount) || 0,
              safeType,
              String(t.category || 'Umum'),
              String(t.note || ''),
              String(t.date || new Date().toISOString()),
              authUser.userId
            )
          );
        }

        // Batch statement untuk Budgets (Upsert dengan user_id pengguna aktif)
        for (const b of budgets) {
          if (!b.id) continue;
          statements.push(
            env.DB.prepare(
              `INSERT INTO budgets (id, user_id, category, allocated, month_year)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 category = excluded.category,
                 allocated = excluded.allocated,
                 month_year = excluded.month_year
               WHERE budgets.user_id = ?`
            ).bind(
              String(b.id),
              authUser.userId,
              String(b.category || b.name || 'Umum'),
              Number(b.allocated || b.budget) || 0,
              String(b.month_year || new Date().toISOString().slice(0, 7)),
              authUser.userId
            )
          );
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return jsonResponse({
          success: true,
          message: 'Sinkronisasi data ke Cloudflare D1 berhasil diproses secara permanen.',
          syncedCounts: {
            wallets: wallets.length,
            transactions: transactions.length,
            budgets: budgets.length,
          },
          userId: authUser.userId,
          syncedAt: new Date().toISOString(),
        }, 200);
      }

      // Endpoint tidak ditemukan
      return jsonResponse({
        success: false,
        error: `Endpoint '${pathname}' tidak ditemukan pada Worker.`,
      }, 404);

    } catch (error) {
      console.error('[Worker D1 Error]:', error);
      return jsonResponse({
        success: false,
        error: error.message || 'Terjadi kesalahan internal pada Worker.',
      }, 500);
    }
  },
};
