import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["mobile/metro.config.cjs", "mobile/src/reader-theme.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".agents/**",
    ".codex/**",
    "mobile/dist/**",
    "mobile/artifacts/**",
    "mobile/.expo/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/expo/**",
    "public/sw.js",
    "public/sw.js.map",
  ]),
]);

export default eslintConfig;
