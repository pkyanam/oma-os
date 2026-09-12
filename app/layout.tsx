import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const inter=localFont({src:'../public/fonts/InterVariable.woff2',variable:'--font-inter',display:'swap'});
const mono=localFont({src:'../public/fonts/JetBrainsMono-Regular.woff2',variable:'--font-jetbrains',display:'swap'});
export const metadata: Metadata = { title: 'oma.os', description: 'A browser desktop with Omarchy’s habits.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
 return <html lang="en" data-theme="tokyo-night" className={`${inter.variable} ${mono.variable}`}><body>{children}</body></html>;
}
