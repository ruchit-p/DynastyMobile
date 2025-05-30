import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      // Dependencies
      "node_modules/**",
      // Production build
      ".next/**",
      "out/**",
      "build/**",
      // Test files
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "**/*.test.jsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/__tests__/**",
      "**/__mocks__/**",
      "jest.config.js",
      "jest.setup.js",
      // Coverage reports
      "coverage/**",
      // Config files
      "next.config.js",
      "tailwind.config.ts",
      "postcss.config.mjs",
      // Environment files
      ".env*",
      // Other
      ".DS_Store",
      "*.log",
      "public/firebase-messaging-sw.js"
    ]
  }
];

export default eslintConfig;
