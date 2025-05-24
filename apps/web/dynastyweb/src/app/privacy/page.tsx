import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Dynasty',
  description: 'Dynasty Privacy Policy - How we protect and handle your family data with enterprise-grade security.',
  robots: 'index, follow',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="px-8 py-12">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
              <p className="text-lg text-gray-600">
                <strong>Effective Date:</strong> [Insert Date]<br />
                <strong>Last Updated:</strong> [Insert Date]
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. INTRODUCTION</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Welcome to Dynasty, the family social media platform operated by [Company Name] (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use our mobile application and web services (collectively, the &quot;Service&quot;).
                </p>
                <div className="bg-green-50 border-l-4 border-green-400 p-6 rounded">
                  <p className="text-green-800 font-medium">
                    <strong>Your privacy is our highest priority.</strong> Dynasty is built with privacy-by-design principles, implementing end-to-end encryption and advanced security measures to protect your family&apos;s most precious memories and communications.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. INFORMATION WE COLLECT</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">2.1 Information You Provide Directly</h3>
                
                <h4 className="text-lg font-medium text-gray-800 mb-2">Account Information:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1 mb-4">
                  <li>Name, email address, phone number</li>
                  <li>Profile pictures and biographical information</li>
                  <li>Authentication credentials (encrypted passwords)</li>
                  <li>Family tree relationship data</li>
                  <li>Account preferences and settings</li>
                </ul>

                <h4 className="text-lg font-medium text-gray-800 mb-2">Content You Create:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1 mb-4">
                  <li>Stories (text, titles, subtitles, dates, locations)</li>
                  <li>Photos, videos, audio recordings, and documents</li>
                  <li>Event information (titles, dates, descriptions, guest lists, itineraries)</li>
                  <li>Messages and communications</li>
                  <li>Comments, reactions, and interactions</li>
                  <li>Vault-stored files and organizational data</li>
                </ul>

                <h4 className="text-lg font-medium text-gray-800 mb-2">Contact Information:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1">
                  <li>Email addresses and phone numbers of family members you invite</li>
                  <li>Contact list access (with your explicit permission)</li>
                  <li>Family relationship definitions and connections</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. END-TO-END ENCRYPTION AND SECURITY</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">3.1 Message Encryption</h3>
                <div className="bg-blue-50 p-6 rounded-lg mb-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Encryption Protocol:</h4>
                  <ul className="list-disc pl-6 text-blue-800 space-y-1">
                    <li>Messages are encrypted using AES-256-GCM encryption</li>
                    <li>Key exchange utilizes ECDH (Elliptic Curve Diffie-Hellman)</li>
                    <li>Forward secrecy ensures past messages remain secure</li>
                    <li>Authentication tags prevent message tampering</li>
                  </ul>
                </div>

                <h4 className="text-lg font-medium text-gray-800 mb-2">Key Management:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1">
                  <li>Encryption keys are generated and stored locally on your device</li>
                  <li>Private keys are secured using device-specific hardware security</li>
                  <li><strong>We cannot decrypt or access your message content</strong></li>
                  <li>Key rotation occurs automatically for enhanced security</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. HOW WE USE YOUR INFORMATION</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">4.1 Primary Service Functions</h3>
                <h4 className="text-lg font-medium text-gray-800 mb-2">Core Platform Operations:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1 mb-4">
                  <li>Creating and maintaining your account and profile</li>
                  <li>Facilitating family tree connections and invitations</li>
                  <li>Enabling story creation, sharing, and preservation</li>
                  <li>Managing events, RSVPs, and calendar integration</li>
                  <li>Providing secure vault storage and file organization</li>
                  <li>Delivering end-to-end encrypted messaging services</li>
                </ul>

                <h4 className="text-lg font-medium text-gray-800 mb-2">Communication and Notifications:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1">
                  <li>Sending account-related updates and security alerts</li>
                  <li>Delivering push notifications for new content and messages</li>
                  <li>Facilitating family member invitations and connection requests</li>
                  <li>Providing customer support and technical assistance</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. YOUR PRIVACY RIGHTS AND CONTROLS</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">5.1 Access and Correction Rights</h3>
                <div className="bg-purple-50 p-6 rounded-lg mb-4">
                  <h4 className="font-semibold text-purple-900 mb-2">Data Access:</h4>
                  <ul className="list-disc pl-6 text-purple-800 space-y-1">
                    <li>View all personal information we maintain about you</li>
                    <li>Download copies of your content and account data</li>
                    <li>Review privacy settings and sharing configurations</li>
                    <li>Access logs of data processing activities</li>
                  </ul>
                </div>

                <h4 className="text-lg font-medium text-gray-800 mb-2">Data Correction:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1">
                  <li>Update profile information and account details</li>
                  <li>Correct family tree relationships and member information</li>
                  <li>Modify privacy settings and sharing preferences</li>
                  <li>Report and correct inaccurate information</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. DATA RETENTION AND DELETION</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We retain your data only as long as necessary to provide our services and comply with legal obligations.
                </p>

                <h3 className="text-xl font-medium text-gray-900 mb-3">6.1 Active Account Data</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li><strong>Stories, events, and vault files:</strong> Retained while your account is active</li>
                  <li><strong>Messages:</strong> Retained according to your subscription tier (30 days to unlimited)</li>
                  <li><strong>Family tree data:</strong> Maintained for family network integrity</li>
                  <li><strong>Analytics data:</strong> Aggregated and anonymized after 24 months</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900 mb-3">6.2 Account Deletion</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Account deletion removes personal identifiers and private content</li>
                  <li>Shared family content may be preserved for other family members</li>
                  <li>Complete deletion occurs within 30 days of request</li>
                  <li>Data recovery available for 90 days after deletion request</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. CONTACT INFORMATION AND PRIVACY REQUESTS</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">7.1 Privacy Officer Contact</h3>
                <div className="bg-gray-50 p-6 rounded-lg mb-4">
                  <h4 className="font-semibold text-gray-900 mb-2">General Inquiries:</h4>
                  <p className="text-gray-700">
                    Email: privacy@[company].com<br />
                    Phone: [Privacy Phone Number]<br />
                    Address: [Privacy Officer Address]
                  </p>
                </div>

                <h3 className="text-xl font-medium text-gray-900 mb-3">7.2 Exercise Your Rights</h3>
                <h4 className="text-lg font-medium text-gray-800 mb-2">Request Process:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1 mb-4">
                  <li>Submit requests through our privacy portal: [URL]</li>
                  <li>Email requests to privacy@[company].com</li>
                  <li>In-app privacy request submission</li>
                  <li>Phone support for complex requests</li>
                </ul>

                <h4 className="text-lg font-medium text-gray-800 mb-2">Response Timeline:</h4>
                <ul className="list-disc pl-6 text-gray-700 space-y-1">
                  <li>Acknowledgment within 72 hours</li>
                  <li>Response within 30 days (may be extended to 60 days for complex requests)</li>
                  <li>Free of charge for reasonable requests</li>
                  <li>Identity verification required for data access requests</li>
                </ul>
              </section>

              <div className="border-t pt-8 mt-12">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <p className="text-center text-green-800 font-medium">
                    This Privacy Policy is designed to be transparent about our data practices while ensuring the highest level of protection for your family&apos;s privacy and security. If you have any questions or concerns, please don&apos;t hesitate to contact us.
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