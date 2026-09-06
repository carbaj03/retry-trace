import { ORIGIN } from '@/lib/experiment';
export default function sitemap() {
  return ['', '/protocol', '/method', '/findings'].map((path) => ({
    url: ORIGIN + path,
  }));
}
