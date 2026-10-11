import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DriveLux | Premium Cars for Every Journey',
  description: 'Modern luxury and performance car marketplace.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
