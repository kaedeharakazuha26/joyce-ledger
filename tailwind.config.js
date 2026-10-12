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
          50: "#fff8eb",
          100: "#fdebc8",
          200: "#fad58c",
          300: "#f7bb50",
          400: "#f4a428",
          500: "#e08410",
          600: "#c2630b",
          700: "#a1450e",
          800: "#833713",
          900: "#6c2e13",
        },
      },
      keyframes: {
        "slide-in": { from: { transform: "translateY(12px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { transform: "scale(.96)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
      },
      animation: {
        "slide-in": "slide-in .22s ease-out",
        "fade-in": "fade-in .15s ease-out",
        "pop-in": "pop-in .18s ease-out",
      },
    },
  },
  plugins: [],
};
