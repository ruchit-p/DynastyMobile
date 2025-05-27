# Dynasty Architecture Documentation

This section contains detailed information about Dynasty's system architecture, design decisions, and technical implementation.

## Overview

Dynasty is built as a modern, scalable family history platform with:
- **Cross-platform clients** (React Native mobile, Next.js web)
- **Serverless backend** (Firebase Functions)
- **NoSQL database** (Firestore)
- **Object storage** (Firebase Storage, Cloudflare R2)
- **Real-time sync** (Firestore listeners)
- **Offline-first design** (SQLite, IndexedDB)

## Documentation Index

### [System Overview](./system-overview.md)
High-level architecture and component relationships.

### [Data Flow](./data-flow.md)
How data moves through the system, from client to storage.

### [Security Architecture](./security-architecture.md)
Security layers, encryption, and access control.

### [Technology Stack](./technology-stack.md)
Technology choices and rationale for each component.

## Key Architectural Principles

1. **Offline-First**: All features work offline with sync
2. **End-to-End Security**: Client-side encryption for sensitive data
3. **Scalability**: Serverless functions and NoSQL for scale
4. **Cross-Platform**: Shared business logic, platform-specific UI
5. **Real-Time**: Live updates without polling
6. **Progressive Enhancement**: Core features work everywhere

## Architecture Diagrams

### High-Level Architecture
```
┌─────────────────┐     ┌─────────────────┐
│  Mobile Client  │     │   Web Client    │
│  (React Native) │     │   (Next.js)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │ HTTPS
              ┌──────┴──────┐
              │   Firebase  │
              │  Functions  │
              └──────┬──────┘
                     │
       ┌─────────────┴─────────────┐
       │                           │
┌──────┴──────┐           ┌────────┴────────┐
│  Firestore  │           │ Cloud Storage   │
│  (Database) │           │ (Files/Media)   │
└─────────────┘           └─────────────────┘
```

### Data Flow
```
User Action → Client Validation → Encryption (if needed)
    ↓
API Request → Firebase Auth → Function Execution
    ↓
Business Logic → Data Validation → Database Operation
    ↓
Response → Client Update → UI Update → Cache Update
```

## Technology Decisions

### Frontend
- **React Native**: Code sharing, native performance
- **Expo**: Simplified development, OTA updates
- **Next.js 14**: SSR/SSG, app router, server components

### Backend
- **Firebase Functions**: Auto-scaling, pay-per-use
- **TypeScript**: Type safety, better tooling
- **Express-like middleware**: Familiar patterns

### Data Storage
- **Firestore**: Real-time sync, offline support
- **Firebase Storage**: Media files, automatic CDN
- **Cloudflare R2**: Cost-effective large file storage

### Infrastructure
- **Firebase Hosting**: Global CDN, SSL included
- **GitHub Actions**: CI/CD automation
- **Sentry**: Error tracking and monitoring

## Scalability Considerations

1. **Database Sharding**: Collection group queries for scale
2. **Function Concurrency**: Configured limits per function
3. **Storage Optimization**: Image resizing, video compression
4. **Caching Strategy**: Multi-level caching (memory, disk, CDN)
5. **Rate Limiting**: Per-user and per-IP limits

## Security Layers

1. **Authentication**: Firebase Auth with MFA
2. **Authorization**: Role-based access control
3. **Encryption**: E2EE for messages, client-side for vault
4. **Network**: HTTPS only, certificate pinning on mobile
5. **Application**: Input validation, output sanitization
6. **Infrastructure**: WAF, DDoS protection

## Monitoring & Observability

- **Performance**: Core Web Vitals, app launch time
- **Errors**: Sentry integration, structured logging
- **Usage**: Analytics, custom events
- **Security**: Audit logs, anomaly detection
- **Availability**: Uptime monitoring, health checks