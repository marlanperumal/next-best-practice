import type { Metadata } from "next";
import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";
import { UserMenu } from "@/components/user-menu";
import { WebVitals } from "@/components/web-vitals";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Next Best Practice", template: "%s | Next Best Practice" },
  description: "A minimal demo of Next.js App Router best practices",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <WebVitals />
        <NuqsAdapter>
          <header>
            <nav>
              <Link href="/">Home</Link> <Link href="/products">Products</Link>{" "}
              <Suspense fallback={null}>
                <UserMenu />
              </Suspense>
            </nav>
          </header>
          <main>{children}</main>
        </NuqsAdapter>
      </body>
    </html>
  );
}
