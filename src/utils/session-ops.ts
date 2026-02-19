import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as readline from "node:readline";
import * as fsSync from "node:fs";
import type { ConversationTurn } from "../types.js";
import { extractTextContent } from "./jsonl-reader.js";

/**
 * Fork (duplicate) a session.
 * Copies the .jsonl file with a new session ID replacing the old one in every line.
 * Returns the new session ID.
 */
export async function forkSession(originalPath: string): Promise<string> {
  const newSessionId = crypto.randomUUID();
  const dir = path.dirname(originalPath);
  const newPath = path.join(dir, `${newSessionId}.jsonl`);
  const oldSessionId = path.basename(originalPath, ".jsonl");

  const content = await fs.readFile(originalPath, "utf-8");
  const lines = content.split("\n");

  const newLines = lines.map((line) => {
    if (!line.trim()) return line;
    try {
      const obj = JSON.parse(line);
      if (obj.sessionId === oldSessionId) {
        obj.sessionId = newSessionId;
      }
      return JSON.stringify(obj);
    } catch {
      return line;
    }
  });

  await fs.writeFile(newPath, newLines.join("\n"), "utf-8");
  return newSessionId;
}

/**
 * Load conversation turns from a .jsonl file.
 * Returns user/assistant turns with line numbers and text previews.
 */
export async function loadConversationTurns(
  filePath: string,
): Promise<ConversationTurn[]> {
  const turns: ConversationTurn[] = [];

  return new Promise((resolve) => {
    let stream: fsSync.ReadStream;
    try {
      stream = fsSync.createReadStream(filePath, { encoding: "utf-8" });
    } catch {
      resolve([]);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNumber = 0;

    rl.on("line", (line) => {
      lineNumber++;
      if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) {
        return;
      }

      try {
        const obj = JSON.parse(line);
        if (obj.type !== "user" && obj.type !== "assistant") return;

        let text = extractTextContent(obj.message?.content) || "";

        // Fallback for messages with no text content (tool calls/results)
        if (!text && Array.isArray(obj.message?.content)) {
          const blocks = obj.message.content;
          const toolUses = blocks.filter((b: { type: string; name?: string }) => b.type === "tool_use");
          const toolResults = blocks.filter((b: { type: string }) => b.type === "tool_result");
          if (toolUses.length > 0) {
            text = `[tool: ${toolUses.map((t: { name?: string }) => t.name || "unknown").join(", ")}]`;
          } else if (toolResults.length > 0) {
            text = `[tool result x${toolResults.length}]`;
          }
        }

        const preview = text.replace(/\n/g, " ").slice(0, 120);

        turns.push({
          index: turns.length,
          lineNumber,
          role: obj.type,
          textPreview: preview,
          timestamp: obj.timestamp,
        });
      } catch {
        // skip
      }
    });

    rl.on("close", () => resolve(turns));
    rl.on("error", () => resolve(turns));
  });
}

/**
 * Checkpoint: truncate a .jsonl file after a given conversation turn.
 * 1. Backs up original to .bkp (overwrites existing)
 * 2. Keeps all lines up to and including the turn's lineNumber
 * 3. Writes truncated content back
 */
export async function checkpointSession(
  filePath: string,
  turn: ConversationTurn,
): Promise<void> {
  const bkpPath = filePath + ".bkp";
  await fs.copyFile(filePath, bkpPath);

  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const keepLines = lines.slice(0, turn.lineNumber);

  await fs.writeFile(filePath, keepLines.join("\n") + "\n", "utf-8");
}
