import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/budget-tracker-v2/',
  plugins: [
    tailwindcss(),
  ],
})