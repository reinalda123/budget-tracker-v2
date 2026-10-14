// worker.js
// Cloudflare Worker REST API untuk Sinkronisasi Local-First Budget Tracker dengan Cloudflare D1 & Autentikasi JWT

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
 * @returns {Promise<Object | null>} User payload ({ id, email }) jika valid, null jika tidak
 */
async function authenticateRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  const secretKey = env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
  return await verifyJWT(token, secretKey);
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
      // 2. Health check endpoint (Root)
      if (pathname === '/' || pathname === '/api') {
        return jsonResponse({
          name: 'Budget Tracker Cloudflare D1 API',
          version: '2.0.0',
          status: 'online',
          database: env.DB ? 'D1 Bound' : 'No DB Binding',
          auth: 'JWT (Web Crypto PBKDF2 + HMAC-SHA256)',
          jwtConfigured: Boolean(env.JWT_SECRET),
          gemini: env.GEMINI_API_KEY ? 'Configured' : 'Not Configured',
          endpoints: {
            register: '/api/register (POST)',
            login: '/api/login (POST)',
            sync: '/api/sync (GET, POST - Protected)',
            scanReceipt: '/api/scan-receipt (POST - Protected)',
            deleteTransaction: '/api/transactions/:id (DELETE - Protected)',
          },
        });
      }

      // ===================================================================
      // Endpoint POST /api/register: Registrasi Pengguna Baru
      // ===================================================================
      if (pathname === '/api/register' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan pada konfigurasi Worker.',
          }, 500);
        }

        const body = await request.json().catch(() => ({}));
        const email = String(body.email || body.username || '').trim().toLowerCase();
        const password = String(body.password || '');

        // Validasi input
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return jsonResponse({
            success: false,
            error: 'Format email tidak valid. Masukkan alamat email yang benar.',
          }, 400);
        }

        if (!password || password.length < 6) {
          return jsonResponse({
            success: false,
            error: 'Kata sandi minimal harus terdiri dari 6 karakter.',
          }, 400);
        }

        // Cek apakah email sudah terdaftar di D1
        const existingUser = await env.DB.prepare(
          'SELECT id FROM users WHERE email = ?'
        ).bind(email).first();

        if (existingUser) {
          return jsonResponse({
            success: false,
            error: 'Email sudah terdaftar. Silakan login atau gunakan email lain.',
          }, 409);
        }

        // Generate salt & hash password
        const salt = generateSalt(16);
        const passwordHash = await hashPassword(password, salt);
        const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '');

        // Simpan ke tabel users
        await env.DB.prepare(
          'INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
        ).bind(userId, email, passwordHash, salt).run();

        return jsonResponse({
          success: true,
          message: 'Registrasi berhasil. Silakan masuk dengan akun Anda.',
          user: {
            id: userId,
            email: email,
            name: email.split('@')[0],
          },
        }, 201);
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
        const email = String(body.email || body.username || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!email || !password) {
          return jsonResponse({
            success: false,
            error: 'Email dan kata sandi wajib diisi.',
          }, 400);
        }

        // Cari user di database D1
        const user = await env.DB.prepare(
          'SELECT id, email, password_hash, salt FROM users WHERE email = ?'
        ).bind(email).first();

        if (!user) {
          return jsonResponse({
            success: false,
            error: 'Email atau kata sandi tidak sesuai.',
          }, 401);
        }

        // Verifikasi password hash
        const isMatch = await verifyPassword(password, user.salt, user.password_hash);
        if (!isMatch) {
          return jsonResponse({
            success: false,
            error: 'Email atau kata sandi tidak sesuai.',
          }, 401);
        }

        // Buat token JWT berstandar HMAC-SHA256 (Masa aktif 7 hari)
        const secretKey = env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
        const now = Math.floor(Date.now() / 1000);
        const expTime = now + 7 * 24 * 3600;

        const jwtPayload = {
          sub: user.id,
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
            email: user.email,
            name: user.email.split('@')[0],
          },
        });
      }

      // ===================================================================
      // Endpoint POST /api/scan-receipt: Analisis Struk Belanja (Protected)
      // ===================================================================
      if (pathname === '/api/scan-receipt' && request.method === 'POST') {
        // Validasi Autentikasi JWT
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

        const geminiPrompt = `Ekstrak informasi dari struk belanja ini. Kembalikan HANYA format JSON valid tanpa markdown, dengan struktur berikut:
{
  "merchant": "nama toko / tempat",
  "amount": total nominal angka tanpa titik/koma (number),
  "date": "YYYY-MM-DD",
  "category": "kategori yang sesuai (misal: Makanan, Belanja, Transportasi, Hiburan, Lainnya)",
  "notes": "ringkasan barang yang dibeli jika ada"
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
                throw new Error('Gagal mengekstrak struktur JSON dari hasil AI. Foto struk mungkin buram.');
              }

              let parsed;
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch (e) {
                throw new Error('Format data hasil Gemini AI bukan JSON yang valid.');
              }

              successfulData = {
                merchant: String(parsed.merchant || 'Struk Belanja').trim(),
                amount: Math.round(Number(parsed.amount) || 0),
                date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : new Date().toISOString().slice(0, 10),
                category: String(parsed.category || 'Belanja').trim(),
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
      // Endpoint DELETE /api/transactions/:id: Hapus Transaksi (Protected & User-Scoped)
      // ===================================================================
      const deleteTxMatch = pathname.match(/^\/api\/transactions\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteTxMatch) {
        // Validasi Autentikasi JWT
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
          });
        }

        // 1. Cari data transaksi milik user ini (atau transaksi legacy tanpa user_id)
        const existingTx = await env.DB.prepare(
          'SELECT id, user_id, wallet_id, amount, type FROM transactions WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
        ).bind(txId, authUser.id).first();

        if (!existingTx) {
          return jsonResponse({
            success: false,
            error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses untuk menghapusnya.',
          }, 404);
        }

        const statements = [];

        // 2. Sesuaikan saldo rekening jika ada wallet_id
        if (existingTx.wallet_id) {
          const amount = Number(existingTx.amount) || 0;
          if (existingTx.type === 'expense') {
            statements.push(
              env.DB.prepare(
                'UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
              ).bind(amount, String(existingTx.wallet_id))
            );
          } else if (existingTx.type === 'income') {
            statements.push(
              env.DB.prepare(
                'UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
              ).bind(amount, String(existingTx.wallet_id))
            );
          }
        }

        // 3. Hapus transaksi dengan filter user_id
        statements.push(
          env.DB.prepare(
            'DELETE FROM transactions WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
          ).bind(txId, authUser.id)
        );

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return jsonResponse({
          success: true,
          message: 'Transaksi berhasil dihapus.',
          deletedId: txId,
        });
      }

      // ===================================================================
      // Endpoint GET /api/sync: Ambil Data (Protected & User-Scoped)
      // ===================================================================
      if (pathname === '/api/sync' && request.method === 'GET') {
        // Validasi Autentikasi JWT
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

        // Query data terfilter berdasarkan user_id milik pengguna yang login (termasuk legacy tanpa user_id)
        const [walletsResult, transactionsResult, budgetsResult] = await env.DB.batch([
          env.DB.prepare('SELECT id, name, balance, color, created_at, updated_at FROM wallets ORDER BY created_at ASC'),
          env.DB.prepare('SELECT id, user_id, wallet_id, amount, type, category, note, date, created_at FROM transactions WHERE user_id = ? OR user_id IS NULL ORDER BY date DESC').bind(authUser.id),
          env.DB.prepare('SELECT id, category, allocated, month_year FROM budgets ORDER BY month_year DESC'),
        ]);

        return jsonResponse({
          success: true,
          data: {
            wallets: walletsResult?.results || [],
            transactions: transactionsResult?.results || [],
            budgets: budgetsResult?.results || [],
          },
          user: {
            id: authUser.id,
            email: authUser.email,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // ===================================================================
      // Endpoint POST /api/sync: Simpan Batch Data (Protected & User-Scoped)
      // ===================================================================
      if (pathname === '/api/sync' && request.method === 'POST') {
        // Validasi Autentikasi JWT
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

        // Batch statement untuk Wallets (Upsert)
        for (const w of wallets) {
          if (!w.id || !w.name) continue;
          statements.push(
            env.DB.prepare(
              `INSERT INTO wallets (id, name, balance, color, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 balance = excluded.balance,
                 color = excluded.color,
                 updated_at = CURRENT_TIMESTAMP`
            ).bind(
              String(w.id),
              String(w.name),
              Number(w.balance) || 0,
              String(w.color || w.theme || 'default')
            )
          );
        }

        // Batch statement untuk Transactions (Upsert dengan user_id pengguna yang aktif)
        for (const t of transactions) {
          if (!t.id) continue;
          const safeType = t.type === 'income' ? 'income' : 'expense';
          statements.push(
            env.DB.prepare(
              `INSERT INTO transactions (id, user_id, wallet_id, amount, type, category, note, date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 user_id = excluded.user_id,
                 wallet_id = excluded.wallet_id,
                 amount = excluded.amount,
                 type = excluded.type,
                 category = excluded.category,
                 note = excluded.note,
                 date = excluded.date
               WHERE transactions.user_id = ? OR transactions.user_id IS NULL`
            ).bind(
              String(t.id),
              authUser.id,
              String(t.wallet_id || t.accountId || 'default-wallet'),
              Number(t.amount) || 0,
              safeType,
              String(t.category || 'Umum'),
              String(t.note || ''),
              String(t.date || new Date().toISOString()),
              authUser.id
            )
          );
        }

        // Batch statement untuk Budgets (Upsert)
        for (const b of budgets) {
          if (!b.id) continue;
          statements.push(
            env.DB.prepare(
              `INSERT INTO budgets (id, category, allocated, month_year)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 category = excluded.category,
                 allocated = excluded.allocated,
                 month_year = excluded.month_year`
            ).bind(
              String(b.id),
              String(b.category || b.name || 'Umum'),
              Number(b.allocated || b.budget) || 0,
              String(b.month_year || new Date().toISOString().slice(0, 7))
            )
          );
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return jsonResponse({
          success: true,
          message: 'Sinkronisasi data ke Cloudflare D1 berhasil diproses.',
          syncedCounts: {
            wallets: wallets.length,
            transactions: transactions.length,
            budgets: budgets.length,
          },
          syncedAt: new Date().toISOString(),
        });
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
