export type EvaInputChannel = "text" | "audio" | "image" | "mixed";
export type EvaResponseChannel = "text" | "audio";

export function getInputChannel(input: {
  incomingMessageType?: string | null;
  hasAudio?: boolean;
  hasText?: boolean;
  hasImage?: boolean;
}): EvaInputChannel {
  const type = input.incomingMessageType?.trim().toLowerCase() ?? "";
  const hasAudio =
    Boolean(input.hasAudio) || type === "audio" || type === "ptt" || type === "voice";
  const hasImage = Boolean(input.hasImage) || type === "image";
  const hasText = Boolean(input.hasText) || type === "chat" || type === "text";

  if (hasAudio && hasImage) return "mixed";
  if (hasAudio) return "audio";
  if (hasImage && hasText) return "mixed";
  if (hasImage) return "image";
  return "text";
}

export function determineResponseChannel(input: {
  incomingMessageType?: string | null;
  hasAudio?: boolean;
  hasText?: boolean;
  hasImage?: boolean;
}): EvaResponseChannel {
  const inputChannel = getInputChannel(input);

  if (inputChannel === "audio") return "audio";
  if (inputChannel === "mixed" && input.hasAudio) return "audio";
  return "text";
}
