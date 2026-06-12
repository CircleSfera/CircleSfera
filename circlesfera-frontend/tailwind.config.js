/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          secondary: 'var(--brand-secondary)',
          accent: 'var(--brand-accent)',
          blue: 'var(--brand-blue)',
        },
        aspectRatio: {
          '4/5': '4 / 5',
          '9/16': '9 / 16',
        },
      },
    },
  },
  plugins: [],
};
