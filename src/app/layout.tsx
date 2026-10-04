import type { Metadata, Viewport } from "next";
import { Caveat, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caveat",
  weight: ["500", "600", "700"],
});

const APP_URL = process.env.APP_URL ?? "https://ravelyth.in";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Ravelyth Talent | Connecting Great People with Great Opportunities",
    template: "%s | Ravelyth Talent",
  },
  description:
    "Ravelyth Talent is an Indian job portal connecting great people with great opportunities. Find jobs, hire talent and build careers.",
  applicationName: "Ravelyth Talent",
  keywords: [
    "jobs in India",
    "job search",
    "hiring",
    "recruitment",
    "Ravelyth Talent",
    "careers",
  ],
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: ["/logo.svg"],
    apple: ["/logo.svg"],
  },
  openGraph: {
    type: "website",
    siteName: "Ravelyth Talent",
    title: "Ravelyth Talent | Connecting Great People with Great Opportunities",
    description:
      "Right People | Better Opportunities | Stronger Tomorrow. Find jobs, hire talent and build careers on Ravelyth Talent.",
    url: APP_URL,
    images: ["/logo.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ravelyth Talent",
    description: "Connecting Great People with Great Opportunities",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B2A6F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${jakarta.variable} ${caveat.variable}`}>
      <body className="min-h-screen bg-offwhite antialiased">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
