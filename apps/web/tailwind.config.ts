import type { Config } from "tailwindcss";

// Mirrors the theme of the approved prototype (tailwind.config in rwaxi-prototype-reference.tsx.html).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rxPurple: "#2F145F", // Morado RWAXI
        rxDeep: "#190A36", // Morado Noche
        lav: "#C4B5FD", // Lavanda
        rxBlue: "#1453A0", // Azul Institucional
        rxAqua: "#24B8D7", // Aqua
        rxGold: "#B77A1E", // Oro
        rxOrange: "#F28A22", // Naranja
        cloud: "#F5F6F8", // Gris Nube
        stone: "#F4F1EA",
        line: "#E3E0EA",
        inkBody: "#2A2238",
        muted: "#5E5873",
        goldInk: "#8A5B12",
        goldTint: "#F5EAD6",
        aquaInk: "#0B6E86",
        aquaTint: "#DFF4F9",
        blueTint: "#E4ECF7",
        purpleTint: "#ECE7F6",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Garamond", "Georgia", "serif"],
        sans: ["Montserrat", '"Helvetica Neue"', "Arial", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
