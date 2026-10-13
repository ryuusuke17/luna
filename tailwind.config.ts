import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    fontSize: { xs: ["11.76px", "18px"], sm: ["12px", "18px"], md: ["12.8px", "20px"], base: ["14px", "21px"], lg: ["14px", "21px"], xl: ["16px", "24px"], "2xl": ["18px", "27px"], "3xl": ["20px", "30px"], "4xl": ["22.11px", "32px"], "6xl": ["22.11px", "32px"] },
    spacing: { 0:"0px", px:"1px", "0.5":"2px", 1:"4px", "1.5":"6px", 2:"8px", "2.5":"10px", 3:"12px", 4:"16px", 5:"20px", 6:"24px", 7:"28px", 8:"32px", 10:"40px", 11:"44px", 12:"48px", 14:"56px", 16:"64px", 20:"80px", 24:"96px", 64:"256px", 72:"288px" },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: { sm:"561px", md:"851px" },
      boxShadow: { panel:"var(--shadow-1)", raised:"var(--shadow-2)" },
      transitionDuration: { 200:"var(--motion-instant)", 300:"var(--motion-fast)", 500:"var(--motion-normal)" },
      colors: {
        success:"hsl(var(--success))", warning:"hsl(var(--warning))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        xl:"var(--radius)", "2xl":"var(--radius)", "3xl":"var(--radius)", full:"var(--radius-pill)",
        lg: "var(--radius)",
        md: "var(--radius)",
        sm: "var(--radius-xs)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
