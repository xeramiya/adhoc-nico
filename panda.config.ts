import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  include: ["./app/**/*.{ts,tsx}"],
  exclude: [],
  theme: {
    extend: {
      keyframes: {
        commentFlow: {
          "0%": { transform: "translateX(100vw)" },
          "100%": { transform: "translateX(-100%)" },
        },
        rainbow: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        marquee: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
        neonPulse: {
          "0%, 100%": { textShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 40px #ff00ff" },
          "50%": { textShadow: "0 0 20px #00ffff, 0 0 40px #00ffff, 0 0 80px #00ffff" },
        },
        slideUp: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        ripple: {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(3.5)", opacity: "0" },
        },
      },
    },
  },
  outdir: "app/styled-system",
});
