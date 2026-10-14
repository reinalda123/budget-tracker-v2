#!/usr/bin/env node
/**
 * scripts/create-user.cjs
 * Skrip CLI mandiri untuk mendaftarkan akun pengguna ke Cloudflare D1 (Multi-User Production).
 * Secara DEFAULT menargetkan Cloudflare D1 remote (--remote) di production cloud.
 * Menggunakan algoritma PBKDF2/SHA-256 (100.000 iterasi) yang identik dengan worker.js.
 *
 * Penggunaan:
 *   node scripts/create-user.cjs <email> <password> [--remote | --local]
 *
 * Contoh:
 *   node scripts/create-user.cjs user@example.com rahasia123           (Otomatis ke Production Remote)
 *   node scripts/create-user.cjs user@example.com rahasia123 --remote  (Eksplisit Production Remote)
 *   node scripts/create-user.cjs user@example.com rahasia123 --local   (Lokal Development SQLite)
 */

const { execSync } = require('child_process');
const crypto = require('crypto').webcrypto || globalThis.crypto;

const args = process.argv.slice(2);
const emailArg = args.find((a) => !a.startsWith('--') && a.includes('@'));
const passwordArg = args.find((a) => !a.startsWith('--') && a !== emailArg);

// DEFAULT TARGET: Cloudflare D1 Remote Production Cloud (--remote)
const isLocal = args.includes('--local');
const isRemote = !isLocal;

if (!emailArg || !passwordArg) {
  console.log(`
=============================================================
  Budget Tracker - CLI Pendaftaran Akun Cloudflare D1
=============================================================
Penggunaan:
  node scripts/create-user.cjs <email> <password> [--remote | --local]

Contoh:
  node scripts/create-user.cjs admin@domain.com KataSandiAman123
  node scripts/create-user.cjs admin@domain.com KataSandiAman123 --remote
  node scripts/create-user.cjs admin@domain.com KataSandiAman123 --local

Parameter:
  <email>     : Alamat email pengguna (disimpan lowercase)
  <password>  : Kata sandi pengguna (minimal 6 karakter)
  --remote    : Target database Cloudflare D1 production di cloud (DEFAULT)
  --local     : Target database Cloudflare D1 lokal lingkungan development
=============================================================
`);
  process.exit(1);
}

const cleanEmail = emailArg.trim().toLowerCase();
const cleanPassword = passwordArg.trim();

if (cleanPassword.length < 6) {
  console.error('[Error] Kata sandi harus minimal 6 karakter.');
  process.exit(1);
}

function generateSalt(bytes = 16) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

async function main() {
  const salt = generateSalt(16);
  const passwordHash = await hashPassword(cleanPassword, salt);
  const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '');

  // Escape single quotes for SQL safety
  const safeEmail = cleanEmail.replace(/'/g, "''");
  const sql = `INSERT INTO users (id, email, password_hash, salt, created_at) VALUES ('${userId}', '${safeEmail}', '${passwordHash}', '${salt}', datetime('now')) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, salt=excluded.salt;`;

  console.log('\n[Budget Tracker] Menghasilkan kredensial user baru:');
  console.log('----------------------------------------------------');
  console.log(`User ID   : ${userId}`);
  console.log(`Email     : ${cleanEmail}`);
  console.log(`Salt      : ${salt}`);
  console.log(`Hash      : ${passwordHash.substring(0, 16)}... (PBKDF2-SHA256 100k iterasi)`);
  console.log('----------------------------------------------------');
  console.log('\nQuery SQL:');
  console.log(sql);
  console.log('\n----------------------------------------------------');

  const targetEnv = isLocal ? '--local' : '--remote';
  const targetLabel = isLocal ? 'Local Development' : 'Cloudflare D1 Production Cloud (Remote)';

  console.log(`\nMenjalankan eksekusi ke Cloudflare D1 (${targetLabel})...\n`);

  try {
    const command = `npx wrangler d1 execute budget-tracker-db ${targetEnv} --command="${sql}"`;
    execSync(command, { stdio: 'inherit' });
    console.log(`\n[Sukses] Akun '${cleanEmail}' berhasil didaftarkan di D1 (${targetLabel})!`);
  } catch (err) {
    console.error('\n[Gagal Eksekusi Wrangler]:', err.message);
    console.log('\nAnda dapat menjalankan perintah SQL secara manual:');
    console.log(`npx wrangler d1 execute budget-tracker-db ${targetEnv} --command="${sql}"`);
  }
}

main();
