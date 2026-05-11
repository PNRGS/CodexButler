export interface PushMessage {
  to: string;
  title: string;
  sound?: "default" | null;
  channelId?: string;
}

export interface PushSendResult {
  token: string;
  ok: boolean;
  error?: string;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushSendResult[]>;
}

interface ExpoPushTicket {
  status?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export class ExpoPushSender implements PushSender {
  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    if (!messages.length) {
      return [];
    }

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messages)
    });

    if (!response.ok) {
      throw new Error(`Expo push request failed with ${response.status}`);
    }

    const body = (await response.json()) as { data?: ExpoPushTicket[] };
    const tickets = body.data ?? [];
    return messages.map((message, index) => {
      const ticket = tickets[index];
      const error = ticket?.details?.error ?? ticket?.message;
      return {
        token: message.to,
        ok: ticket?.status === "ok",
        error
      };
    });
  }
}
