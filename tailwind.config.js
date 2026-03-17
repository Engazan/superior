/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#1e1e2e',
        bar: '#181825',
        edge: '#313244'
      }
    }
  },
  plugins: []
}
