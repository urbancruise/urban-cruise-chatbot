import type { Metadata } from "next";
import ChatLauncher from "@/components/chat/ChatLauncher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Urban Cruise | Car, Tempo Traveller & Bus Rental",
  description: "Explore Urban Cruise car, tempo traveller, and bus rental services. Send a travel enquiry through our support chat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <ChatLauncher />
      </body>
    </html>
  );
}
