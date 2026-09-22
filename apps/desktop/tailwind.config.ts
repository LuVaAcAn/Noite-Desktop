import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        noche: {
          bg: 'rgb(var(--noche-bg) / <alpha-value>)',
          surface: 'rgb(var(--noche-surface) / <alpha-value>)',
          'surface-hover': 'rgb(var(--noche-surface-hover) / <alpha-value>)',
          border: 'rgb(var(--noche-border) / <alpha-value>)',
          text: 'rgb(var(--noche-text) / <alpha-value>)',
          muted: 'rgb(var(--noche-muted) / <alpha-value>)',
        },
        category: {
          juegos: '#3b82f6',
          peliculas: '#e5484d',
          series: '#f5a524',
          favoritos: '#db2777',
          calendario: '#7c3aed',
        },
      },
      fontFamily: {
        display: ['"Geist Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        body: ['"Geist Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        title: ['"Space Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '11px',
        xl: '11px',
        '2xl': '14px',
        '3xl': '18px',
        pill: '999px',
      },
      boxShadow: {
        'glow-magenta': '0 0 0 2px rgba(236,72,153,0.55), 0 8px 28px rgba(236,72,153,0.28)',
        'glow-cyan': '0 0 0 2px rgba(34,211,238,0.55), 0 8px 28px rgba(34,211,238,0.22)',
        card: '0 1px 2px rgba(23,23,27,0.04), 0 8px 20px rgba(23,23,27,0.06)',
      },
      backgroundImage: {
        'cta-gradient': 'linear-gradient(to top, #FF0077 0%, #FF7FBD 100%)',
        'cta-secondary-gradient': 'linear-gradient(to top, #0080FF 0%, #7FD2FF 100%)',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-1.5deg) scale(1.06)' },
          '50%': { transform: 'rotate(1.5deg) scale(1.06)' },
        },
      },
      animation: {
        wiggle: 'wiggle 0.28s ease-in-out infinite',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
