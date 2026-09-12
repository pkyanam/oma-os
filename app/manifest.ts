import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'oma.os — your browser desktop', short_name: 'oma.os',
    description: 'A local-first desktop for thinking, building and working with an agent.',
    start_url: '/', scope: '/', display: 'standalone',
    background_color: '#1a1b26', theme_color: '#1a1b26',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    shortcuts: [
      { name: 'Applications', url: '/?app=apps' },
      { name: 'Notes', url: '/?app=notes' },
      { name: 'Agent', url: '/?app=agent' },
    ],
  };
}
