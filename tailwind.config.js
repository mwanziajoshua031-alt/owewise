/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: { 50: '#EEF2F8', 100: '#D6DFEE', 700: '#16335C', 800: '#10294A', 900: '#0B1F3A', 950: '#071428' },
        brand: { 400: '#4ADE80', 500: '#22C55E', 600: '#16A34A', 700: '#15803D' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
