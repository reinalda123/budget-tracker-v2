// src/services/auth.js
import { store } from '../state/store.js';

const SESSION_TOKEN_KEY = 'budget_tracker_jwt_token';
const SESSION_USER_KEY = 'budget_tracker_user';

// Penyimpanan token dan data pengguna dalam memori lokal modul
let currentToken = null;
let currentUser = null;

/**
 * Mendekode payload dari format JWT string.
 * @param {string} token
 * @returns {Record<string, any> | null}
 */
export function parseJwt(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(payloadBase64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (err) {
    return null;
  }
}

/**
 * Memeriksa apakah token JWT sudah kadaluwarsa (expired).
 * @param {string} token
 * @returns {boolean}
 */
export function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return false;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp < nowInSeconds;
}

/**
 * Memulihkan sesi pengguna dari sessionStorage (misal saat refresh halaman).
 */
export function restoreSession() {
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const userStr = sessionStorage.getItem(SESSION_USER_KEY);

    if (token) {
      if (isTokenExpired(token)) {
        logout();
        return false;
      }

      currentToken = token;
      currentUser = userStr ? JSON.parse(userStr) : null;

      // Sinkronkan ke store aplikasi
      store.setState({
        token: currentToken,
        user: currentUser,
      });

      return true;
    }
  } catch (error) {
    console.warn('[AuthService] Gagal memulihkan sesi dari sessionStorage:', error);
  }
  return false;
}

/**
 * Memeriksa apakah sesi saat ini aktif dan terautentikasi.
 * @returns {boolean}
 */
export function isAuthenticated() {
  if (!currentToken) return false;

  if (isTokenExpired(currentToken)) {
    logout();
    return false;
  }

  return true;
}

/**
 * Mendapatkan token JWT aktif saat ini.
 * @returns {string | null}
 */
export function getToken() {
  return currentToken;
}

/**
 * Mendapatkan data user yang sedang login saat ini.
 * @returns {Object | null}
 */
export function getUser() {
  return currentUser ? { ...currentUser } : null;
}

/**
 * Melakukan proses login pengguna.
 * Menyimpan token di memori dan sessionStorage serta menyinkronkan store.
 * 
 * @param {string} username - Nama pengguna / email.
 * @param {string} password - Kata sandi pengguna.
 * @returns {Promise<{ success: boolean, user: Object, token: string }>}
 */
export async function login(username, password) {
  const cleanUsername = String(username || '').trim();

  if (!cleanUsername || !password) {
    throw new Error('Username dan kata sandi wajib diisi.');
  }

  // Simulasi pembuatan token JWT berstandar (Header.Payload.Signature)
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const expTime = Math.floor(Date.now() / 1000) + 3600 * 8; // Berlaku 8 jam
  const payload = btoa(
    JSON.stringify({
      sub: cleanUsername,
      name: cleanUsername,
      exp: expTime,
      iat: Math.floor(Date.now() / 1000),
    })
  );
  const signature = btoa('mock_signature_budget_tracker');
  const token = `${header}.${payload}.${signature}`;

  const userData = {
    username: cleanUsername,
    role: 'user',
    loggedInAt: new Date().toISOString(),
  };

  // Simpan di memori modul
  currentToken = token;
  currentUser = userData;

  // Simpan di sessionStorage (aman dari tab silang & otomatis hilang saat tab ditutup)
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(userData));
  } catch (error) {
    console.warn('[AuthService] Gagal menyimpan ke sessionStorage:', error);
  }

  // Sinkronkan ke state store aplikasi
  store.setState({
    token: currentToken,
    user: currentUser,
  });

  return {
    success: true,
    user: userData,
    token,
  };
}

/**
 * Menghapus sesi aktif, token di memori & sessionStorage, dan mereset store aplikasi.
 */
export function logout() {
  currentToken = null;
  currentUser = null;

  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
  } catch (error) {
    console.warn('[AuthService] Gagal menghapus sessionStorage:', error);
  }

  // Reset state terpusat
  store.resetState();
}

// Inisialisasi awal pemulihan sesi saat modul dimuat
restoreSession();

