import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#07070b",
        panel: "#111118",
        steel: "#222331",
        neon: "#9d6cff",
        ember: "#ff4f8b"
      },
      boxShadow: {
        glow: "0 0 30px rgba(157, 108, 255, 0.24)"
      }
    }
  },
  plugins: []
} satisfies Config;
