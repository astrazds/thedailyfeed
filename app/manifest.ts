import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Daily Feed',
    short_name: 'Daily Feed',
    description: 'A minimalist RSS reader for today\'s feed items',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf8f5',
    theme_color: '#c17767',
    orientation: 'portrait-primary',
    categories: ['news', 'productivity', 'lifestyle'],
    icons: [
      {
        src: '/thedailyfeed-light-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/thedailyfeed-light-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/thedailyfeed-light-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/thedailyfeed-light-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
