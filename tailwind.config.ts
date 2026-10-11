const path = require('path');

module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './pages/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        charcoal: '#0f172a',
        accent: '#f97316',
        'accent-soft': '#ffedd5',
        steel: '#e2e8f0',
      },
      boxShadow: {
        glow: '0 20px 60px rgba(249, 115, 22, 0.35)',
      },
      backgroundImage: {
        'mesh-light': 'radial-gradient(circle at top, rgba(249,115,22,0.2), rgba(15,23,42,0))',
      },
    },
  },
  plugins: [],
};
