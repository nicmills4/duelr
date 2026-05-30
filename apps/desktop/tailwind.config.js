/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          400: '#C89B3C',
          500: '#B8891A',
          600: '#8B6914',
        },
        dark: {
          900: '#050A14',
          800: '#080F1E',
          700: '#0C1528',
          600: '#111D35',
        },
      },
      fontFamily: {
        sans: ['system-ui', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
