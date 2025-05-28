# Vercel Analytics Setup Guide

This document explains the Vercel Analytics integration for the Dynasty web application.

## 📊 Overview

Vercel Analytics provides:

- **Real-time visitor tracking** - Page views, unique visitors, bounce rate
- **Performance monitoring** - Core Web Vitals, loading times
- **User behavior insights** - Popular pages, traffic sources, geographic data

## 🚀 Implementation

### 1. Packages Installed

```bash
@vercel/analytics@^1.4.1     # Core analytics tracking
@vercel/speed-insights@^1.1.0 # Performance monitoring
```

### 2. Integration Points

#### Root Layout (`apps/web/dynastyweb/src/app/layout.tsx`)

```tsx
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}

        {/* Vercel Analytics & Speed Insights */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

## 📈 Analytics Features

### 1. **Web Analytics**

- **Page Views**: Tracks all page visits and user navigation
- **Unique Visitors**: Counts distinct users visiting your site
- **Bounce Rate**: Measures single-page session percentage
- **Traffic Sources**: Shows where visitors come from (direct, social, search)
- **Geographic Data**: Visitor location breakdown
- **Device Information**: Desktop vs mobile usage stats

### 2. **Speed Insights**

- **Core Web Vitals**: LCP, FID, CLS measurements
- **Performance Scores**: Real user monitoring data
- **Loading Times**: Page load performance tracking
- **Browser Performance**: Performance across different browsers

## 🔧 Configuration

### Environment Requirements

- **Production**: Analytics automatically enabled on Vercel deployments
- **Development**: Analytics disabled locally by default
- **Preview**: Analytics enabled for preview deployments

### Privacy & GDPR Compliance

- **No PII Collection**: Vercel Analytics doesn't collect personal information
- **Cookie-Free**: Uses privacy-first tracking methods
- **GDPR Compliant**: Respects user privacy by default

## 📊 Accessing Analytics Data

### Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (`dynastyweb`)
3. Navigate to "Analytics" tab
4. View real-time and historical data

### Analytics Views Available:

- **Overview**: High-level metrics and trends
- **Pages**: Performance of individual pages
- **Referrers**: Traffic source analysis
- **Countries**: Geographic visitor distribution
- **Devices**: Desktop vs mobile usage

## 🎯 Key Metrics to Monitor

### Traffic Metrics

- **Daily/Monthly Active Users**
- **Page Views per Session**
- **Session Duration**
- **Bounce Rate**

### Performance Metrics

- **Core Web Vitals Scores**
- **Page Load Times**
- **Time to Interactive (TTI)**
- **First Contentful Paint (FCP)**

### User Experience

- **Most Popular Pages**
- **User Flow Patterns**
- **Exit Points**
- **Device/Browser Distribution**

## 🔄 CI/CD Integration

Analytics is automatically deployed with your web application through the existing CI/CD pipeline:

### Deployment Flow

```bash
# Push to main branch
git push origin main

# CI/CD Pipeline runs:
# 1. Install dependencies (including @vercel/analytics)
# 2. Build Next.js application with Analytics
# 3. Deploy to Vercel production
# 4. Analytics automatically starts collecting data
```

## 🛠️ Troubleshooting

### Common Issues

#### Analytics Not Showing Data

```bash
# Check if properly deployed
vercel ls

# Verify domain configuration
vercel domains ls

# Check build logs
vercel logs [deployment-url]
```

#### Speed Insights Not Working

- Ensure you're testing on the production domain
- Analytics needs real traffic (not localhost)
- Data may take 24-48 hours to appear initially

### Debug Mode (Development)

```tsx
// Enable debug mode for testing
import { Analytics } from "@vercel/analytics/react";

<Analytics debug={process.env.NODE_ENV === "development"} />;
```

## 📚 Additional Resources

- [Vercel Analytics Documentation](https://vercel.com/docs/analytics)
- [Speed Insights Guide](https://vercel.com/docs/speed-insights)
- [Core Web Vitals Explained](https://web.dev/vitals/)
- [Privacy Policy Guidelines](https://vercel.com/docs/analytics/privacy-policy)

## 🔒 Privacy Considerations

- **Data Retention**: Vercel retains analytics data for 90 days
- **Data Processing**: All data processing happens on Vercel's servers
- **User Consent**: No explicit consent needed (privacy-first approach)
- **Data Export**: Analytics data can be exported via Vercel API

## 🎛️ Advanced Configuration

### Custom Events (Optional)

```tsx
import { track } from "@vercel/analytics";

// Track custom events
track("Newsletter Signup", { location: "footer" });
track("Button Click", { button: "cta-main" });
```

### Filtering & Segments

- Filter data by date ranges
- Segment by traffic sources
- Compare different time periods
- Export data for external analysis

Your Dynasty web application now has comprehensive analytics tracking to help you understand user behavior and optimize performance!
