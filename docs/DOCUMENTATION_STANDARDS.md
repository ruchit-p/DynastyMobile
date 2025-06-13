# Documentation Standards

> Last Updated: January 2025

This guide defines the standards and conventions for all documentation in the Dynasty Mobile repository.

## 📝 Documentation Structure

### File Naming Conventions

- **Implementation Guides**: `{FEATURE}_IMPLEMENTATION.md`
- **Migration Guides**: `{FROM}_TO_{TO}_MIGRATION.md`
- **Setup Guides**: `{SERVICE}_SETUP.md`
- **Analysis Documents**: `{TOPIC}_ANALYSIS.md`
- **Summaries**: `{TOPIC}_SUMMARY.md`
- **Deprecated Docs**: `DEPRECATED_{ORIGINAL_FILENAME}.md` (in archive folder)

### Document Headers

Every documentation file must include:

```markdown
# Document Title

> Last Updated: Month YYYY

Brief description of what this document covers.

## Table of Contents (for documents > 500 lines)

- [Section 1](#section-1)
- [Section 2](#section-2)
```

### Deprecation Notices

When deprecating documentation:

```markdown
> **⚠️ DEPRECATED - January 2025**
> 
> This documentation is deprecated. {Service/Feature} has been removed from the codebase.
> 
> **Migration Notes:**
> - What replaced it
> - Link to current documentation
> 
> **For Historical Reference Only**
```

## 🏗️ Content Guidelines

### Section Structure

1. **Overview/Introduction** - What and why
2. **Prerequisites** - Required setup/knowledge
3. **Implementation/Configuration** - Step-by-step instructions
4. **Testing** - How to verify it works
5. **Troubleshooting** - Common issues and solutions
6. **References** - Links to related docs

### Code Examples

Always include language identifier for syntax highlighting:

```typescript
// TypeScript example
const example = async () => {
  // Code here
};
```

```bash
# Bash example
npm install package-name
```

### Environment-Specific Information

Always clarify which environment:

- **Production**: `mydynastyapp.com`
- **Staging**: `dynastytest.com`
- **Development**: `localhost:3000`

### Security Information

Mark sensitive information clearly:

```markdown
> **🔒 Security Note**: Never commit API keys to the repository
```

## 📊 Documentation Categories

### `/docs/` - Main Documentation
- High-level guides and overviews
- Cross-platform documentation
- Architecture decisions

### `/docs/archive/` - Deprecated Documentation
- Old implementation guides
- Superseded migration plans
- Historical reference

### `/docs/implementations/` - Completed Features
- Summaries of implemented features
- Final architecture decisions
- Lessons learned

### `/docs/migration/` - Migration Guides
- Step-by-step migration instructions
- Rollback procedures
- Timeline and phases

### `/docs/security/` - Security Documentation
- Audit reports
- Security best practices
- Vulnerability documentation

### App-Specific Documentation
- `/apps/mobile/docs/` - Mobile-specific guides
- `/apps/web/dynastyweb/docs/` - Web-specific guides
- `/apps/firebase/functions/docs/` - Backend-specific guides

## ✅ Documentation Checklist

Before committing documentation:

- [ ] Added "Last Updated" date
- [ ] Included clear title and description
- [ ] Added table of contents (if > 500 lines)
- [ ] Used proper markdown formatting
- [ ] Included code examples where relevant
- [ ] Specified environment-specific values
- [ ] Added security warnings where needed
- [ ] Cross-referenced related documentation
- [ ] Spell-checked and grammar-checked
- [ ] Verified technical accuracy

## 🔄 Maintenance

### Regular Reviews

Documentation should be reviewed:
- **Quarterly**: For accuracy and relevance
- **After Major Features**: Update affected docs
- **After Deprecations**: Move old docs to archive

### Version History

For critical documents, maintain version history:

```markdown
## Version History

- **v2.0** (January 2025): Migrated to AWS SES
- **v1.0** (October 2024): Initial SendGrid implementation
```

## 📚 Templates

### Feature Implementation Template

```markdown
# {Feature} Implementation

> Last Updated: Month YYYY

Brief description of the feature and its purpose.

## Overview

What this feature does and why it's important.

## Architecture

How it fits into the overall system.

## Implementation Details

### Backend
- API endpoints
- Database schema
- Security considerations

### Frontend
- UI components
- State management
- User flows

## Configuration

Environment variables and setup required.

## Testing

How to test the implementation.

## Deployment

Steps to deploy to production.

## Monitoring

How to monitor the feature in production.
```

### Migration Guide Template

```markdown
# {From} to {To} Migration Guide

> Last Updated: Month YYYY

## Overview

Why we're migrating and expected benefits.

## Prerequisites

What needs to be in place before starting.

## Migration Steps

### Phase 1: Preparation
1. Step-by-step instructions

### Phase 2: Migration
1. Step-by-step instructions

### Phase 3: Verification
1. Step-by-step instructions

## Rollback Procedure

How to revert if needed.

## Timeline

Expected duration and milestones.

## Post-Migration

Cleanup and optimization steps.
```

## 🚀 Best Practices

1. **Be Concise**: Write clearly and avoid unnecessary complexity
2. **Use Examples**: Show, don't just tell
3. **Stay Current**: Update docs when code changes
4. **Think of the Reader**: Write for developers new to the project
5. **Include Context**: Explain the "why" not just the "how"
6. **Use Diagrams**: Visual representations for complex concepts
7. **Test Instructions**: Verify steps work before publishing

---

For questions about documentation standards, contact the development team or refer to the main [README.md](../README.md).