// worker.js
// Cloudflare Worker REST API untuk Sinkronisasi Local-First Budget Tracker dengan Cloudflare D1

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

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

export default {
  /**
   * Handler utama permintaan HTTP Cloudflare Worker
   * @param {Request} request
   * @param {{ DB: D1Database }} env
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
          version: '1.1.0',
          status: 'online',
          database: env.DB ? 'D1 Bound' : 'No DB Binding',
          gemini: env.GEMINI_API_KEY ? 'Configured' : 'Not Configured',
          endpoints: {
            sync: '/api/sync (GET, POST)',
            scanReceipt: '/api/scan-receipt (POST)',
            deleteTransaction: '/api/transactions/:id (DELETE)',
          },
        });
      }

      // Endpoint POST /api/scan-receipt: Analisis struk belanja dengan Google Gemini Flash
      if (pathname === '/api/scan-receipt' && request.method === 'POST') {
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

        // Bersihkan prefix data URL seperti "data:image/jpeg;base64," jika ada
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

        // 1. Daftar model prioritas fallback (memprioritaskan model Lite & kuota terpisah, kebal 429 & 503)
        const MODELS = [
          'gemini-3.5-flash-lite',
          'gemini-3.1-flash-lite',
          'gemini-2.5-flash-lite',
          'gemini-3-flash-preview',
          'gemini-3.6-flash',
          'gemini-3.7-flash',
          'gemini-3.8-flash',
        ];

        // Payload multimodal dengan inlineData (base64 image & mimeType) serta prompt terstruktur
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

        // 2. Loop mencoba model satu per satu
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

            // Jika response 200 OK: parse hasil JSON struk dan simpan
            if (geminiRes.ok) {
              const geminiData = await geminiRes.json();
              let rawContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

              // Bersihkan output dari pembungkus markdown seperti ```json ... ``` atau ``` ... ```
              rawContent = rawContent.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

              // Cari blok JSON { ... }
              const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
              if (!jsonMatch) {
                throw new Error('Gagal mengekstrak struktur JSON dari hasil AI. Foto struk mungkin buram atau tidak terbaca.');
              }

              let parsed;
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch (e) {
                throw new Error('Format data hasil Gemini AI bukan JSON yang valid.');
              }

              // Sanitasi dan format data hasil ekstraksi
              successfulData = {
                merchant: String(parsed.merchant || 'Struk Belanja').trim(),
                amount: Math.round(Number(parsed.amount) || 0),
                date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : new Date().toISOString().slice(0, 10),
                category: String(parsed.category || 'Belanja').trim(),
                notes: String(parsed.notes || '').trim(),
              };
              successfulModel = model;
              break; // Berhasil! Hentikan loop fallback
            }

            // Jika response bukan OK: ambil pesan error
            const errorText = await geminiRes.text();
            let parsedError = errorText;
            try {
              const errObj = JSON.parse(errorText);
              parsedError = errObj.error?.message || errorText;
            } catch {}

            lastStatus = geminiRes.status;
            lastError = `[${model}] Status ${geminiRes.status}: ${parsedError}`;

            // Jika response status bernilai 429 (Quota Exceeded) atau 503 (High Demand):
            // Segera beralih ke model berikutnya dalam array tanpa menghentikan request
            if (geminiRes.status === 429) {
              console.warn(`[Gemini Fallback - Quota Exceeded 429] Model '${model}' mencapai limit kuota. Beralih ke model berikutnya... Detail:`, parsedError);
              continue;
            } else if (geminiRes.status === 503) {
              console.warn(`[Gemini Fallback - High Demand 503] Model '${model}' sedang sibuk. Beralih ke model berikutnya... Detail:`, parsedError);
              continue;
            } else {
              console.warn(`[Gemini Fallback - Status ${geminiRes.status}] Model '${model}' tidak tersedia. Beralih ke model berikutnya... Detail:`, parsedError);
              continue;
            }
          } catch (err) {
            console.warn(`[Gemini Exception] Gagal memanggil model '${model}':`, err.message);
            lastError = `[${model}] ${err.message}`;
            continue;
          }
        }

        // Jika seluruh model di array gagal, baru lempar error response ke frontend
        if (!successfulData) {
          return jsonResponse({
            success: false,
            error: `Semua model AI (${MODELS.join(', ')}) gagal memproses struk. Kendala terakhir: ${lastError}`,
          }, lastStatus >= 400 && lastStatus < 500 ? lastStatus : 503);
        }

        return jsonResponse({
          success: true,
          data: successfulData,
          model: successfulModel,
        });
      }

      // Endpoint DELETE /api/transactions/:id: Menghapus transaksi dan menyesuaikan saldo rekening terkait di Cloudflare D1
      const deleteTxMatch = pathname.match(/^\/api\/transactions\/([^\/]+)$/);
      if (request.method === 'DELETE' && deleteTxMatch) {
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
            message: 'Transaksi berhasil dihapus (Local mode / No DB Binding)',
            deletedId: txId,
          });
        }

        // 1. Cari data transaksi lama untuk penyesuaian saldo rekening (reversal)
        const existingTx = await env.DB.prepare(
          'SELECT id, wallet_id, amount, type FROM transactions WHERE id = ?'
        ).bind(txId).first();

        const statements = [];

        // 2. Jika transaksi ada dan memiliki wallet_id, sesuaikan kembali saldo rekening:
        //    - Pengeluaran dihapus: kembalikan saldo (balance + amount)
        //    - Pemasukan dihapus: tarik saldo kembali (balance - amount)
        if (existingTx && existingTx.wallet_id) {
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

        // 3. Jalankan query SQL ke database D1 untuk menghapus transaksi
        statements.push(
          env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(txId)
        );

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return jsonResponse({
          success: true,
          message: 'Transaksi berhasil dihapus',
          deletedId: txId,
        });
      }

      // 3. Endpoint GET /api/sync: Mengambil seluruh data dompet, transaksi, dan anggaran
      if (pathname === '/api/sync' && request.method === 'GET') {
        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan di konfigurasi env.',
          }, 500);
        }

        // Query batch ke D1
        const [walletsResult, transactionsResult, budgetsResult] = await env.DB.batch([
          env.DB.prepare('SELECT id, name, balance, color, created_at, updated_at FROM wallets ORDER BY created_at ASC'),
          env.DB.prepare('SELECT id, wallet_id, amount, type, category, note, date, created_at FROM transactions ORDER BY date DESC'),
          env.DB.prepare('SELECT id, category, allocated, month_year FROM budgets ORDER BY month_year DESC'),
        ]);

        return jsonResponse({
          success: true,
          data: {
            wallets: walletsResult?.results || [],
            transactions: transactionsResult?.results || [],
            budgets: budgetsResult?.results || [],
          },
          timestamp: new Date().toISOString(),
        });
      }

      // 4. Endpoint POST /api/sync: Menerima payload lengkap dari frontend dan melakukan bulk upsert dalam batch transaction
      if (pathname === '/api/sync' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({
            success: false,
            error: 'Binding database D1 (DB) tidak ditemukan di konfigurasi env.',
          }, 500);
        }

        const payload = await request.json();
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

        // Batch statement untuk Transactions (Upsert)
        for (const t of transactions) {
          if (!t.id) continue;
          // Validasi type CHECK(type IN ('income', 'expense'))
          const safeType = t.type === 'income' ? 'income' : 'expense';
          statements.push(
            env.DB.prepare(
              `INSERT INTO transactions (id, wallet_id, amount, type, category, note, date)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 wallet_id = excluded.wallet_id,
                 amount = excluded.amount,
                 type = excluded.type,
                 category = excluded.category,
                 note = excluded.note,
                 date = excluded.date`
            ).bind(
              String(t.id),
              String(t.wallet_id || t.accountId || 'default-wallet'),
              Number(t.amount) || 0,
              safeType,
              String(t.category || 'Umum'),
              String(t.note || ''),
              String(t.date || new Date().toISOString())
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

        // Jalankan seluruh pernyataan dalam 1 transaksi atomic batch D1
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

