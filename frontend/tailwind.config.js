/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-purple': '#782B90',
        'brand-purple-dark': '#5c1f70',
        'brand-purple-light': '#933bad',
        'brand-yellow': '#FFF200',
        'brand-yellow-hover': '#e6d900',
        'brand-yellow-muted': '#fff980',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
