import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "JnR · A night to remember",
  description: "A little truth. A little dare. A lot of memories.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
