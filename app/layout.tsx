import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'oma.os', description: 'A browser desktop with Omarchy’s habits.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-theme="tokyo-night"><body>{children}</body></html>;
}
