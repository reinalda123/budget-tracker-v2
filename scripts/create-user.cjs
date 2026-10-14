#!/usr/bin/env node
/**
 * scripts/create-user.cjs
 * Skrip CLI mandiri untuk mendaftarkan akun pengguna privat ke Cloudflare D1.
 * Menggunakan algoritma PBKDF2/SHA-256 (100.000 iterasi) yang identik dengan worker.js.
 *
 * Penggunaan:
 *   node scripts/create-user.cjs <email> <password> [--local | --remote]
 *
 * Contoh:
 *   node scripts/create-user.cjs user@example.com rahasia123 --local
 *   node scripts/create-user.cjs user@example.com rahasia123 --remote
 */

const { execSync } = require('child_process');
const crypto = require('crypto').webcrypto || globalThis.crypto;

const args = process.argv.slice(2);
const emailArg = args.find((a) => !a.startsWith('--') && a.includes('@'));
const passwordArg = args.find((a) => !a.startsWith('--') && a !== emailArg);
const isRemote = args.includes('--remote');
const isLocal = args.includes('--local') || !isRemote;

if (!emailArg || !passwordArg) {
  console.log(`
=============================================================
  Budget Tracker - CLI Pendaftaran Akun Privat (Single-User)
=============================================================
Penggunaan:
  node scripts/create-user.cjs <email> <password> [--local | --remote]

Contoh:
  node scripts/create-user.cjs admin@domain.com KataSandiAman123 --local
  node scripts/create-user.cjs admin@domain.com KataSandiAman123 --remote

Parameter:
  <email>     : Alamat email pengguna
  <password>  : Kata sandi pengguna (minimal 6 karakter)
  --local     : Eksekusi ke database Cloudflare D1 lokal (default)
  --remote    : Eksekusi ke database Cloudflare D1 production di cloud
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
  const sql = `INSERT INTO users (id, email, password_hash, salt, created_at) VALUES ('${userId}', '${safeEmail}', '${passwordHash}', '${salt}', datetime('now'));`;

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

  const targetEnv = isRemote ? '--remote' : '--local';
  const targetLabel = isRemote ? 'Production Cloud' : 'Local Development';

  console.log(`\nMenjalankan migrasi ke Cloudflare D1 (${targetLabel})...\n`);

  try {
    const command = `npx wrangler d1 execute budget-tracker-db ${targetEnv} --command="${sql}"`;
    execSync(command, { stdio: 'inherit' });
    console.log(`\n[Sukses] Akun '${cleanEmail}' berhasil didaftarkan di D1 (${targetLabel})!`);

    if (!isRemote) {
      console.log('\nUntuk mendaftarkan akun yang sama di Cloudflare D1 Production (Cloud):');
      console.log(`npx wrangler d1 execute budget-tracker-db --remote --command="${sql}"`);
    }
  } catch (err) {
    console.error('\n[Gagal Eksekusi Wrangler]:', err.message);
    console.log('\nAnda dapat menjalankan perintah SQL secara manual:');
    console.log(`npx wrangler d1 execute budget-tracker-db ${targetEnv} --command="${sql}"`);
  }
}

main();
