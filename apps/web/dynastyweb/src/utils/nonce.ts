import { headers } from 'next/headers';

/**
 * Get the CSP nonce from request headers
 * This is set by the middleware for each request
 * Only available in Server Components
 */
export function getNonce() {
  return headers().get('x-nonce');
}