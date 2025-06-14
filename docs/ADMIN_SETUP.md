# Dynasty Admin Dashboard Setup Guide

## Overview

The Dynasty Admin Dashboard is a secure, separate interface for super administrators to monitor and manage the Dynasty application. It uses a subdomain architecture with enhanced security features.

## Architecture

- **Subdomain**: `admin.yourdomain.com`
- **Authentication**: Firebase Auth with custom claims
- **Security**: IP allowlisting, 2FA requirement, audit logging
- **Access Control**: Role-based with Firebase custom claims

## Initial Setup

### 1. Environment Configuration

Add these variables to your environment files:

#### Web App (.env.local)
```env
# Admin Configuration
NEXT_PUBLIC_ADMIN_SUBDOMAIN=admin
ADMIN_ALLOWED_IPS=192.168.1.1,10.0.0.0/24  # Optional IP allowlist
ADMIN_SESSION_DURATION=3600
ADMIN_REQUIRE_2FA=true
ADMIN_NOTIFICATION_EMAIL=admin@yourdomain.com
```

#### Firebase Functions (.env.local)
```env
# Admin Setup
ADMIN_SETUP_KEY=generate-a-secure-random-string-here
```

### 2. Deploy Firebase Functions

Deploy the admin management functions:

```bash
cd apps/firebase/functions
yarn deploy --only functions:setAdminClaim,functions:verifyAdminAccess,functions:getAdminAuditLogs,functions:initializeFirstAdmin
```

### 3. Configure DNS

Add a CNAME record for your admin subdomain:

```
Type: CNAME
Name: admin
Value: your-main-domain.com (or your Vercel deployment URL)
```

### 4. Update Vercel Configuration

In your Vercel project settings, add the admin subdomain:

1. Go to Project Settings → Domains
2. Add `admin.yourdomain.com`
3. Vercel will automatically provision SSL

### 5. Create First Admin

Run the setup script to grant admin privileges to an existing user:

```bash
node scripts/setup-admin.js --email admin@yourdomain.com --key YOUR_SETUP_KEY --env production
```

**Note**: The user must already have a verified account before running this script.

## Security Features

### 1. Multi-Layer Authentication

- Firebase Authentication required
- Custom admin claims verification
- Optional 2FA enforcement
- Session-based access control

### 2. IP Allowlisting

Configure allowed IP addresses in `ADMIN_ALLOWED_IPS`:

```env
# Single IP
ADMIN_ALLOWED_IPS=192.168.1.100

# Multiple IPs
ADMIN_ALLOWED_IPS=192.168.1.100,192.168.1.101

# CIDR notation
ADMIN_ALLOWED_IPS=10.0.0.0/24,192.168.0.0/16
```

### 3. Audit Logging

All admin actions are automatically logged:

- Login/logout events
- User modifications
- Permission changes
- System configuration updates

### 4. Security Headers

Enhanced CSP and security headers for admin pages:

- Strict Content Security Policy
- X-Frame-Options: DENY
- No external scripts allowed
- Restricted resource loading

## Admin Features

### Dashboard
- User growth metrics
- Revenue tracking
- System health monitoring
- Recent activity feed

### User Management
- View all users
- Search and filter
- Grant/revoke admin privileges
- Suspend/reactivate accounts
- View user content statistics

### Analytics (Coming Soon)
- Detailed usage analytics
- Revenue reports
- Growth trends
- Engagement metrics

### Audit Logs
- Complete action history
- Filterable by action type
- User tracking
- IP address logging

## Managing Additional Admins

After the first admin is created, use the admin dashboard to manage additional administrators:

1. Sign in to `admin.yourdomain.com`
2. Navigate to Users
3. Find the user to promote
4. Click Actions → Make Admin

## Local Development

For local development with admin subdomain:

1. Add to `/etc/hosts`:
```
127.0.0.1 admin.localhost
```

2. Access the admin dashboard at:
```
http://admin.localhost:3002
```

## Security Best Practices

1. **Strong Passwords**: Enforce strong passwords for admin accounts
2. **2FA Required**: Always enable 2FA for admin users
3. **Regular Audits**: Review audit logs regularly
4. **IP Restrictions**: Use IP allowlisting in production
5. **Separate Credentials**: Don't reuse admin credentials
6. **Monitor Access**: Set up alerts for admin logins
7. **Principle of Least Privilege**: Only grant admin access when necessary

## Troubleshooting

### Admin Access Denied

1. Verify custom claims are set:
```javascript
// In Firebase Console → Authentication → User
// Check Custom Claims tab for: { "admin": true }
```

2. Force token refresh:
```javascript
await auth.currentUser.getIdToken(true);
```

### Subdomain Not Working

1. Verify DNS propagation:
```bash
dig admin.yourdomain.com
```

2. Check Vercel domain configuration
3. Ensure middleware is handling subdomain routing

### IP Allowlist Issues

1. Check your public IP:
```bash
curl ifconfig.me
```

2. Verify IP format in environment variable
3. Check for proxy/CDN IP forwarding

## Monitoring

Set up monitoring for:

- Failed admin login attempts
- Unusual admin activity patterns
- System health degradation
- High error rates

Consider integrating:
- Sentry for error tracking
- DataDog/New Relic for performance
- PagerDuty for alerts

## Future Enhancements

Planned features for the admin dashboard:

1. **Advanced Analytics**
   - Cohort analysis
   - Retention metrics
   - Feature adoption tracking

2. **Content Moderation**
   - AI-powered content scanning
   - User report management
   - Bulk content actions

3. **System Configuration**
   - Feature flags management
   - A/B testing controls
   - Maintenance mode

4. **Communication Tools**
   - Broadcast messaging
   - User surveys
   - Announcement banners

5. **Advanced Security**
   - Hardware key support
   - Session management
   - Suspicious activity detection