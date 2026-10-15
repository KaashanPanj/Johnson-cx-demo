import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Johnson Health Tech × Aistra — Voice AI Demo",
  description:
    "Inbound AI voice agents for Johnson Health Tech Australia: an AI-powered retail IVR and a partner delivery desk, with live transcripts and automatic CRM write-back.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
