import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Moneta",
  description: "Personal finance dashboard",
  // Lets you "Add to Home Screen" on iPhone and open it like an app
  appleWebApp: { capable: true, title: "Moneta", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // Draw under the iPhone notch/home bar; the page pads itself with safe-area insets
  viewportFit: "cover",
};

// Apply the saved text size before first paint so the page doesn't jump
const TEXT_SIZE_SCRIPT = `try{var s=Number(localStorage.getItem('ws_text_size'));if(s>=12&&s<=19)document.documentElement.style.fontSize=s+'px'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The script below sets the saved text size on <html> before React hydrates
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
