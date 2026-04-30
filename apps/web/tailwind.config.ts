import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
    },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          2: "hsl(var(--surface-2))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--border))",
        ring: "hsl(var(--primary))",
        muted: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--muted))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--surface-2))",
          foreground: "hsl(var(--foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--surface-2))",
          foreground: "hsl(var(--foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--foreground))",
        },
        danger: "hsl(var(--danger))",
        warning: "hsl(var(--warning))",
        success: "hsl(var(--success))",
        classification: "hsl(var(--classification))",
        popover: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: [
          "var(--font-geist-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-in-right": "slide-in-right 150ms ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
