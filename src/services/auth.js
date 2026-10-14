// src/services/auth.js
import { store } from '../state/store.js';
import { loginApi } from './api.js';

const AUTH_TOKEN_KEY = 'budget_tracker_jwt_token';
const AUTH_USER_KEY = 'budget_tracker_user';

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
 * Memulihkan sesi pengguna dari localStorage saat website dibuka/refresh.
 * @returns {boolean}
 */
export function restoreSession() {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const userStr = localStorage.getItem(AUTH_USER_KEY);

    if (token) {
      if (isTokenExpired(token)) {
        logout();
        return false;
      }

      currentToken = token;
      currentUser = userStr ? JSON.parse(userStr) : null;

      store.setState({
        token: currentToken,
        user: currentUser,
      });

      return true;
    }
  } catch (error) {
    console.warn('[AuthService] Gagal memulihkan sesi dari localStorage:', error);
  }
  return false;
}

/**
 * Memeriksa apakah pengguna saat ini terautentikasi dengan token valid di localStorage.
 * @returns {boolean}
 */
export function isAuthenticated() {
  if (!currentToken) {
    restoreSession();
  }
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
  if (!currentToken) {
    restoreSession();
  }
  return currentToken;
}

/**
 * Mendapatkan data user yang sedang login saat ini.
 * @returns {Object | null}
 */
export function getUser() {
  if (!currentUser) {
    restoreSession();
  }
  return currentUser ? { ...currentUser } : null;
}

/**
 * Melakukan proses login pengguna ke backend Cloudflare Worker D1.
 * Menyimpan token JWT ke localStorage dan menyinkronkan state store.
 * 
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ success: boolean, user: Object, token: string }>}
 */
export async function login(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');

  if (!cleanEmail || !cleanPassword) {
    throw new Error('Email dan kata sandi wajib diisi.');
  }

  const res = await loginApi(cleanEmail, cleanPassword);
  const token = res.token;
  const userData = {
    id: res.user?.id || 'usr-default',
    email: res.user?.email || cleanEmail,
    name: res.user?.name || cleanEmail.split('@')[0],
    role: 'user',
    loggedInAt: new Date().toISOString(),
  };

  currentToken = token;
  currentUser = userData;

  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
  } catch (error) {
    console.warn('[AuthService] Gagal menyimpan ke localStorage:', error);
  }

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
 * Menghapus sesi aktif dan token dari localStorage.
 * HANYA menghapus token otentikasi/sesi (JWT) dan data sesi user.
 * Cache transaksi dan data lokal tetap dipertahankan agar tidak terjadi data loss.
 */
export function logout() {
  currentToken = null;
  currentUser = null;

  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch (error) {
    console.warn('[AuthService] Gagal menghapus localStorage:', error);
  }

  // HANYA update state sesi tanpa menghapus cache transaksi/akun lokal
  store.setState({
    token: null,
    user: null,
  });
}

// Inisialisasi awal pemulihan sesi saat modul dimuat
restoreSession();
