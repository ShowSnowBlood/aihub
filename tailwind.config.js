/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cyberpunk Design System Colors - Dark Mode (Default)
        cyber: {
          background: 'var(--cyber-background)',
          foreground: 'var(--cyber-foreground)',
          card: 'var(--cyber-card)',
          muted: 'var(--cyber-muted)',
          'muted-foreground': 'var(--cyber-muted-foreground)',
          border: 'var(--cyber-border)',
          input: 'var(--cyber-input)',
          ring: 'var(--cyber-ring)',
          destructive: 'var(--cyber-destructive)',
        },
        // Neon accent colors
        neon: {
          green: '#00ff88',
          magenta: '#ff00ff',
          cyan: '#00d4ff',
          yellow: '#ffff00',
          red: '#ff3366',
        },
        // Legacy primary (keep for compatibility)
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        tech: ['Share Tech Mono', 'monospace'],
      },
      boxShadow: {
        // Neon glow effects
        'neon': '0 0 5px #00ff88, 0 0 10px #00ff8840',
        'neon-sm': '0 0 3px #00ff88, 0 0 6px #00ff8830',
        'neon-lg': '0 0 10px #00ff88, 0 0 20px #00ff8860, 0 0 40px #00ff8830',
        'neon-secondary': '0 0 5px #ff00ff, 0 0 20px #ff00ff60',
        'neon-tertiary': '0 0 5px #00d4ff, 0 0 20px #00d4ff60',
        'neon-red': '0 0 5px #ff3366, 0 0 20px #ff336660',
        'neon-yellow': '0 0 5px #ffff00, 0 0 10px #ffff0040',
      },
      textShadow: {
        'neon': '0 0 10px rgba(0, 255, 136, 0.5)',
        'neon-lg': '0 0 20px rgba(0, 255, 136, 0.3)',
        'glitch': '-2px 0 #ff00ff, 2px 0 #00d4ff',
      },
      animation: {
        'blink': 'blink 1s step-end infinite',
        'glitch': 'glitch 0.3s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'rgb-shift': 'rgbShift 2s ease-in-out infinite',
        'pulse-neon': 'pulseNeon 2s ease-in-out infinite',
        'flicker': 'flicker 3s linear infinite',
      },
      keyframes: {
        blink: {
          '50%': { opacity: '0' },
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)' },
          '40%': { transform: 'translate(2px, -2px)' },
          '60%': { transform: 'translate(-1px, -1px)' },
          '80%': { transform: 'translate(1px, 1px)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        rgbShift: {
          '0%, 100%': { textShadow: '-2px 0 #ff00ff, 2px 0 #00d4ff' },
          '50%': { textShadow: '2px 0 #ff00ff, -2px 0 #00d4ff' },
        },
        pulseNeon: {
          '0%, 100%': { boxShadow: '0 0 5px #00ff88, 0 0 10px #00ff8840' },
          '50%': { boxShadow: '0 0 10px #00ff88, 0 0 20px #00ff8860, 0 0 40px #00ff8830' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.95' },
          '52%': { opacity: '0.5' },
          '54%': { opacity: '0.95' },
          '90%': { opacity: '0.9' },
          '92%': { opacity: '0.5' },
          '94%': { opacity: '0.9' },
        },
      },
      clipPath: {
        'chamfer': 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))',
        'chamfer-sm': 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))',
        'chamfer-lg': 'polygon(0 16px, 16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px))',
      },
    },
  },
  plugins: [
    // Custom plugin for clip-path utilities
    function({ addUtilities }) {
      addUtilities({
        '.clip-chamfer': {
          clipPath: 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))',
        },
        '.clip-chamfer-sm': {
          clipPath: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))',
        },
        '.clip-chamfer-lg': {
          clipPath: 'polygon(0 16px, 16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px))',
        },
        '.text-shadow-neon': {
          textShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
        },
        '.text-shadow-neon-lg': {
          textShadow: '0 0 20px rgba(0, 255, 136, 0.3)',
        },
        '.text-shadow-glitch': {
          textShadow: '-2px 0 #ff00ff, 2px 0 #00d4ff',
        },
      })
    },
  ],
}
