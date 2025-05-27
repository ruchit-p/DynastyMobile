export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Dynasty Legal Pages Test</h1>
        
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-2xl font-semibold mb-4">Legal Pages Status</h2>
          <ul className="space-y-2">
            <li>✅ Cookie Policy: <a href="/cookie-policy" className="text-blue-600 hover:underline">/cookie-policy</a></li>
            <li>✅ DMCA Policy: <a href="/dmca" className="text-blue-600 hover:underline">/dmca</a></li>
            <li>✅ Do Not Sell: <a href="/do-not-sell" className="text-blue-600 hover:underline">/do-not-sell</a></li>
            <li>✅ Privacy Policy: <a href="/privacy" className="text-blue-600 hover:underline">/privacy</a></li>
            <li>✅ Terms of Service: <a href="/terms" className="text-blue-600 hover:underline">/terms</a></li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-2xl font-semibold mb-4">Cookie Consent Test</h2>
          <button 
            onClick={() => {
              localStorage.removeItem('dynasty_cookie_consent');
              window.location.reload();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Clear Cookie Consent & Reload
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-semibold mb-4">Environment Check</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-sm">
{JSON.stringify({
  nodeEnv: process.env.NODE_ENV,
  hasLocalStorage: typeof window !== 'undefined' && !!window.localStorage,
  cookieConsent: typeof window !== 'undefined' ? localStorage.getItem('dynasty_cookie_consent') : 'N/A',
}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}