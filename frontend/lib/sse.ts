import type {
  ChatEvent,
  CitationPayload,
  DoneEventPayload,
  TokenEventPayload,
} from "@/types/chat";

export interface StreamCallbacks {
  onCitation?: (citation: CitationPayload) => void;
  onToken?: (token: TokenEventPayload) => void;
  onDone?: (done: DoneEventPayload) => void;
  onEvent?: (event: ChatEvent) => void;
}

/**
 * Parses Server-Sent Events emitted by backend/app/services/chat_service.py:26-28:
 *   f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
 *
 * Supported event types:
 * - "citation" -> CitationPayload
 * - "token"    -> TokenEventPayload
 * - "done"     -> DoneEventPayload
 */
export async function consume_sse_stream(
  response: Response,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  if (!response.body) {
    throw new Error("ReadableStream is not available on this response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const processFrame = (rawFrame: string) => {
    const trimmed = rawFrame.trim();
    if (!trimmed) return;

    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of rawFrame.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join("\n");

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return;
    }

    if (eventName === "citation") {
      const payload = parsed as CitationPayload;
      callbacks.onCitation?.(payload);
      callbacks.onEvent?.({ event: "citation", data: payload });
    } else if (eventName === "token") {
      const payload = parsed as TokenEventPayload;
      callbacks.onToken?.(payload);
      callbacks.onEvent?.({ event: "token", data: payload });
    } else if (eventName === "done") {
      const payload = parsed as DoneEventPayload;
      callbacks.onDone?.(payload);
      callbacks.onEvent?.({ event: "done", data: payload });
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by \n\n (or \r\n\r\n)
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        processFrame(frame);
      }
    }

    if (buffer.trim().length > 0) {
      processFrame(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}
