import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velo — Your physics guide",
  description: "Learn physics through guided conversation and interactive visual explanations.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
