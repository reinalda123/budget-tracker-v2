// src/services/scanner.js

/**
 * Konfigurasi standar untuk kompresi struk:
 * - maxDimension: 1200px (batas maksimal lebar atau tinggi secara proporsional)
 * - quality: 0.75 (kualitas JPEG optimal, ukuran ringan < 300 KB, teks struk tetap tajam untuk OCR AI)
 */
const DEFAULT_OPTIONS = {
  maxDimension: 1200,
  quality: 0.75,
};

/**
 * Memuat objek File atau Blob gambar ke elemen HTML Image secara asinkron di memori.
 * @param {File|Blob} fileOrBlob
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(fileOrBlob) {
  return new Promise((resolve, reject) => {
    if (!fileOrBlob || !(fileOrBlob instanceof Blob)) {
      return reject(new Error('Input bukan berkas gambar (File) atau Blob yang valid.'));
    }

    if (fileOrBlob.type && !fileOrBlob.type.startsWith('image/')) {
      return reject(new Error('Format berkas bukan merupakan gambar yang didukung.'));
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal memuat gambar struk ke memori. Berkas mungkin rusak.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Menghitung dimensi proporsional baru dengan batas maksimal lebar atau tinggi (1200px).
 * @param {number} originalWidth
 * @param {number} originalHeight
 * @param {number} maxDimension
 * @returns {{ width: number, height: number }}
 */
function calculateDimensions(originalWidth, originalHeight, maxDimension = 1200) {
  let width = originalWidth;
  let height = originalHeight;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  return { width, height };
}

/**
 * Mengompresi berkas atau blob foto struk belanja menggunakan HTML5 Canvas di memori (client-side).
 * Menghasilkan file JPEG yang jauh lebih ringan (< 300 KB) dengan teks yang tetap tajam untuk AI OCR.
 * 
 * @param {File|Blob} fileOrBlob - Berkas atau Blob foto struk dari kamera atau galeri.
 * @param {Object} [options]
 * @param {number} [options.maxDimension=1200] - Batas maksimal lebar atau tinggi (px).
 * @param {number} [options.quality=0.75] - Kualitas kompresi JPEG (0.75).
 * @returns {Promise<{
 *   blob: Blob,
 *   base64: string,
 *   width: number,
 *   height: number,
 *   originalSize: number,
 *   compressedSize: number,
 *   mimeType: string
 * }>}
 */
export async function compressReceiptImage(fileOrBlob, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const img = await loadImage(fileOrBlob);

  const { width, height } = calculateDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    config.maxDimension
  );

  // Buat elemen HTML Canvas tersembunyi di memori untuk perenderan ulang
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Gagal menginisialisasi 2D Canvas context pada browser.');
  }

  // Gunakan smoothing berkualitas tinggi untuk menjaga ketajaman font & teks struk
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Render gambar ke canvas sesuai ukuran proporsional baru
  ctx.drawImage(img, 0, 0, width, height);

  // Ekspor kanvas ke format JPEG dengan kualitas 0.75 (base64 Data URL)
  const base64 = canvas.toDataURL('image/jpeg', config.quality);

  // Ekspor kanvas ke format JPEG dengan kualitas 0.75 (Blob)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error('Gagal menghasilkan Blob dari canvas.'));
        }
      },
      'image/jpeg',
      config.quality
    );
  });

  return {
    blob,
    base64,
    width,
    height,
    originalSize: fileOrBlob.size || 0,
    compressedSize: blob.size,
    mimeType: 'image/jpeg',
  };
}

/**
 * Utilitas cepat untuk langsung mendapatkan Blob hasil kompresi.
 * @param {File|Blob} fileOrBlob
 * @param {Object} [options]
 * @returns {Promise<Blob>}
 */
export async function compressImageToBlob(fileOrBlob, options = {}) {
  const result = await compressReceiptImage(fileOrBlob, options);
  return result.blob;
}

/**
 * Utilitas cepat untuk langsung mendapatkan Base64 string hasil kompresi.
 * @param {File|Blob} fileOrBlob
 * @param {Object} [options]
 * @returns {Promise<string>}
 */
export async function compressImageToBase64(fileOrBlob, options = {}) {
  const result = await compressReceiptImage(fileOrBlob, options);
  return result.base64;
}

