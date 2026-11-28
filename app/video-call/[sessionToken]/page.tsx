import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ScheduledVideoCall from "@/components/chat/ScheduledVideoCall";
import { sessionTokenSchema } from "@/lib/chat/schemas";
import { hashSessionToken } from "@/lib/api/session-auth";
import { findScheduledVideoCallByTokenHash } from "@/lib/repositories/chatbotVideoCalls";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ScheduledVideoCallPage(
  props: PageProps<"/video-call/[sessionToken]">,
) {
  const { sessionToken } = await props.params;
  if (!sessionTokenSchema.safeParse(sessionToken).success) notFound();

  const scheduledCall = await findScheduledVideoCallByTokenHash(hashSessionToken(sessionToken));
  if (!scheduledCall) notFound();

  return (
    <ScheduledVideoCall
      sessionToken={sessionToken}
      name={scheduledCall.name}
      email={scheduledCall.email}
      phone={scheduledCall.phone}
      scheduledAt={scheduledCall.scheduled_at}
    />
  );
}
