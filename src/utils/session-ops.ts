import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import * as readline from "node:readline";
import * as fsSync from "node:fs";
import type { ConversationTurn, SessionDisplay } from "../types.js";
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

/** Encode a project path to a Claude projects directory name. */
function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

/**
 * Move a session to a different project folder.
 * 1. Reads .jsonl and updates `cwd` in all message lines
 * 2. Writes to the target project directory
 * 3. Backs up original to .bkp, then removes it
 * 4. Best-effort: removes from source sessions-index.json
 */
export async function moveSession(
  fullPath: string,
  newProjectPath: string,
): Promise<string> {
  const sessionId = path.basename(fullPath, ".jsonl");
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const targetDirName = encodeProjectPath(newProjectPath);
  const targetDir = path.join(projectsDir, targetDirName);
  const targetPath = path.join(targetDir, `${sessionId}.jsonl`);

  // Create target directory if needed
  await fs.mkdir(targetDir, { recursive: true });

  // Backup original first (before any writes)
  await fs.copyFile(fullPath, fullPath + ".bkp");

  // Read and update cwd in all lines
  const content = await fs.readFile(fullPath, "utf-8");
  const lines = content.split("\n");

  const newLines = lines.map((line) => {
    if (!line.trim()) return line;
    try {
      const obj = JSON.parse(line);
      if (obj.cwd) {
        obj.cwd = newProjectPath;
      }
      return JSON.stringify(obj);
    } catch {
      return line;
    }
  });

  // Write to new location
  await fs.writeFile(targetPath, newLines.join("\n"), "utf-8");

  // Remove original (only if it's a different file than the target)
  if (fullPath !== targetPath) {
    await fs.unlink(fullPath);
  }

  // Best-effort: remove from source sessions-index.json
  const sourceDir = path.dirname(fullPath);
  const sourceIndexPath = path.join(sourceDir, "sessions-index.json");
  try {
    const indexData = await fs.readFile(sourceIndexPath, "utf-8");
    const index = JSON.parse(indexData);
    if (index.entries && Array.isArray(index.entries)) {
      index.entries = index.entries.filter(
        (e: { sessionId: string }) => e.sessionId !== sessionId,
      );
      await fs.writeFile(sourceIndexPath, JSON.stringify(index, null, 2), "utf-8");
    }
  } catch {
    // No index or parse error — skip
  }

  return targetPath;
}

/** Get deduplicated, sorted project paths from loaded sessions. */
export function getUniqueProjectPaths(sessions: SessionDisplay[]): string[] {
  const paths = new Set<string>();
  for (const s of sessions) {
    if (s.projectPath) paths.add(s.projectPath);
  }
  return [...paths].sort();
}
