import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.375rem",
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
      colors: {
        line: "#e6e6e6",
        ink: "#1a1a1a",
        muted: "#8a8a8a",
        soft: "#fafafa",
        accent: "#2f5eff",
        check: "#6a9a78",
      },
    },
  },
  plugins: [],
};

export default config;
