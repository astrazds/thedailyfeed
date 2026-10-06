import type { ReaderPalette } from "./contracts";

export const readerFaces = {
  regular: "RobotoSerif400",
  medium: "RobotoSerif500",
  semibold: "RobotoSerif600",
  bold: "RobotoSerif700",
} as const;

export const readerFonts = {
  [readerFaces.regular]: require("../../public/fonts/roboto-serif-400.ttf"),
  [readerFaces.medium]: require("../../public/fonts/roboto-serif-500.ttf"),
  [readerFaces.semibold]: require("../../public/fonts/roboto-serif-600.ttf"),
  [readerFaces.bold]: require("../../public/fonts/roboto-serif-700.ttf"),
};

export const readerThemes: Readonly<Record<"light" | "dark", ReaderPalette>> = {
  light: {
    background: "#faf8f5",
    foreground: "#2d2d2d",
    muted: "#5a5a5a",
    subtle: "#6d6d6d",
    accent: "#9f574a",
    accentSolid: "#c17767",
    accentForeground: "#1a1816",
    border: "#e8e3dc",
    controlBorder: "#8f8a84",
    codeBackground: "#f5f1ea",
    blockquoteBorder: "#d4c5b0",
    error: "#b04b4b",
  },
  dark: {
    background: "#1a1816",
    foreground: "#e4ddd4",
    muted: "#b8b0a8",
    subtle: "#948c82",
    accent: "#d4a89a",
    accentSolid: "#d4a89a",
    accentForeground: "#1a1816",
    border: "#2d2926",
    controlBorder: "#6c655e",
    codeBackground: "#242220",
    blockquoteBorder: "#3d3530",
    error: "#d97878",
  },
};
