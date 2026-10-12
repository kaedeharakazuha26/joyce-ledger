/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#fffdf0",
          100: "#fef9c3",
          200: "#fef08a",
          300: "#fde047",
          400: "#facc15",
          500: "#eab308", // Rich warm gold
          600: "#ca8a04", // Burnished crest gold
          700: "#a16207",
          800: "#854d0e",
          900: "#713f12",
          950: "#422006",
        },
        gold: {
          light: "#F7E19A",
          DEFAULT: "#D4AF37", // Authentic metallic gold from Joyce Restobar crest
          dark: "#A68019",
          amber: "#D97706",
        },
      },
      boxShadow: {
        "gold-sm": "0 2px 10px -1px rgba(212, 175, 55, 0.18)",
        "gold-md": "0 4px 18px -2px rgba(212, 175, 55, 0.28)",
        "gold-lg": "0 10px 30px -4px rgba(212, 175, 55, 0.35)",
        "glow": "0 0 25px rgba(234, 179, 8, 0.35)",
      },
      keyframes: {
        "slide-in": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { transform: "translateY(16px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "pop-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 15px rgba(212, 175, 55, 0.25)" },
          "50%": { boxShadow: "0 0 30px rgba(212, 175, 55, 0.55)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "pop-in": "pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "float": "float 4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "shimmer": "shimmer 2.5s infinite linear",
      },
    },
  },
  plugins: [],
};
