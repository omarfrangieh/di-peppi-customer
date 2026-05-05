import type { Metadata, Viewport } from "next";
import { Geist_Mono, Lora } from "next/font/google";
import localFont from "next/font/local";
import AuthWrapper from "@/components/AuthWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";
import ToastContainer from "@/app/components/ToastContainer";
import "./globals.css";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const objectivity = localFont({
  src: [
    { path: "../public/fonts/Objectivity-Regular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/Objectivity-Medium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/Objectivity-Black.otf", weight: "900", style: "normal" },
    { path: "../public/fonts/Objectivity-ThinSlanted.otf", weight: "200", style: "italic" },
  ],
  variable: "--font-objectivity",
});

const avango = localFont({
  src: "../public/fonts/Avango Display Serif Bold.ttf",
  variable: "--font-avango",
  weight: "700",
});

const belgietta = localFont({
  src: "../public/fonts/Belgietta.ttf",
  variable: "--font-belgietta",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Di Peppi",
  description: "Di Peppi Management App",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistMono.variable} ${lora.variable} ${objectivity.variable} ${avango.variable} ${belgietta.variable} antialiased`}>
      <body className="min-h-screen">
        {/* Prevent flash of unstyled content – runs before React hydration */}
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
