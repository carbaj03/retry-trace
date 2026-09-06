import { ORIGIN } from '@/lib/experiment';
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/protocol', '/method', '/findings', '/.well-known/'],
      disallow: ['/probe/', '/api/trace/'],
    },
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
