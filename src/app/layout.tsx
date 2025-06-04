import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// import { AuthProvider } from "@/context/AuthContext"; // Removed
import Navbar from "@/components/Navbar";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Speaking9 - Practice IELTS Speaking",
  description: "Practice IELTS Speaking with AI feedback in seconds",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.variable} antialiased font-sans`}
          style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}
        >
          <ThemeProvider>
            <Navbar />
            <main>{children}</main>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
