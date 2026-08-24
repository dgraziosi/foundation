/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      md: "900px",
      xl: "1280px",
    },
    extend: {
      colors: {
        canvas: "var(--canvas)",
        elevated: "var(--elevated)",
        inset: "var(--inset)",
        active: "var(--active)",
        hairline: "var(--hairline)",
        ink: "var(--ink)",
        removed: "var(--removed)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
      borderRadius: {
        lg: "13px",
        md: "8px",
        sm: "8px",
        xl: "13px",
        "2xl": "21px",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        label: ["11px", { lineHeight: "inherit", letterSpacing: "0.02em", fontWeight: "500" }],
        meta: ["12px", { lineHeight: "inherit" }],
        "body-s": ["13px", { lineHeight: "1.6" }],
        body: ["15px", { lineHeight: "1.6" }],
        "display-s": ["13px", { lineHeight: "1.3", fontWeight: "500" }],
        "display-m": ["21px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "500" }],
        title: ["21px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "500" }],
      },
      spacing: {
        xxs: "3px",
        xs: "5px",
        sm: "8px",
        md: "13px",
        lg: "21px",
        xl: "34px",
      },
      minHeight: {
        row: "42px",
      },
      width: {
        rail: "14rem",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        "2xl": "var(--shadow-2xl)",
      },
      transitionDuration: {
        fast: "140ms",
        content: "220ms",
        chrome: "280ms",
      },
      transitionTimingFunction: {
        chrome: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};
