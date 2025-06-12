import { Suspense } from 'react';
import { notFound } from 'next/navigation';

interface EmailPreferencesPageProps {
  searchParams: { token?: string };
}

export default function EmailPreferencesPage({ searchParams }: EmailPreferencesPageProps) {
  const { token } = searchParams;

  if (!token) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-md mx-auto">
        <Suspense fallback={<div>Loading preferences...</div>}>
          <EmailPreferencesClient token={token} />
        </Suspense>
      </div>
    </div>
  );
}

// Client component to handle the preference management
function EmailPreferencesClient({ token }: { token: string }) {
  // This would integrate with your existing preference management
  // and call your Firebase function endpoints

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h1 className="text-2xl font-bold text-dynastyGreen mb-6">Email Preferences</h1>
      {/* Add your existing preference management UI here */}
      <p className="text-gray-600">Redirecting to secure preference center...</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Redirect to Firebase function with token
            window.location.href = '/handleUnsubscribe?token=${token}';
          `,
        }}
      />
    </div>
  );
}
