export function canStartRecordingWithoutPrompt(requester, participants) {
  return requester.role === "agent" &&
    participants.length >= 2 &&
    participants.some(participant => participant.participantId === requester.participantId) &&
    participants.every(participant =>
      participant.participantId === requester.participantId || participant.recordingConsent === true,
    );
}
