import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Dynasty',
  description: 'Dynasty Terms of Service - Legal terms and conditions for using the Dynasty family social media platform.',
  robots: 'index, follow',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="px-8 py-12">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms of Service</h1>
              <p className="text-lg text-gray-600">
                <strong>Effective Date:</strong> May 27, 2025<br />
                <strong>Last Updated:</strong> May 27, 2025
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. ACCEPTANCE OF TERMS</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  By accessing, downloading, installing, or using Dynasty (the &quot;App&quot;), you (&quot;User,&quot; &quot;you,&quot; or &quot;your&quot;) agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the App.
                </p>
                <p className="text-gray-700 leading-relaxed">
                  Dynasty is operated by Dynasty Platforms (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). These Terms constitute a legally binding agreement between you and the Company.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. SERVICE DESCRIPTION</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty is a family-focused social media platform that enables users to:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li><strong>Family Tree Management:</strong> Create, maintain, and expand family tree connections with invitation-based member addition</li>
                  <li><strong>History Book:</strong> Create multimedia stories with text, images, videos, audio, titles, subtitles, dates, cover photos, and location data</li>
                  <li><strong>Event Management:</strong> Create and manage family events with detailed information, guest lists, RSVP tracking, itineraries, and shared vault integration</li>
                  <li><strong>Vault Storage:</strong> Secure, encrypted cloud storage for photos, videos, documents, and folders with advanced organizational features</li>
                  <li><strong>Encrypted Messaging:</strong> End-to-end encrypted one-on-one and group family communications</li>
                  <li><strong>Feed:</strong> Centralized timeline for viewing and interacting with family stories and events</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. ELIGIBILITY AND ACCOUNT REQUIREMENTS</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">3.1 Age Requirements</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li>Users must be at least 13 years old to create an account</li>
                  <li>Users under 18 must have parental consent</li>
                  <li>Parents/guardians are responsible for minors&apos; use of the App</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900 mb-3">3.2 Account Registration</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li>You must provide accurate, current, and complete information during registration</li>
                  <li>You are responsible for maintaining the confidentiality of your account credentials</li>
                  <li>You must promptly notify us of any unauthorized use of your account</li>
                  <li>One person may not maintain multiple accounts</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900 mb-3">3.3 Family Tree Verification</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>You represent that you have the right to invite family members to your family tree</li>
                  <li>You warrant that all family relationship information you provide is accurate</li>
                  <li>You understand that family tree connections are permanent and cannot be easily reversed</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. PRIVACY AND DATA PROTECTION</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Your privacy is paramount. Our data practices are governed by our <a href="/privacy" className="text-blue-600 hover:text-blue-800 underline">Privacy Policy</a>, which is incorporated by reference into these Terms.
                </p>

                <h3 className="text-xl font-medium text-gray-900 mb-3">4.1 End-to-End Encryption</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li>Messages are encrypted using industry-standard protocols (AES-256-GCM, ECDH)</li>
                  <li>Only intended recipients can decrypt and read messages</li>
                  <li>We cannot access the content of your encrypted communications</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900 mb-3">4.2 Vault Security</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Files stored in the Vault are encrypted both in transit and at rest</li>
                  <li>Multiple layers of security protect your stored media and documents</li>
                  <li>You are responsible for maintaining secure access to your account</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. SUBSCRIPTION AND PAYMENT TERMS</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">5.1 Service Tiers</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty operates on a freemium model with premium subscription options:
                </p>
                
                <div className="bg-gray-50 p-6 rounded-lg mb-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Free Tier:</h4>
                  <ul className="list-disc pl-6 text-gray-700 space-y-1">
                    <li>Basic family tree (up to 25 members)</li>
                    <li>Limited vault storage (5GB)</li>
                    <li>Standard story creation features</li>
                    <li>Basic event management</li>
                  </ul>
                </div>

                <div className="bg-blue-50 p-6 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Premium Subscription:</h4>
                  <ul className="list-disc pl-6 text-blue-800 space-y-1">
                    <li>Unlimited family tree members</li>
                    <li>Enhanced vault storage (up to 1TB)</li>
                    <li>Advanced story templates and editing tools</li>
                    <li>Priority customer support</li>
                    <li>Premium event features with advanced itinerary tools</li>
                    <li>Extended message history retention</li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. PROHIBITED USES</h2>
                <p className="text-gray-700 leading-relaxed mb-4">You may not use Dynasty to:</p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Violate any applicable laws or regulations</li>
                  <li>Impersonate others or provide false identity information</li>
                  <li>Harvest or collect user information for unauthorized purposes</li>
                  <li>Interfere with or disrupt the App&apos;s functionality</li>
                  <li>Attempt to gain unauthorized access to other accounts or systems</li>
                  <li>Use automated systems to access or interact with the App</li>
                  <li>Create duplicate or fraudulent accounts</li>
                  <li>Engage in commercial activities without prior authorization</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. LIMITATION OF LIABILITY</h2>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded">
                  <p className="text-gray-800 font-medium">
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU FOR THE SERVICE IN THE 12 MONTHS PRECEDING THE CLAIM.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. CONTACT INFORMATION</h2>
                <p className="text-gray-700 leading-relaxed">
                  For questions about these Terms, please contact us at:
                </p>
                <div className="bg-gray-50 p-6 rounded-lg mt-4">
                  <p className="text-gray-700">
                    <strong>Dynasty Platforms</strong><br />
                    Email: support@mydynastyapp.com<br />
                    Address: 7901 4th St N STE 300, St. Petersburg, FL 33702<br />
                    Phone: +1 (866) 314-1530
                  </p>
                </div>
              </section>

              <div className="border-t pt-8 mt-12">
                <p className="text-center text-gray-600 font-medium">
                  By using Dynasty, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}