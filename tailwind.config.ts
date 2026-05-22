import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          400: "#00D4FF",   // Challenger cyan — primary accent
          500: "#00AACC",   // Hover state
          600: "#0088AA",   // Scrollbar / deep accent
        },
        amber: {
          400: "#C89B3C",   // LoL gold — wordmark only
          500: "#B8891A",   // Wordmark hover
        },
        dark: {
          900: "#050A14",   // Deep navy — page background
          800: "#080F1E",   // Card background
          700: "#0C1528",   // Input / elevated surface
          600: "#111D35",   // Border / subtle surface
        },
      },
      fontFamily: {
        display: ["var(--font-bebas-neue)", "sans-serif"],
        sans: ["var(--font-exo-2)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 8s linear infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
