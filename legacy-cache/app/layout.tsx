import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legacy Cache Model",
  description: "The pre-Cache-Components caching model, side by side",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", maxWidth: "40rem", margin: "0 auto", padding: "1rem" }}>
        <nav>
          <Link href="/">Home</Link> <Link href="/products">Products</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
