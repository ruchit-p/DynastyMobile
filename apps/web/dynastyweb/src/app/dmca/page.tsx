import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DMCA Policy | Dynasty',
  description: 'Dynasty DMCA Policy - Copyright infringement notification and counter-notification procedures for user-generated content.',
  robots: 'index, follow',
};

export default function DMCAPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="px-8 py-12">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">DMCA Policy</h1>
              <p className="text-lg text-gray-600">
                <strong>Digital Millennium Copyright Act Compliance</strong><br />
                <strong>Effective Date:</strong> May 27, 2025<br />
                <strong>Last Updated:</strong> May 27, 2025
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. COMMITMENT TO COPYRIGHT PROTECTION</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty Platforms (&quot;Dynasty,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects the intellectual property rights of others and expects our users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 (&quot;DMCA&quot;), we will respond promptly to claims of copyright infringement committed using our service.
                </p>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded">
                  <p className="text-blue-800 font-medium">
                    <strong>Important:</strong> Dynasty is a platform for sharing family memories and content. We take copyright seriously while supporting fair use for personal, family archival purposes.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. DESIGNATED DMCA AGENT</h2>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-xl font-medium text-gray-900 mb-3">Copyright Agent Contact Information:</h3>
                  <p className="text-gray-700">
                    <strong>Dynasty Platforms DMCA Agent</strong><br />
                    Attn: Legal Department - DMCA<br />
                    7901 4th St N STE 300<br />
                    St. Petersburg, FL 33702<br />
                    <br />
                    <strong>Email:</strong> dmca@mydynastyapp.com<br />
                    <strong>Phone:</strong> +1 (866) 314-1530<br />
                    <strong>Fax:</strong> +1 (866) 314-1531
                  </p>
                </div>
                <p className="text-gray-700 mt-4">
                  <strong>Note:</strong> This contact information is solely for copyright infringement notices. General support inquiries sent to this address will not receive a response.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. FILING A DMCA TAKEDOWN NOTICE</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  If you believe that content on Dynasty infringes your copyright, please provide our DMCA Agent with a written notice containing the following information:
                </p>
                
                <div className="bg-yellow-50 p-6 rounded-lg mb-4">
                  <h3 className="text-lg font-semibold text-yellow-900 mb-3">Required Information for Valid DMCA Notice:</h3>
                  <ol className="list-decimal pl-6 text-yellow-800 space-y-2">
                    <li>
                      <strong>Identification of the copyrighted work</strong> claimed to have been infringed, or if multiple works, a representative list
                    </li>
                    <li>
                      <strong>Identification of the infringing material</strong> to be removed, including:
                      <ul className="list-disc pl-6 mt-1">
                        <li>Direct URL(s) to the content</li>
                        <li>Story ID or Event ID if applicable</li>
                        <li>Screenshots showing the location</li>
                      </ul>
                    </li>
                    <li>
                      <strong>Your contact information:</strong>
                      <ul className="list-disc pl-6 mt-1">
                        <li>Full legal name</li>
                        <li>Address</li>
                        <li>Telephone number</li>
                        <li>Email address</li>
                      </ul>
                    </li>
                    <li>
                      <strong>A statement</strong> that you have a good faith belief that use of the material is not authorized by the copyright owner, its agent, or the law
                    </li>
                    <li>
                      <strong>A statement</strong> that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the copyright owner
                    </li>
                    <li>
                      <strong>Your physical or electronic signature</strong>
                    </li>
                  </ol>
                </div>

                <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded mt-4">
                  <h4 className="font-semibold text-red-900 mb-2">Warning - False Claims:</h4>
                  <p className="text-red-800">
                    Under Section 512(f) of the DMCA, any person who knowingly materially misrepresents that material is infringing may be subject to liability for damages. Do not make false claims!
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. DMCA TAKEDOWN PROCEDURE</h2>
                <h3 className="text-xl font-medium text-gray-900 mb-3">Upon Receipt of Valid Notice:</h3>
                <ol className="list-decimal pl-6 text-gray-700 space-y-2 mb-4">
                  <li><strong>Review:</strong> We will review your DMCA notice for completeness and validity</li>
                  <li><strong>Removal:</strong> If valid, we will expeditiously remove or disable access to the allegedly infringing content</li>
                  <li><strong>Notification:</strong> We will notify the user who posted the content of the takedown</li>
                  <li><strong>Record:</strong> We maintain records of all DMCA notices and actions taken</li>
                </ol>

                <div className="bg-green-50 p-6 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2">Response Timeline:</h4>
                  <ul className="list-disc pl-6 text-green-800 space-y-1">
                    <li>Acknowledgment: Within 1 business day</li>
                    <li>Action on valid notice: Within 2-3 business days</li>
                    <li>Complex cases: May take up to 7 business days</li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. COUNTER-NOTIFICATION PROCEDURE</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  If you believe your content was wrongfully removed due to a mistake or misidentification, you may file a counter-notification with our DMCA Agent.
                </p>

                <div className="bg-purple-50 p-6 rounded-lg mb-4">
                  <h3 className="text-lg font-semibold text-purple-900 mb-3">Counter-Notice Requirements:</h3>
                  <ol className="list-decimal pl-6 text-purple-800 space-y-2">
                    <li>
                      <strong>Identification</strong> of the material that was removed and its location before removal
                    </li>
                    <li>
                      <strong>A statement under penalty of perjury</strong> that you have a good faith belief the material was removed by mistake or misidentification
                    </li>
                    <li>
                      <strong>Your consent</strong> to the jurisdiction of:
                      <ul className="list-disc pl-6 mt-1">
                        <li>Federal District Court for your judicial district (if in the US)</li>
                        <li>Federal District Court for the Middle District of Florida (if outside the US)</li>
                      </ul>
                    </li>
                    <li>
                      <strong>Agreement</strong> to accept service of process from the party who filed the original DMCA notice
                    </li>
                    <li>
                      <strong>Your contact information</strong> (name, address, phone, email)</li>
                    <li>
                      <strong>Your physical or electronic signature</strong>
                    </li>
                  </ol>
                </div>

                <h3 className="text-xl font-medium text-gray-900 mb-3 mt-6">Counter-Notice Process:</h3>
                <ol className="list-decimal pl-6 text-gray-700 space-y-2">
                  <li>We forward your counter-notice to the original complainant</li>
                  <li>The complainant has 10 business days to file a court action</li>
                  <li>If no court action is filed, we may restore the content within 10-14 business days</li>
                  <li>If court action is filed, the content remains removed pending resolution</li>
                </ol>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. REPEAT INFRINGER POLICY</h2>
                <div className="bg-orange-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-orange-900 mb-3">Three-Strike Policy:</h3>
                  <p className="text-orange-800 mb-3">
                    Dynasty maintains a policy for terminating users who are repeat infringers:
                  </p>
                  <ul className="list-disc pl-6 text-orange-800 space-y-2">
                    <li><strong>First Violation:</strong> Content removal and warning notification</li>
                    <li><strong>Second Violation:</strong> Content removal, final warning, and temporary account restrictions</li>
                    <li><strong>Third Violation:</strong> Permanent account termination and ban from the platform</li>
                  </ul>
                  <p className="text-orange-800 mt-3">
                    <strong>Note:</strong> Severe violations may result in immediate termination without prior warnings.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. FAIR USE AND FAMILY CONTENT</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty recognizes that families often share content that may include copyrighted material for personal, non-commercial purposes. We support fair use, which may include:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li>Personal family photos at public venues</li>
                  <li>Home videos with incidental background music</li>
                  <li>Educational or documentary family content</li>
                  <li>Commentary or criticism for family discussions</li>
                </ul>
                <p className="text-gray-700">
                  However, fair use is determined on a case-by-case basis. When in doubt, seek permission from the copyright owner.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. MODIFICATIONS TO THIS POLICY</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty reserves the right to modify this DMCA Policy at any time. Changes will be effective immediately upon posting. We encourage you to review this policy periodically.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. ADDITIONAL INFORMATION</h2>
                
                <h3 className="text-xl font-medium text-gray-900 mb-3">Copyright Resources:</h3>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                  <li>
                    <a href="https://www.copyright.gov/" className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                      U.S. Copyright Office
                    </a>
                  </li>
                  <li>
                    <a href="https://www.copyright.gov/dmca/" className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                      DMCA Information from U.S. Copyright Office
                    </a>
                  </li>
                  <li>
                    <a href="https://fairuse.stanford.edu/" className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                      Stanford Fair Use Resources
                    </a>
                  </li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900 mb-3">Questions?</h3>
                <p className="text-gray-700">
                  For general questions about this policy (not for filing notices), contact us at:
                  <br />
                  Email: legal@mydynastyapp.com
                </p>
              </section>

              <div className="border-t pt-8 mt-12">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <p className="text-center text-gray-700 font-medium">
                    Dynasty is committed to protecting intellectual property rights while preserving families&apos; ability to share their memories and stories. We appreciate your cooperation in maintaining a respectful and lawful platform.
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