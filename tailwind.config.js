/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50:  "#eef4f0",
          100: "#dde9e2",
          300: "#9dbfae",
          500: "#5a8a73",
          600: "#3a6650",
          700: "#2a4d3d",
          800: "#1f3a2e",
          900: "#152a22",
        },
        sun: {
          100: "#fbf2d8",
          200: "#fae3a8",
          400: "#f5c44a",
          500: "#e8a93c",
          600: "#c98a1f",
        },
        terra: {
          100: "#f4dccf",
          500: "#c66a3f",
          600: "#a8482a",
        },
        ink:   "#1a1812",
        stone: {
          200: "#e2dbcc",
          400: "#a89e89",
          600: "#6b6357",
          800: "#3a352c",
        },
        bone:  "#f5efe2",
        cream: "#faf7f0",
      },
      fontFamily: {
        display: ['"Fraunces"', '"Times New Roman"', "serif"],
        body:    ['"Manrope"', "system-ui", "-apple-system", "sans-serif"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "monospace"],
        sans:    ['"Manrope"', "system-ui", "-apple-system", "sans-serif"],
        serif:   ['"Fraunces"', "serif"],
      },
      borderRadius: {
        sm:   "8px",
        md:   "14px",
        lg:   "22px",
        pill: "9999px",
      },
      boxShadow: {
        "auri-sm": "0 1px 2px rgba(21,42,34,.05), 0 2px 4px rgba(21,42,34,.04)",
        "auri-md": "0 6px 14px rgba(21,42,34,.06), 0 12px 28px rgba(21,42,34,.06)",
        "auri-lg": "0 14px 28px rgba(21,42,34,.08), 0 28px 56px rgba(21,42,34,.10)",
      },
      letterSpacing: {
        eyebrow: "0.18em",
      },
    },
  },
  plugins: [],
}
