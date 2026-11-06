/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#FFFFFF',
        surface: '#F5F7F9',
        ink: '#0D0F14',
        muted: '#4E525A',
        line: '#E2E4E6',
        focus: '#17191F',
        danger: {
          bg: '#FDE8E5',
          text: '#B42318',
        },
        success: {
          bg: '#E2F4E6',
          text: '#147A3A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        pill: '0 2px 5px rgba(13,15,20,.08)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.95) translateY(10px)' },
          '55%': { opacity: '1', transform: 'scale(1.025) translateY(-3px)' },
          '78%': { transform: 'scale(.995) translateY(1px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'ring-ping': {
          '0%': { opacity: '.5', transform: 'scale(.85)' },
          '70%, 100%': { opacity: '0', transform: 'scale(1.45)' },
        },
        'check-draw': {
          from: { strokeDashoffset: '36' },
          to: { strokeDashoffset: '0' },
        },
        'success-drain': {
          from: { transform: 'scaleX(1)' },
          to: { transform: 'scaleX(0)' },
        },
        'drift-slow': {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-18px,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        'pop-in': 'pop-in .6s cubic-bezier(.22,1.4,.36,1) both',
        'ring-ping': 'ring-ping 1.4s cubic-bezier(0,0,.2,1) .12s both',
        'check-draw': 'check-draw .45s ease-out .18s both',
        'success-drain': 'success-drain 1.5s linear forwards',
        'drift-slow': 'drift-slow 9s ease-in-out infinite',
      },
      /*
       * Tailwind's default breakpoints are the design contract:
       *   md = 768px  -> tablet icon rail (768-1023px)
       *   lg = 1024px -> desktop 280px sidebar
       * Do not customize these without updating the layout media queries.
       */
    },
  },
  plugins: [],
}
