import type { Metadata } from 'next';
import { Cormorant_Garamond, Source_Sans_3 } from 'next/font/google';
import { Providers } from '../components/providers';
import { AppShellWrapper } from '../components/layout/AppShellWrapper';
import './globals.css';

const sans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Fernleaf Kitchen', template: '%s · Fernleaf Kitchen' },
  description: 'Kitchen operations admin for Fernleaf Kitchen',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full`}>
      <body className="min-h-full">
        <Providers>
          <AppShellWrapper>{children}</AppShellWrapper>
        </Providers>
      </body>
    </html>
  );
}
