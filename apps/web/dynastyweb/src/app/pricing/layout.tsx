import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing - Dynasty | Family History Platform',
  description: 'Choose the perfect Dynasty plan for your family. Secure storage, unlimited memories, and advanced features starting at $9.99/month.',
  keywords: 'Dynasty pricing, family history subscription, family tree software pricing, genealogy app cost',
  openGraph: {
    title: 'Dynasty Pricing - Preserve Your Family Legacy',
    description: 'Secure storage for photos, videos, and family stories. Plans starting at $9.99/month with unlimited family members.',
    url: 'https://mydynastyapp.com/pricing',
    siteName: 'Dynasty',
    images: [
      {
        url: 'https://mydynastyapp.com/og-pricing.png',
        width: 1200,
        height: 630,
        alt: 'Dynasty Pricing Plans',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dynasty Pricing - Family History Platform',
    description: 'Choose the perfect plan for preserving your family memories. Starting at $9.99/month.',
    images: ['https://mydynastyapp.com/og-pricing.png'],
  },
  alternates: {
    canonical: 'https://mydynastyapp.com/pricing',
  },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Dynasty Family History Platform",
            "description": "Secure platform for preserving and sharing family memories",
            "brand": {
              "@type": "Brand",
              "name": "Dynasty"
            },
            "offers": [
              {
                "@type": "Offer",
                "name": "Free Plan",
                "price": "0",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock"
              },
              {
                "@type": "Offer",
                "name": "Individual Basic",
                "price": "9.99",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock",
                "priceValidUntil": "2025-12-31"
              },
              {
                "@type": "Offer",
                "name": "Individual Premium",
                "price": "19.99",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock",
                "priceValidUntil": "2025-12-31"
              },
              {
                "@type": "Offer",
                "name": "Family Plan",
                "price": "29.99",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock",
                "priceValidUntil": "2025-12-31"
              }
            ]
          })
        }}
      />
      {children}
    </>
  )
}