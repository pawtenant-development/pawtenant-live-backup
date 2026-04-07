/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          brand: {
            // Primary orange
            orange:    "#F97316",
            "orange-dark": "#ea6c0a",
            "orange-light": "#fed7aa",
            // Warm cream backgrounds (replaces #f0faf7 green tint)
            cream:     "#FFF7ED",
            "cream-dark": "#fdecd5",
            // Deep warm amber (replaces #1a5c4f dark green)
            deep:      "#92400e",
            "deep-mid": "#b45309",
            "deep-light": "#fef3c7",
            // Accent warm tones
            warm:      "#78350f",
            "warm-bg": "#fffbf5",
          },
        },
      },
    },
    plugins: [],
  }