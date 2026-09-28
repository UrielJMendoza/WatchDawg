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
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          2: "hsl(var(--surface-2) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--border) / <alpha-value>)",
        ring: "hsl(var(--primary) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--muted) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--surface-2) / <alpha-value>)",
          foreground: "hsl(var(--foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--surface-2) / <alpha-value>)",
          foreground: "hsl(var(--foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          foreground: "hsl(var(--foreground) / <alpha-value>)",
        },
        danger: "hsl(var(--danger) / <alpha-value>)",
        good: "hsl(var(--good) / <alpha-value>)",
        serious: "hsl(var(--serious) / <alpha-value>)",
        critical: "hsl(var(--critical) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        success: "hsl(var(--success) / <alpha-value>)",
        classification: "hsl(var(--classification) / <alpha-value>)",
        popover: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--foreground) / <alpha-value>)",
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
      boxShadow: {
        "glow-primary": "0 0 12px hsl(var(--primary) / 0.55)",
        "glow-danger": "0 0 12px hsl(var(--danger) / 0.55)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.9", transform: "scale(1.08)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "45%": { opacity: "0.4" },
          "50%": { opacity: "0.9" },
          "55%": { opacity: "0.3" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 300ms ease-out",
        "slide-in-right": "slide-in-right 220ms ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
        flicker: "flicker 1.6s steps(2, end) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
