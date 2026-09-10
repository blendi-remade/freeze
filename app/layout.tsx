import type { Metadata } from 'next';
import { Geist, Geist_Mono, Barlow_Condensed } from 'next/font/google';
import './globals.css';

const display = Barlow_Condensed({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Freeze — Life moves. You don’t have to.',
  description:
    'Pick a moment in your video. Move the camera around it. Then let life carry on. A bullet-time editor powered by H3 Max on fal.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${display.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
