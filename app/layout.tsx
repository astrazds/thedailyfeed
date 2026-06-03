import type { Metadata } from "next";
import { Roboto_Serif } from "next/font/google";
import "./globals.css";

const robotoSerif = Roboto_Serif({
  variable: "--font-roboto-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: 'swap', // Improve font loading performance
});

export const metadata: Metadata = {
  title: "The Daily Feed - Today's RSS Items",
  description: "A minimalist RSS reader that displays only today's feed items. Clean, focused, distraction-free reading.",
  keywords: ["RSS", "feed reader", "news", "minimalist", "daily feed", "RSS aggregator"],
  authors: [{ name: "The Daily Feed" }],
  creator: "The Daily Feed",
  publisher: "The Daily Feed",
  robots: "index, follow",
  openGraph: {
    title: "The Daily Feed",
    description: "Today's feed items from around the web",
    type: "website",
    locale: "en_US",
    siteName: "The Daily Feed",
  },
  twitter: {
    card: "summary",
    title: "The Daily Feed",
    description: "Today's feed items from around the web",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Daily Feed",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/thedailyfeed-light-192.png",
    shortcut: "/thedailyfeed-light-192.png",
    apple: "/thedailyfeed-light-192.png",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow zoom for accessibility
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1816" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${robotoSerif.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
