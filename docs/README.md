# Dynasty Documentation

Welcome to the Dynasty project documentation. This guide will help you navigate through our comprehensive documentation.

## 📚 Documentation Structure

### [Architecture](./architecture/)
System design and architectural overview.

- [Architecture Overview](./architecture/README.md) - High-level system architecture

### [API Reference](./api-reference/)
API documentation and endpoint reference.

- [API Overview](./api-reference/README.md) - API structure and authentication

### [Developer Guides](./guides/)
How-to guides for developers.

- [Getting Started](./guides/getting-started.md) - Developer onboarding
- [Error Handling](./guides/error_handling.md) - Error handling patterns

### [Features](./features/)
Feature-specific documentation.

- **[Authentication](./features/authentication/)** - Authentication flows and overview
- **[Messaging](./features/messaging/)** - E2E encrypted chat system and schema

### [Security](./security/)
Security documentation and audit reports.

- [Security Overview](./security/README.md) - Security principles and metrics
- [Security Audit Report](./security/SECURITY_AUDIT_REPORT.md) - Comprehensive audit findings
- [Authentication Audit](./security/AUTHENTICATION_SECURITY_AUDIT.md) - Auth security analysis
- [Signal Protocol Audit](./security/SIGNAL_PROTOCOL_SECURITY_AUDIT.md) - E2E encryption audit
- [Encryption Methods](./security/encryption.md) - Encryption implementation details

### [Infrastructure](./infrastructure/)
Infrastructure documentation.

- [Cloudflare R2 Migration](./infrastructure/CLOUDFLARE_R2_MIGRATION_PLAN.md) - R2 storage migration
- [R2 Testing Guide](./infrastructure/R2_TESTING_GUIDE.md) - Testing R2 integration

### [Implementations](./implementations/)
Completed feature implementations.

- [Signal Protocol](./implementations/SIGNAL_PROTOCOL_IMPLEMENTATION_COMPLETE.md) - Signal Protocol implementation
- [E2EE Summary](./implementations/E2EE_IMPLEMENTATION_COMPLETE_SUMMARY.md) - End-to-end encryption
- [Libsignal Native](./implementations/LIBSIGNAL_NATIVE_IMPLEMENTATION.md) - Native libsignal integration

### [Summaries](./summaries/)
Analyses and coverage reports.

- [Dynasty Feature Parity](./summaries/DYNASTY_FEATURE_PARITY_ANALYSIS.md) - Feature comparison analysis
- [Messaging Feature Parity](./summaries/MESSAGING_FEATURE_PARITY_ANALYSIS.md) - Messaging feature analysis
- [Test Coverage](./summaries/TEST_COVERAGE_SUMMARY.md) - Test coverage metrics

### [Migration](./migration/)
Migration guides and plans.

- [Backblaze B2 Migration](./migration/BACKBLAZE_B2_MIGRATION.md) - Storage migration guide
- [Libsignal Migration Plan](./migration/LIBSIGNAL_MIGRATION_PLAN.md) - Signal Protocol migration

## 🚀 Quick Links

- [Main Project README](../README.md) - Project overview
- [Web App README](../apps/web/README.md) - Web application docs
- [Firebase Backend README](../apps/firebase/README.md) - Backend documentation
- [Production Deployment Guide](../apps/firebase/functions/README_PRODUCTION_READY.md) - Production setup

## 📖 Documentation Standards

### File Naming
- Use lowercase with hyphens: `feature-name.md`
- Be descriptive but concise
- Group related docs in subdirectories

### Content Structure
1. Clear title and description
2. Table of contents for long documents
3. Code examples with syntax highlighting
4. Diagrams where helpful
5. Links to related documentation

### Maintenance
- Review quarterly for accuracy
- Update with major feature changes
- Archive outdated documentation
- Keep examples current

## 🔍 Finding Information

### By Topic
- **New Developer?** Start with [Getting Started](./guides/getting-started.md)
- **Deploying?** See [Deployment Guide](./guides/deployment.md)
- **Security Questions?** Check [Security Docs](./security/)
- **API Reference?** Browse [API Documentation](./api-reference/)

### By Platform
- **Mobile Development** - See mobile-specific docs in features
- **Web Development** - See web-specific docs in features
- **Backend Development** - See API reference and infrastructure

## 📝 Contributing to Docs

See [Contributing Guide](./guides/contributing.md) for documentation standards and submission process.

---

*Last Updated: June 2025*