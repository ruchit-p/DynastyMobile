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
      // Test files
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/__tests__/**",
      "**/__mocks__/**",
      // Build and config files
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
      // Config files
      "next.config.js",
      "jest.config.js",
      "jest.setup.js",
      "postcss.config.mjs",
      "tailwind.config.ts",
      // Environment files
      ".env*",
      // Other
      "public/firebase-messaging-sw.js"
    ]
  }
];

export default eslintConfig;
