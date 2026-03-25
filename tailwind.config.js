/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Courier Prime"', 'monospace'],
        display: ['"Oswald"', 'sans-serif'],
        graffiti: ['"Permanent Marker"', 'cursive'],
      },
      colors: {
        neutral: {
          850: '#1f1f1f',
          900: '#171717',
          950: '#0a0a0a',
        },
      },
    },
  },
  plugins: [],
}
