import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        line: "#e6e6e6",
        ink: "#1a1a1a",
        muted: "#8a8a8a",
        soft: "#fafafa",
        accent: "#2f5eff",
      },
    },
  },
  plugins: [],
};

export default config;
