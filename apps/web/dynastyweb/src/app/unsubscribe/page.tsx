import { Suspense } from 'react';
import { notFound } from 'next/navigation';

interface UnsubscribePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const { token } = await searchParams;

  if (!token) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-md mx-auto">
        <Suspense fallback={<div>Processing unsubscribe...</div>}>
          <UnsubscribeClient token={token} />
        </Suspense>
      </div>
    </div>
  );
}

// Client component to handle the unsubscribe process
function UnsubscribeClient({ token }: { token: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h1 className="text-2xl font-bold text-dynastyGreen mb-6">Unsubscribe</h1>
      <p className="text-gray-600 mb-4">Processing your unsubscribe request...</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Redirect to Firebase function with token for processing
            window.location.href = '/handleUnsubscribe?token=${token}';
          `,
        }}
      />
    </div>
  );
}
