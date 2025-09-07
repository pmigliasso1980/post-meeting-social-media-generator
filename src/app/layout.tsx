import "./globals.css";
import { ReactNode } from "react";
export const metadata = { title: "Post-Meeting Social Generator", description: "Generate and post meeting recaps automatically." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
