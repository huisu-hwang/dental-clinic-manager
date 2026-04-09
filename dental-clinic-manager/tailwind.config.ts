import type { Config } from "tailwindcss";

const tossGray = {
  50:'#F9FAFB',100:'#F2F4F6',200:'#E5E8EB',300:'#D1D6DB',400:'#B0B8C1',
  500:'#8B95A1',600:'#6B7684',700:'#4E5968',800:'#333D4B',900:'#191F28'
};
const tossBlue = {
  50:'#F4F8FF',100:'#E8F3FF',200:'#D3E5FF',300:'#A9CBFF',400:'#5B94F6',
  500:'#3182F6',600:'#1B64DA',700:'#1552B6',800:'#103F8C',900:'#0B2E66'
};
const tossRed = {
  50:'#FEF2F2',100:'#FEE2E2',200:'#FECACA',300:'#FCA5A5',400:'#F87171',
  500:'#F04452',600:'#DC2626',700:'#B91C1C',800:'#991B1B',900:'#7F1D1D'
};
const tossGreen = {
  50:'#F0FDF4',100:'#DCFCE7',200:'#BBF7D0',300:'#86EFAC',400:'#4ADE80',
  500:'#16A394',600:'#15803D',700:'#166534',800:'#14532D',900:'#052E16'
};
const tossYellow = {
  50:'#FFFBEB',100:'#FEF3C7',200:'#FDE68A',300:'#FCD34D',400:'#FBBF24',
  500:'#F59E0B',600:'#D97706',700:'#B45309',800:'#92400E',900:'#78350F'
};

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-noto-sans-kr)", "Pretendard", "sans-serif"],
      },
      colors: {
        /* shadcn semantic */
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary:     { DEFAULT:"hsl(var(--primary))",     foreground:"hsl(var(--primary-foreground))" },
        secondary:   { DEFAULT:"hsl(var(--secondary))",   foreground:"hsl(var(--secondary-foreground))" },
        accent:      { DEFAULT:"hsl(var(--accent))",      foreground:"hsl(var(--accent-foreground))" },
        muted:       { DEFAULT:"hsl(var(--muted))",       foreground:"hsl(var(--muted-foreground))" },
        destructive: { DEFAULT:"hsl(var(--destructive))", foreground:"hsl(var(--destructive-foreground))" },
        success:  "hsl(var(--success))",
        warning:  "hsl(var(--warning))",
        info:     "hsl(var(--info))",
        card:    { DEFAULT:"hsl(var(--card))",    foreground:"hsl(var(--card-foreground))" },
        popover: { DEFAULT:"hsl(var(--popover))", foreground:"hsl(var(--popover-foreground))" },
        border:  "hsl(var(--border))",
        input:   "hsl(var(--input))",
        ring:    "hsl(var(--ring))",

        /* Tailwind palette remap → Toss 톤화 (핵심) */
        slate: tossGray, gray: tossGray, zinc: tossGray,
        neutral: tossGray, stone: tossGray,
        blue: tossBlue, indigo: tossBlue, sky: tossBlue,
        red: tossRed, rose: tossRed,
        green: tossGreen, emerald: tossGreen,
        yellow: tossYellow, amber: tossYellow,
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        card:     "var(--shadow-card)",
        button:   "var(--shadow-button)",
        hover:    "var(--shadow-hover)",
        elevated: "var(--shadow-elevated)",
        modal:    "var(--shadow-modal)",
      },
      fontSize: {
        /* StyleSeed 5-level hierarchy (Rule 3 typography) */
        "label": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "500" }],
        "caption": ["11px", { lineHeight: "14px", fontWeight: "500" }],
        "micro": ["10px", { lineHeight: "14px", fontWeight: "500" }],
        "body": ["14px", { lineHeight: "20px" }],
        "title": ["18px", { lineHeight: "24px", fontWeight: "700" }],
        "headline": ["36px", { lineHeight: "40px", fontWeight: "700", letterSpacing: "-0.02em" }],
        "display": ["48px", { lineHeight: "52px", fontWeight: "700", letterSpacing: "-0.02em" }],
      },
      transitionDuration: {
        fast: "100ms",
        moderate: "300ms",
      },
      keyframes: {
        "fade-in": { "0%": { opacity:"0", transform:"translateY(-4px)" }, "100%": { opacity:"1", transform:"translateY(0)" } },
        "slide-up": { "0%": { opacity:"0", transform:"translateY(20px)" }, "100%": { opacity:"1", transform:"translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s var(--ease-out)",
      },
    },
  },
  plugins: [],
} satisfies Config;
