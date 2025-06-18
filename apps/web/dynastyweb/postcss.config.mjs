/**
 * PostCSS configuration for Dynasty web project.
 * - Uses the dedicated Tailwind v4 PostCSS plugin.
 * - Adds Autoprefixer for vendor prefixes (required by Next.js build pipeline).
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}; 