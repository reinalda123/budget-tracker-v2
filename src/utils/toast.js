// src/utils/toast.js
import { renderIcons } from './icons.js';

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.querySelector('#toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none';
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

/**
 * Menampilkan notifikasi Toast mengambang di layar
 * @param {string} message - Pesan notifikasi
 * @param {'success'|'error'|'info'} [type='success'] - Tipe notifikasi
 * @param {number} [duration=3500] - Durasi tampil dalam milidetik
 */
export function showToast(message, type = 'success', duration = 3500) {
  if (typeof document === 'undefined') return;

  const container = getToastContainer();
  const toast = document.createElement('div');

  const isSuccess = type === 'success';
  const isError = type === 'error';

  const bgBorderClass = isSuccess
    ? 'bg-[#FFFFFF] dark:bg-[#121214] border-emerald-500/30 text-[#09090B] dark:text-[#F4F4F5] shadow-lg'
    : isError
    ? 'bg-[#FFFFFF] dark:bg-[#121214] border-rose-500/30 text-[#09090B] dark:text-[#F4F4F5] shadow-lg'
    : 'bg-[#FFFFFF] dark:bg-[#121214] border-[#E4E4E7] dark:border-[#27272A] text-[#09090B] dark:text-[#F4F4F5] shadow-lg';

  const iconColorClass = isSuccess
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
    : isError
    ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
    : 'text-[#09090B] dark:text-[#F4F4F5] bg-zinc-100 dark:bg-zinc-800';

  const iconName = isSuccess ? 'check-circle-2' : isError ? 'alert-circle' : 'shield-check';

  toast.className = `pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-2xl border shadow-xl ${bgBorderClass} transition-all duration-200 transform translate-y-2 opacity-0 select-none`;

  toast.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="w-8 h-8 rounded-xl ${iconColorClass} flex items-center justify-center shrink-0">
        <i data-lucide="${iconName}" class="w-4 h-4"></i>
      </div>
      <p class="text-xs sm:text-sm font-semibold truncate leading-snug">${message}</p>
    </div>
    <button type="button" class="p-1 rounded-lg text-[#71717A] hover:text-[#09090B] dark:hover:text-[#F4F4F5] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  container.appendChild(toast);
  renderIcons(toast);

  // Trigger animasi masuk
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  const dismiss = () => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 200);
  };

  toast.querySelector('button')?.addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

