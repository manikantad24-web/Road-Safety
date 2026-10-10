/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Schibsted Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { 950: '#07101e', 900: '#0a1424', 850: '#0d1a2e', 800: '#101e34', 700: '#16294a', 600: '#223756', 500: '#33496b' },
        mist: { 100: '#e8eef7', 200: '#c8d4e6', 300: '#9db0cc', 400: '#7b8fae', 500: '#62758f' },
        teal: { 300: '#6ee7d6', 400: '#34d3c0', 500: '#1fb8a6', 600: '#168f82', 700: '#12665e' },
        sev: { low: '#8fa8c8', medium: '#f5b544', high: '#ff6b5e' },
      },
      boxShadow: { panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.6)' },
      keyframes: { pulseRing: { '0%': { transform: 'scale(.6)', opacity: '.7' }, '100%': { transform: 'scale(2.4)', opacity: '0' } } },
      animation: { pulseRing: 'pulseRing 2.4s ease-out infinite' },
    },
  },
  plugins: [],
}
