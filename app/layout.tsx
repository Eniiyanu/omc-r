import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMC-R Demo Connector",
  description: "Standalone MTN Nigeria-style OMC-R simulator dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
