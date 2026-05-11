import type { NotificationAddressMode } from "@codexbutler/shared";

export function attentionNotificationText(addressMode: NotificationAddressMode): string {
  switch (addressMode) {
    case "monsieur":
      return "Monsieur ? Your attention please.";
    case "madame":
      return "Madame ? Your attention please.";
    case "neutral":
      return "Your attention please.";
  }
}
