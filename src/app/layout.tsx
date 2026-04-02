import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Broc Shot - Email Marketing Dashboard",
  description: "Klaviyo email and SMS marketing analytics for Broc Shot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-cream text-charcoal" style={{ fontFamily: 'var(--font-body)' }}>
        <Suspense>
          <Navigation />
        </Suspense>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="text-charcoal-light text-sm">Loading...</div>
            </div>
          }>
            {children}
          </Suspense>
        </main>
      </body>
    </html>
  );
}
