import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
  SessionsIndex,
  SessionIndexEntry,
  SessionDisplay,
  JsonlMessage,
} from "../types.js";
import { extractProjectName } from "./format.js";
import { extractTextContent } from "./jsonl-reader.js";

function toSessionDisplay(entry: SessionIndexEntry): SessionDisplay {
  return {
    sessionId: entry.sessionId,
    fullPath: entry.fullPath,
    firstPrompt: entry.firstPrompt || "",
    summary: entry.summary || entry.firstPrompt || "",
    messageCount: entry.messageCount,
    created: new Date(entry.created),
    modified: new Date(entry.modified),
    gitBranch: entry.gitBranch || "",
    projectPath: entry.projectPath || "",
    projectName: extractProjectName(entry.projectPath || ""),
    isSidechain: entry.isSidechain ?? false,
  };
}

// Read the first ~4KB of a .jsonl to extract basic session metadata
async function sessionFromJsonl(
  filePath: string,
  dirName: string,
): Promise<SessionDisplay | null> {
  let fd: fs.FileHandle | undefined;
  try {
    fd = await fs.open(filePath, "r");
    const stat = await fd.stat();
    if (stat.size === 0) return null;

    const readSize = Math.min(4096, stat.size);
    const buffer = Buffer.alloc(readSize);
    await fd.read(buffer, 0, readSize, 0);
    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter(Boolean);

    let firstPrompt = "";
    let projectPath = "";
    let gitBranch = "";
    let created = new Date(stat.mtimeMs);
    let sessionId = path.basename(filePath, ".jsonl");
    let isSidechain = false;
    let messageCount = 0;

    for (const line of lines) {
      try {
        const obj: JsonlMessage & {
          isSidechain?: boolean;
          gitBranch?: string;
        } = JSON.parse(line);

        if (obj.type === "user" || obj.type === "assistant") {
          messageCount++;
        }

        if (obj.isSidechain) {
          isSidechain = true;
        }

        if (obj.type === "user" && !firstPrompt) {
          const content = extractTextContent(obj.message?.content);
          if (content) firstPrompt = content.slice(0, 200);
          if (obj.cwd) projectPath = obj.cwd;
          if (obj.timestamp) created = new Date(obj.timestamp);
          if (obj.sessionId) sessionId = obj.sessionId;
          if (obj.gitBranch) gitBranch = obj.gitBranch;
        }
      } catch {
        // skip
      }
    }

    if (!projectPath) {
      // Fallback: decode from directory name (lossy — dashes in path
      // components become slashes, but better than nothing)
      projectPath = "/" + dirName.replace(/^-/, "").replace(/-/g, "/");
    }

    return {
      sessionId,
      fullPath: filePath,
      firstPrompt,
      summary: firstPrompt,
      messageCount,
      created,
      modified: new Date(stat.mtimeMs),
      gitBranch,
      projectPath,
      projectName: extractProjectName(projectPath),
      isSidechain,
    };
  } catch {
    return null;
  } finally {
    await fd?.close();
  }
}

export async function loadAllSessions(
  claudeDir?: string,
): Promise<SessionDisplay[]> {
  const projectsDir =
    claudeDir || path.join(os.homedir(), ".claude", "projects");

  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(projectsDir);
  } catch {
    return [];
  }

  const allSessions: SessionDisplay[] = [];

  await Promise.all(
    dirEntries.map(async (dirName) => {
      const dirPath = path.join(projectsDir, dirName);

      // Skip non-directories
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) return;
      } catch {
        return;
      }

      // Collect indexed session IDs
      const indexedIds = new Set<string>();

      // Try reading sessions-index.json
      const indexPath = path.join(dirPath, "sessions-index.json");
      try {
        const indexData = await fs.readFile(indexPath, "utf-8");
        const index: SessionsIndex = JSON.parse(indexData);
        if (index.entries && Array.isArray(index.entries)) {
          for (const entry of index.entries) {
            indexedIds.add(entry.sessionId);
            allSessions.push(toSessionDisplay(entry));
          }
        }
      } catch {
        // No index file — will scan .jsonl files below
      }

      // Scan for .jsonl files not in the index
      try {
        const files = await fs.readdir(dirPath);
        const jsonlFiles = files.filter(
          (f) => f.endsWith(".jsonl") && !f.startsWith("."),
        );

        await Promise.all(
          jsonlFiles.map(async (file) => {
            const sessionId = path.basename(file, ".jsonl");
            if (indexedIds.has(sessionId)) return;

            const session = await sessionFromJsonl(
              path.join(dirPath, file),
              dirName,
            );
            if (session) {
              allSessions.push(session);
            }
          }),
        );
      } catch {
        // Can't read directory
      }
    }),
  );

  // Deduplicate by sessionId, sort by modified desc
  const seen = new Set<string>();
  return allSessions
    .filter((s) => !s.isSidechain)
    .filter((s) => s.messageCount > 0)
    .filter((s) => {
      const text = s.firstPrompt || s.summary || "";
      return !text.startsWith("<local-command-caveat>") && !text.startsWith("Caveat: The messages below");
    })
    .filter((s) => {
      if (seen.has(s.sessionId)) return false;
      seen.add(s.sessionId);
      return true;
    })
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());
}
