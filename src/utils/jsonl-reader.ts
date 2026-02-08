import * as fs from "node:fs/promises";
import type { ContentBlock } from "../types.js";

export function extractTextContent(
  content: string | ContentBlock[] | undefined,
): string | undefined {
  if (!content) return undefined;
  if (typeof content === "string") return content;
  const textBlocks = content.filter(
    (b): b is ContentBlock & { text: string } =>
      b.type === "text" && typeof b.text === "string" && b.text.length > 0,
  );
  return textBlocks.map((b) => b.text).join("\n") || undefined;
}

export interface PreviewResult {
  lastUser?: string;
  lastAssistant?: string;
}

const cache = new Map<string, PreviewResult>();

export function clearCache(): void {
  cache.clear();
}

export async function readLastMessages(
  filePath: string,
  initialBytes: number = 8192,
): Promise<PreviewResult> {
  const cached = cache.get(filePath);
  if (cached) return cached;

  let bytesToRead = initialBytes;
  const maxBytes = 65536;

  while (bytesToRead <= maxBytes) {
    const result = await readTail(filePath, bytesToRead);
    if (result.lastUser || result.lastAssistant) {
      cache.set(filePath, result);
      return result;
    }
    bytesToRead *= 2;
  }

  const empty: PreviewResult = {};
  cache.set(filePath, empty);
  return empty;
}

async function readTail(
  filePath: string,
  bytesToRead: number,
): Promise<PreviewResult> {
  let fd: fs.FileHandle | undefined;
  try {
    fd = await fs.open(filePath, "r");
    const stat = await fd.stat();
    const fileSize = stat.size;
    if (fileSize === 0) return {};

    const readSize = Math.min(bytesToRead, fileSize);
    const position = Math.max(0, fileSize - readSize);

    const buffer = Buffer.alloc(readSize);
    await fd.read(buffer, 0, readSize, position);
    const text = buffer.toString("utf-8");

    // Skip first partial line unless we read from the start
    const startIdx = position === 0 ? 0 : text.indexOf("\n") + 1;
    if (startIdx === 0 && position !== 0) return {}; // no newline found
    const lines = text.slice(startIdx).split("\n").filter(Boolean);

    let lastUser: string | undefined;
    let lastAssistant: string | undefined;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === "user" && obj.message?.content) {
          const t = extractTextContent(obj.message.content);
          if (t) lastUser = t;
        } else if (obj.type === "assistant" && obj.message?.content) {
          const t = extractTextContent(obj.message.content);
          if (t) lastAssistant = t;
        }
      } catch {
        // skip unparseable lines
      }
    }

    return { lastUser, lastAssistant };
  } catch {
    return {};
  } finally {
    await fd?.close();
  }
}
