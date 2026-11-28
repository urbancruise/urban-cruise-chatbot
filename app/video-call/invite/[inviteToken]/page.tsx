import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VideoCallInvite from "@/components/chat/VideoCallInvite";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VideoCallInvitePage(props: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await props.params;
  if (!/^[a-f0-9]{64}$/i.test(inviteToken)) notFound();
  return <VideoCallInvite inviteToken={inviteToken} />;
}
