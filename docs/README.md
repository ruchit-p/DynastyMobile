# Dynasty Documentation

Welcome to the Dynasty project documentation. This guide will help you navigate through our comprehensive documentation.

## 📚 Documentation Structure

### [Architecture](./architecture/)
System design, data flow, and architectural decisions for the Dynasty platform.

- [System Overview](./architecture/system-overview.md) - High-level architecture
- [Data Flow](./architecture/data-flow.md) - How data moves through the system
- [Security Architecture](./architecture/security-architecture.md) - Security design principles
- [Technology Stack](./architecture/technology-stack.md) - Technology choices and rationale

### [API Reference](./api-reference/)
Complete API documentation for all services and endpoints.

- [Firebase Functions](./api-reference/firebase-functions.md) - All cloud functions
- [Authentication](./api-reference/authentication.md) - Auth endpoints and methods
- [Messaging](./api-reference/messaging.md) - Chat and messaging APIs
- [Vault](./api-reference/vault.md) - File storage and management
- [Stories & Events](./api-reference/stories-events.md) - Content creation APIs

### [Developer Guides](./guides/)
How-to guides and tutorials for common tasks.

- [Getting Started](./guides/getting-started.md) - Developer onboarding
- [Deployment](./guides/deployment.md) - Deploy to production
- [Testing](./guides/testing.md) - Testing strategies and commands
- [Troubleshooting](./guides/troubleshooting.md) - Common issues and solutions
- [Contributing](./guides/contributing.md) - Contribution guidelines

### [Features](./features/)
In-depth documentation for each major feature.

- **[Authentication](./features/authentication/)** - User authentication system
- **[Messaging](./features/messaging/)** - E2E encrypted chat system
- **[Stories](./features/stories/)** - Family story creation and sharing
- **[Vault](./features/vault/)** - Secure file storage

### [Security](./security/)
Security documentation and best practices.

- [Security Overview](./security/README.md) - Security principles
- [Audit Report](./security/audit-report.md) - Latest security audit
- [Encryption](./security/encryption.md) - Encryption methods and implementation
- [Best Practices](./security/best-practices.md) - Security guidelines

### [Infrastructure](./infrastructure/)
Infrastructure setup and configuration.

- [Firebase Setup](./infrastructure/firebase-setup.md) - Firebase configuration
- [Cloudflare R2](./infrastructure/cloudflare-r2.md) - Object storage setup
- [Monitoring](./infrastructure/monitoring.md) - Logging and monitoring

### [Implementations](./implementations/)
Completed implementation documentation.

- [Signal Protocol](./implementations/SIGNAL_PROTOCOL_IMPLEMENTATION_COMPLETE.md) - Signal Protocol implementation
- [E2EE](./implementations/E2EE_IMPLEMENTATION_COMPLETE_SUMMARY.md) - End-to-end encryption
- [Libsignal Native](./implementations/LIBSIGNAL_NATIVE_IMPLEMENTATION.md) - Native libsignal implementation
- [Fingerprint](./implementations/FINGERPRINT_IMPLEMENTATION_SUMMARY.md) - Device fingerprinting

### [Summaries](./summaries/)
Feature analyses and test coverage summaries.

- [Dynasty Feature Parity](./summaries/DYNASTY_FEATURE_PARITY_ANALYSIS.md) - Feature parity analysis
- [Messaging Feature Parity](./summaries/MESSAGING_FEATURE_PARITY_ANALYSIS.md) - Messaging parity analysis
- [Test Coverage](./summaries/TEST_COVERAGE_SUMMARY.md) - Test coverage summary

## 🚀 Quick Links

- [CHANGELOG](../CHANGELOG.md) - Version history and updates
- [Mobile App README](../apps/mobile/README.md) - Mobile app specific docs
- [Web App README](../apps/web/dynastyweb/README.md) - Web app specific docs
- [Firebase Functions README](../apps/firebase/functions/README.md) - Backend docs

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

*Last Updated: January 2025*