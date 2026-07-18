import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import VoiceCapture from "@/components/VoiceCapture";

export const metadata: Metadata = {
  title: "Pingly",
  description: "Remember people, plan your week, capture contacts by voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <NavBar />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <VoiceCapture />
      </body>
    </html>
  );
}
