import { headers } from 'next/headers';

/**
 * Get the CSP nonce from request headers
 * This is set by the middleware for each request
 * Only available in Server Components
 */
export async function getNonce() {
  const headersList = await headers();
  return headersList.get('x-nonce');
}