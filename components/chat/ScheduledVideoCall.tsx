"use client";

import { useRouter } from "next/navigation";
import VideoCallWidget from "@/components/chat/VideoCallWidget";

export default function ScheduledVideoCall(props: {
  sessionToken: string;
  name: string;
  email: string;
  phone: string;
  scheduledAt: string;
}) {
  const router = useRouter();
  return (
    <VideoCallWidget
      onClose={() => router.push("/")}
      sessionToken={props.sessionToken}
      initialStep={2}
      initialFormData={{ name: props.name, email: props.email, phone: props.phone.replace(/^\+91/, "") }}
      scheduledAt={props.scheduledAt}
    />
  );
}
