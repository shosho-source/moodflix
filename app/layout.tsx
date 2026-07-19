import type { Metadata } from "next";
import "material-symbols/outlined.css";
import "./globals.css";
import MaterialRegistry from "@/components/MaterialRegistry";

export const metadata: Metadata = {
  title: "MoodFlix — A movie, picked for you",
  description:
    "Answer a few quick questions and get one movie recommendation at a time. No lists, no scrolling, no registration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col">
        <MaterialRegistry />
        {children}
      </body>
    </html>
  );
}
