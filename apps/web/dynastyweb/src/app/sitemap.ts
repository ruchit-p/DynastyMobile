import { MetadataRoute } from 'next';

const BASE_URL = 'https://www.mydynastyapp.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date();

  // Static Pages
  const staticRoutes = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
  ];

  const staticPageEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: currentDate,
  }));

  return [
    ...staticPageEntries,
  ];
} 