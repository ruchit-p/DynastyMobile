# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please responsibly disclose it by emailing security@mydynastyapp.com. We will acknowledge your report within 72 hours.

Please do not open public issues for security reports.

## Supported Versions

We support security fixes for the `main` branch.

## Secret Management

- Do not commit any `.env*` files or service credentials.
- Use example templates provided:
  - `apps/mobile/GoogleService-Info.example.plist`
  - `apps/mobile/google-services.example.json`
  - `stripe-config.example.json`
  - `stripe-production-config.example.env`
- Use secret stores (GitHub Actions Secrets, Firebase Secrets, Vercel Env Vars).

