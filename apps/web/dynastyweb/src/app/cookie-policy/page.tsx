import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy | Dynasty',
  description: 'Dynasty Cookie Policy - Learn how we use cookies to enhance your family social media experience while protecting your privacy.',
  robots: 'index, follow',
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="px-8 py-12">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Cookie Policy</h1>
              <p className="text-lg text-gray-600">
                <strong>Effective Date:</strong> May 27, 2025<br />
                <strong>Last Updated:</strong> May 27, 2025
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. INTRODUCTION</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty Platforms (&quot;Dynasty,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) uses cookies and similar tracking technologies on our family social media platform and related services. This Cookie Policy explains what cookies are, how we use them, and your choices regarding their use.
                </p>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded">
                  <p className="text-blue-800 font-medium">
                    <strong>Your Privacy Matters:</strong> We use cookies to enhance your experience while respecting your privacy. You have full control over non-essential cookies through our consent management system.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. WHAT ARE COOKIES?</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Cookies are small text files placed on your device when you visit our platform. They help us provide a better user experience by remembering your preferences, understanding how you use Dynasty, and improving our services.
                </p>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">Types of Tracking Technologies We Use:</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li><strong>Cookies:</strong> Small data files stored on your browser</li>
                  <li><strong>Local Storage:</strong> Browser-based storage for user preferences</li>
                  <li><strong>Session Storage:</strong> Temporary storage cleared when you close your browser</li>
                  <li><strong>Pixels:</strong> Invisible images that track email opens and webpage visits</li>
                  <li><strong>Device Identifiers:</strong> Unique IDs assigned to your device</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. COOKIES WE USE</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">3.1 Essential Cookies (Always Active)</h3>
                <div className="bg-green-50 p-6 rounded-lg mb-4">
                  <p className="text-green-800 mb-3">These cookies are necessary for Dynasty to function properly and cannot be disabled.</p>
                  <table className="min-w-full bg-white border border-green-200">
                    <thead>
                      <tr className="bg-green-100">
                        <th className="px-4 py-2 text-left text-green-900">Cookie Name</th>
                        <th className="px-4 py-2 text-left text-green-900">Purpose</th>
                        <th className="px-4 py-2 text-left text-green-900">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-green-200">
                        <td className="px-4 py-2">dynasty_session</td>
                        <td className="px-4 py-2">Maintains your login session</td>
                        <td className="px-4 py-2">Session</td>
                      </tr>
                      <tr className="border-t border-green-200">
                        <td className="px-4 py-2">dynasty_auth</td>
                        <td className="px-4 py-2">Authentication token for secure access</td>
                        <td className="px-4 py-2">7 days</td>
                      </tr>
                      <tr className="border-t border-green-200">
                        <td className="px-4 py-2">cookie_consent</td>
                        <td className="px-4 py-2">Stores your cookie preferences</td>
                        <td className="px-4 py-2">1 year</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-xl font-medium text-gray-900 mb-3">3.2 Analytics Cookies</h3>
                <div className="bg-purple-50 p-6 rounded-lg mb-4">
                  <p className="text-purple-800 mb-3">Help us understand how users interact with Dynasty to improve our services.</p>
                  <table className="min-w-full bg-white border border-purple-200">
                    <thead>
                      <tr className="bg-purple-100">
                        <th className="px-4 py-2 text-left text-purple-900">Cookie Name</th>
                        <th className="px-4 py-2 text-left text-purple-900">Provider</th>
                        <th className="px-4 py-2 text-left text-purple-900">Purpose</th>
                        <th className="px-4 py-2 text-left text-purple-900">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-purple-200">
                        <td className="px-4 py-2">_ga</td>
                        <td className="px-4 py-2">Google Analytics</td>
                        <td className="px-4 py-2">Distinguishes unique users</td>
                        <td className="px-4 py-2">2 years</td>
                      </tr>
                      <tr className="border-t border-purple-200">
                        <td className="px-4 py-2">_gid</td>
                        <td className="px-4 py-2">Google Analytics</td>
                        <td className="px-4 py-2">Distinguishes users</td>
                        <td className="px-4 py-2">24 hours</td>
                      </tr>
                      <tr className="border-t border-purple-200">
                        <td className="px-4 py-2">_ga_*</td>
                        <td className="px-4 py-2">Google Analytics 4</td>
                        <td className="px-4 py-2">Maintains session state</td>
                        <td className="px-4 py-2">2 years</td>
                      </tr>
                      <tr className="border-t border-purple-200">
                        <td className="px-4 py-2">__firebase_*</td>
                        <td className="px-4 py-2">Firebase Analytics</td>
                        <td className="px-4 py-2">App performance and usage analytics</td>
                        <td className="px-4 py-2">Variable</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-xl font-medium text-gray-900 mb-3">3.3 Functionality Cookies</h3>
                <div className="bg-yellow-50 p-6 rounded-lg mb-4">
                  <p className="text-yellow-800 mb-3">Enable enhanced features and personalization.</p>
                  <table className="min-w-full bg-white border border-yellow-200">
                    <thead>
                      <tr className="bg-yellow-100">
                        <th className="px-4 py-2 text-left text-yellow-900">Cookie Name</th>
                        <th className="px-4 py-2 text-left text-yellow-900">Purpose</th>
                        <th className="px-4 py-2 text-left text-yellow-900">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-yellow-200">
                        <td className="px-4 py-2">dynasty_theme</td>
                        <td className="px-4 py-2">Remembers your theme preference</td>
                        <td className="px-4 py-2">1 year</td>
                      </tr>
                      <tr className="border-t border-yellow-200">
                        <td className="px-4 py-2">dynasty_lang</td>
                        <td className="px-4 py-2">Stores language preference</td>
                        <td className="px-4 py-2">1 year</td>
                      </tr>
                      <tr className="border-t border-yellow-200">
                        <td className="px-4 py-2">dynasty_timezone</td>
                        <td className="px-4 py-2">Your timezone for event scheduling</td>
                        <td className="px-4 py-2">1 year</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-xl font-medium text-gray-900 mb-3">3.3 Third-Party Service Cookies</h3>
                <div className="bg-red-50 p-6 rounded-lg">
                  <p className="text-red-800 mb-3">Used by integrated services to provide specific features.</p>
                  <table className="min-w-full bg-white border border-red-200">
                    <thead>
                      <tr className="bg-red-100">
                        <th className="px-4 py-2 text-left text-red-900">Service</th>
                        <th className="px-4 py-2 text-left text-red-900">Purpose</th>
                        <th className="px-4 py-2 text-left text-red-900">Privacy Policy</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-red-200">
                        <td className="px-4 py-2">Google Maps</td>
                        <td className="px-4 py-2">Location services for events</td>
                        <td className="px-4 py-2">
                          <a href="https://policies.google.com/privacy" className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                            Google Privacy
                          </a>
                        </td>
                      </tr>
                      <tr className="border-t border-red-200">
                        <td className="px-4 py-2">Sentry</td>
                        <td className="px-4 py-2">Error tracking and monitoring</td>
                        <td className="px-4 py-2">
                          <a href="https://sentry.io/privacy/" className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                            Sentry Privacy
                          </a>
                        </td>
                      </tr>
                      <tr className="border-t border-red-200">
                        <td className="px-4 py-2">Stripe</td>
                        <td className="px-4 py-2">Payment processing (Premium users)</td>
                        <td className="px-4 py-2">
                          <a href="https://stripe.com/privacy" className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                            Stripe Privacy
                          </a>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. YOUR COOKIE CHOICES</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">4.1 Cookie Consent Management</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  When you first visit Dynasty, you&apos;ll see our cookie consent banner. You can:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li>Accept all cookies</li>
                  <li>Reject non-essential cookies</li>
                  <li>Customize your preferences by category</li>
                  <li>Change your preferences at any time through the cookie settings in your account</li>
                </ul>

                <div className="bg-indigo-50 border-l-4 border-indigo-400 p-6 rounded mb-4">
                  <h4 className="font-semibold text-indigo-900 mb-2">Managing Your Preferences:</h4>
                  <p className="text-indigo-800 mb-2">
                    To update your cookie preferences:
                  </p>
                  <ol className="list-decimal pl-6 text-indigo-800 space-y-1">
                    <li>Click the cookie settings icon in the footer</li>
                    <li>Go to Account Settings → Privacy → Cookie Preferences</li>
                    <li>Use our cookie consent banner (shown every 12 months)</li>
                  </ol>
                </div>

                <h3 className="text-xl font-medium text-gray-900 mb-3">4.2 Browser Controls</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Most browsers allow you to control cookies through their settings:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
                  <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
                  <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
                  <li><strong>Edge:</strong> Settings → Privacy, search, and services → Cookies and site permissions</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. CALIFORNIA PRIVACY RIGHTS (CCPA/CPRA)</h2>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">For California Residents:</h4>
                  <p className="text-gray-700 mb-3">
                    Under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA), you have additional rights:
                  </p>
                  <ul className="list-disc pl-6 text-gray-700 space-y-2">
                    <li><strong>Right to Opt-Out:</strong> Opt-out of the &quot;sale&quot; or &quot;sharing&quot; of personal information collected via cookies</li>
                    <li><strong>Right to Know:</strong> Request information about cookies collecting your data</li>
                    <li><strong>Right to Delete:</strong> Request deletion of data collected through cookies</li>
                    <li><strong>Right to Non-Discrimination:</strong> Exercise your rights without facing discrimination</li>
                  </ul>
                  <p className="text-gray-700 mt-3">
                    <strong>To opt-out:</strong> Click &quot;Do Not Sell or Share My Personal Information&quot; in the footer or email us at privacy@mydynastyapp.com
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. COOKIES AND CHILDREN</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty requires users to be at least 13 years old. For users under 16:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>We require opt-in consent from a parent or guardian for non-essential cookies</li>
                  <li>Analytics and marketing cookies are disabled by default</li>
                  <li>Only essential cookies necessary for the service are active</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. UPDATES TO THIS POLICY</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We may update this Cookie Policy to reflect changes in our practices or legal requirements. We will notify you of material changes by:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Posting a notice on our platform</li>
                  <li>Sending an email to registered users</li>
                  <li>Requiring renewed consent for significant changes</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. CONTACT US</h2>
                <p className="text-gray-700 leading-relaxed">
                  If you have questions about our use of cookies or this Cookie Policy:
                </p>
                <div className="bg-gray-50 p-6 rounded-lg mt-4">
                  <p className="text-gray-700">
                    <strong>Dynasty Platforms</strong><br />
                    Email: privacy@mydynastyapp.com<br />
                    Phone: +1 (866) 314-1530<br />
                    Address: 7901 4th St N STE 300, St. Petersburg, FL 33702<br />
                    <br />
                    <strong>Data Protection Officer:</strong><br />
                    Email: dpo@mydynastyapp.com
                  </p>
                </div>
              </section>

              <div className="border-t pt-8 mt-12">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <p className="text-center text-green-800 font-medium">
                    Your privacy is fundamental to Dynasty&apos;s mission. We use cookies responsibly to provide a secure, personalized experience for your family while giving you full control over your data.
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