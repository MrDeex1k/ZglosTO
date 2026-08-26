/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      borderRadius: {
        card: '18px',
      },
      colors: {
        canvas: '#f7f8fa',
        ink: '#172033',
        muted: '#526078',
        border: '#d9dfe8',
        success: '#15803d',
        danger: '#b91c1c',
      },
    },
  },
  plugins: [],
};
