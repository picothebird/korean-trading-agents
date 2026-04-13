import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한국 주식 AI 트레이딩 에이전트",
  description: "AI-powered Korean stock market analysis and trading decisions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="ko" enables correct CJK rendering and hyphenation
    // dark class forces dark mode; suppressHydrationWarning avoids SSR mismatch
    <html lang="ko" className="h-full dark" suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {children}
      </body>
    </html>
  );
}
