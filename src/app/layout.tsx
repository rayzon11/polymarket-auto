import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PolyBot AI | Autonomous Trading',
  description: 'AI-powered Polymarket prediction market trading system with 5 autonomous agents',
  icons: { icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-0 text-slate-100 antialiased">
        <div className="fixed inset-0 bg-grid pointer-events-none" />
        <div className="fixed inset-0 bg-radial-top pointer-events-none" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
