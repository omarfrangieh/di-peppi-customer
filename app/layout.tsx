import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import AuthWrapper from "@/components/AuthWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";
import ToastContainer from "@/app/components/ToastContainer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Di Peppi",
  description: "Di Peppi Management App",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased`}>
      <body className="min-h-screen">
        {/* Prevent flash of unstyled content — runs before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('dp-dark')==='1')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <ThemeProvider>
          <AuthWrapper>
            {children}
          </AuthWrapper>
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
