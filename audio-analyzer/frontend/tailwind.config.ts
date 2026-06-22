import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0C0A12",
        panel: "#16121C",
        panel2: "#1F1828",
        line: "#2A2233",
        haze: "#A99FB3",
        text: "#EDE7F2",
        amber: {
          DEFAULT: "#F6A623",
          soft: "#FFC36B",
          deep: "#D8841A",
        },
        rose: {
          DEFAULT: "#FF6B8A",
          deep: "#E5447B",
        },
        violet: {
          DEFAULT: "#A855F7",
          deep: "#7C3AED",
        },
        teal: {
          DEFAULT: "#2DD4BF",
          deep: "#14B8A6",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(246,166,35,0.35)",
        "glow-rose": "0 0 40px -8px rgba(255,107,138,0.32)",
        "glow-teal": "0 0 40px -8px rgba(45,212,191,0.3)",
      },
      keyframes: {
        "slow-pulse": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.03)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "bar-rise": {
          "0%, 100%": { transform: "scaleY(0.4)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "slow-pulse": "slow-pulse 4.5s ease-in-out infinite",
        shimmer: "shimmer 8s ease-in-out infinite",
        "bar-rise": "bar-rise 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
