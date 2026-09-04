import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'Taprats — Pattern & Tiling Editor',
  description:
    'Create geometric patterns and custom tilings with the complete Taprats 1.1.12 editor in your browser.',
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
