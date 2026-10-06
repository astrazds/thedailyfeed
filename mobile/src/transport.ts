import {
  parseFeedApiResponse,
  parseFeedStreamLine,
} from "../../lib/feed-stream-parser";
import type { FeedApiResponse, FeedStreamChunk } from "../../lib/types";
const MAX_BYTES = 32 * 1024 * 1024;
export async function consumeFeedResponse(
  response: Response,
  onChunk: (chunk: FeedStreamChunk) => void,
  signal: AbortSignal,
): Promise<FeedApiResponse | null> {
  if (!response.ok) throw new Error("Unable to fetch feeds");
  if (!response.body) throw new Error("Response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let bytes = 0;
  const streaming = response.headers
    .get("content-type")
    ?.includes("application/x-ndjson");
  const acceptLines = (final = false): boolean => {
    const lines = pending.split("\n");
    pending = final ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = parseFeedStreamLine(line);
      onChunk(chunk);
      if (chunk.type === "done") return true;
    }
    return false;
  };
  try {
    while (true) {
      if (signal.aborted) throw new Error("Aborted");
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error("Aborted");
      if (value) {
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("Feed response is too large");
      }
      pending += decoder.decode(value, { stream: !done });
      if (streaming && acceptLines(done)) return null;
      if (done) break;
    }
    if (streaming) return null;
    const data: unknown = JSON.parse(pending);
    const parsed = parseFeedApiResponse(data);
    if (!parsed) throw new Error("Invalid feed response");
    return parsed;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
