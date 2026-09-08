import type { Metadata } from 'next';
import { sitePath } from '@/lib/site-path';
import './globals.css';
export const dynamic = 'force-static';
export const metadata: Metadata = {
  icons: { icon: sitePath('/favicon.svg') },
  title: 'Topkapi — Geometric Pattern Workshop',
  description:
    'A native web workshop for geometric patterns, tilings, and interlaced ornament.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
