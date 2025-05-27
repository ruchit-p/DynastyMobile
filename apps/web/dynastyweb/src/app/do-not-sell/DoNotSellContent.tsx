'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import CookieSettings to avoid SSR issues
const CookieSettings = dynamic(() => import('@/components/CookieSettings'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-100 rounded-lg h-96" />
});

export default function DoNotSellContent() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="px-8 py-12">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                Do Not Sell or Share My Personal Information
              </h1>
              <p className="text-lg text-gray-600">
                California Consumer Privacy Rights
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Your California Privacy Rights</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA), California residents have the right to opt-out of the &quot;sale&quot; or &quot;sharing&quot; of their personal information.
                </p>
                
                <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded mb-6">
                  <p className="text-blue-800 font-medium mb-2">
                    <strong>Important:</strong> Dynasty does not sell your personal information in the traditional sense. However, under California law, certain data sharing for analytics or advertising purposes may be considered a &quot;sale&quot; or &quot;sharing.&quot;
                  </p>
                  <p className="text-blue-800">
                    We respect your privacy choices and provide you with complete control over your data.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">What This Means</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">Information We May Share:</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li><strong>Analytics Data:</strong> Anonymized usage data with Google Analytics and Firebase</li>
                  <li><strong>Error Tracking:</strong> Technical error information with Sentry for improving our service</li>
                  <li><strong>Payment Processing:</strong> Transaction data with Stripe (for premium subscriptions only)</li>
                  <li><strong>Third-Party Services:</strong> Limited data necessary for features like Google Maps</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900 mb-3">Information We NEVER Sell:</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Your family stories, photos, or videos</li>
                  <li>Your family tree information</li>
                  <li>Your personal messages or communications</li>
                  <li>Your contact information or email addresses</li>
                  <li>Any identifiable personal information to advertisers</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Opt-Out Options</h2>
                
                <div className="bg-green-50 p-6 rounded-lg mb-6">
                  <h3 className="text-lg font-semibold text-green-900 mb-3">Method 1: Cookie Preferences (Recommended)</h3>
                  <p className="text-green-800 mb-4">
                    Use the cookie settings below to opt-out of analytics and third-party cookies. This is the fastest and most comprehensive way to opt-out.
                  </p>
                  <div className="bg-white rounded-lg border border-green-200 p-6">
                    <CookieSettings />
                  </div>
                </div>

                <div className="bg-yellow-50 p-6 rounded-lg mb-6">
                  <h3 className="text-lg font-semibold text-yellow-900 mb-3">Method 2: Email Request</h3>
                  <p className="text-yellow-800 mb-2">
                    Email us at <a href="mailto:privacy@mydynastyapp.com" className="underline">privacy@mydynastyapp.com</a> with:
                  </p>
                  <ul className="list-disc pl-6 text-yellow-800 space-y-1">
                    <li>Subject line: &quot;California Opt-Out Request&quot;</li>
                    <li>Your Dynasty account email</li>
                    <li>Statement: &quot;I request to opt-out of the sale/sharing of my personal information&quot;</li>
                  </ul>
                  <p className="text-yellow-800 mt-2">
                    We will process your request within 15 business days.
                  </p>
                </div>

                <div className="bg-purple-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-purple-900 mb-3">Method 3: Global Privacy Control</h3>
                  <p className="text-purple-800">
                    Dynasty honors the Global Privacy Control (GPC) signal. If your browser sends a GPC signal, we automatically apply opt-out preferences for California users.
                    <a href="https://globalprivacycontrol.org/" className="underline ml-1" target="_blank" rel="noopener noreferrer">
                      Learn more about GPC
                    </a>
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Additional California Rights</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  As a California resident, you also have the right to:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li><strong>Know:</strong> What personal information we collect, use, and share</li>
                  <li><strong>Access:</strong> Receive a copy of your personal information</li>
                  <li><strong>Delete:</strong> Request deletion of your personal information</li>
                  <li><strong>Correct:</strong> Request correction of inaccurate information</li>
                  <li><strong>Limit Use:</strong> Restrict use of sensitive personal information</li>
                  <li><strong>Non-Discrimination:</strong> Not face retaliation for exercising your rights</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  To exercise these rights, visit our <a href="/privacy#your-rights" className="text-blue-600 hover:text-blue-800 underline">Privacy Policy</a> or contact us at privacy@mydynastyapp.com.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Authorized Agents</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  You may designate an authorized agent to make requests on your behalf. The agent must provide:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Written permission signed by you</li>
                  <li>Verification of their identity</li>
                  <li>Direct confirmation from you about the authorization</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Questions?</h2>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <p className="text-gray-700 mb-2">
                    If you have questions about your privacy rights or need assistance:
                  </p>
                  <p className="text-gray-700">
                    <strong>Privacy Team</strong><br />
                    Email: privacy@mydynastyapp.com<br />
                    Phone: +1 (866) 314-1530<br />
                    Address: 7901 4th St N STE 300, St. Petersburg, FL 33702
                  </p>
                </div>
              </section>

              <div className="border-t pt-8 mt-12">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <p className="text-center text-green-800 font-medium">
                    Dynasty is committed to protecting your privacy and giving you control over your personal information. We believe in transparency and respect your choices.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}