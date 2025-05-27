import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us | Dynasty',
  description: 'Learn about Dynasty - the family social media platform dedicated to preserving and sharing your family stories across generations.',
  robots: 'index, follow',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="px-8 py-12">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">About Dynasty</h1>
              <p className="text-lg text-gray-600">
                Building Bridges Across Generations
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Our Story</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Dynasty was born from a simple realization: in our fast-paced digital world, family stories and memories are often scattered across different platforms, devices, and even physical locations. We believed there had to be a better way.
                </p>
                <p className="text-gray-700 leading-relaxed">
                  Founded in 2023, Dynasty is more than just another social media platform. It&apos;s a dedicated space where families can come together to preserve their heritage, share their stories, and strengthen the bonds that connect generations.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Our Mission</h2>
                <div className="bg-green-50 border-l-4 border-green-400 p-6 rounded">
                  <p className="text-green-800 font-medium">
                    To create a secure, private platform where families can preserve their stories, celebrate their heritage, and build stronger connections across generations.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">What Makes Dynasty Different</h2>
                
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 font-bold">1</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Family-First Design</h3>
                      <p className="text-gray-700">
                        Every feature is built with families in mind. From our intuitive family tree builder to our secure vault for precious memories, we focus on what matters most to families.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 font-bold">2</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Privacy by Design</h3>
                      <p className="text-gray-700">
                        We believe your family&apos;s stories belong to you. That&apos;s why we&apos;ve built Dynasty with end-to-end encryption and never sell your data to advertisers.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 font-bold">3</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Built to Last</h3>
                      <p className="text-gray-700">
                        Your family&apos;s legacy deserves a platform that will stand the test of time. We&apos;re committed to preserving your stories for future generations.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Our Values</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h3 className="font-semibold text-gray-900 mb-2">🛡️ Security First</h3>
                    <p className="text-gray-700">
                      Your family&apos;s privacy and security are our top priorities. We use enterprise-grade encryption to protect your memories.
                    </p>
                  </div>

                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h3 className="font-semibold text-gray-900 mb-2">👨‍👩‍👧‍👦 Family-Centered</h3>
                    <p className="text-gray-700">
                      Every decision we make is guided by what&apos;s best for families and their unique needs.
                    </p>
                  </div>

                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h3 className="font-semibold text-gray-900 mb-2">🌱 Sustainable Growth</h3>
                    <p className="text-gray-700">
                      We&apos;re building Dynasty to be around for generations, not just the next quarterly report.
                    </p>
                  </div>

                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h3 className="font-semibold text-gray-900 mb-2">🤝 Trust & Transparency</h3>
                    <p className="text-gray-700">
                      We believe in being open about how we operate and how we protect your family&apos;s data.
                    </p>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Join Our Journey</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We&apos;re more than a company – we&apos;re a community of families committed to preserving our stories and strengthening our connections. Whether you&apos;re documenting your grandparents&apos; immigration story, organizing family reunions, or simply sharing photos from Sunday dinner, Dynasty is here to help.
                </p>
                <div className="text-center">
                  <a
                    href="/signup"
                    className="inline-block px-8 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Start Your Family&apos;s Journey
                  </a>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Contact Us</h2>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <p className="text-gray-700 mb-4">
                    Have questions or want to learn more about Dynasty? We&apos;d love to hear from you.
                  </p>
                  <p className="text-gray-700">
                    <strong>Email:</strong> support@mydynastyapp.com<br />
                    <strong>Phone:</strong> +1 (866) 314-1530<br />
                    <strong>Address:</strong> 7901 4th St N STE 300, St. Petersburg, FL 33702
                  </p>
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}