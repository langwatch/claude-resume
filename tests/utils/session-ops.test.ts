import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  forkSession,
  loadConversationTurns,
  checkpointSession,
  moveSession,
  getUniqueProjectPaths,
} from "../../src/utils/session-ops.js";
import type { SessionDisplay } from "../../src/types.js";

let tmpDir: string;

function makeJsonlLine(
  type: string,
  content: string,
  sessionId: string,
  parentUuid: string | null = null,
): string {
  return JSON.stringify({
    parentUuid,
    isSidechain: false,
    userType: "external",
    cwd: "/tmp/project",
    sessionId,
    version: "2.1.42",
    type,
    message: { role: type, content },
    uuid: `uuid-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-ops-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("forkSession", () => {
  it("creates a new file with a different session ID", async () => {
    const originalId = "original-session-id";
    const filePath = path.join(tmpDir, `${originalId}.jsonl`);

    const lines = [
      makeJsonlLine("user", "hello", originalId, null),
      makeJsonlLine("assistant", "hi there", originalId, "uuid-1"),
      makeJsonlLine("user", "do something", originalId, "uuid-2"),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const newId = await forkSession(filePath);

    expect(newId).not.toBe(originalId);
    expect(newId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const newPath = path.join(tmpDir, `${newId}.jsonl`);
    expect(fs.existsSync(newPath)).toBe(true);

    // Verify session ID was replaced in all lines
    const newContent = fs.readFileSync(newPath, "utf-8");
    const newLines = newContent.split("\n").filter(Boolean);
    expect(newLines.length).toBe(3);
    for (const line of newLines) {
      const obj = JSON.parse(line);
      expect(obj.sessionId).toBe(newId);
    }

    // Original file untouched
    const origContent = fs.readFileSync(filePath, "utf-8");
    for (const line of origContent.split("\n").filter(Boolean)) {
      const obj = JSON.parse(line);
      expect(obj.sessionId).toBe(originalId);
    }
  });

  it("preserves non-session content", async () => {
    const id = "test-id";
    const filePath = path.join(tmpDir, `${id}.jsonl`);
    const line = makeJsonlLine("user", "my important message", id, null);
    fs.writeFileSync(filePath, line + "\n");

    const newId = await forkSession(filePath);
    const newPath = path.join(tmpDir, `${newId}.jsonl`);
    const newContent = fs.readFileSync(newPath, "utf-8");
    const obj = JSON.parse(newContent.split("\n")[0]);
    expect(obj.message.content).toBe("my important message");
    expect(obj.cwd).toBe("/tmp/project");
  });
});

describe("loadConversationTurns", () => {
  it("loads user and assistant turns", async () => {
    const filePath = path.join(tmpDir, "turns.jsonl");
    const lines = [
      JSON.stringify({ type: "file-history-snapshot", data: {} }),
      makeJsonlLine("user", "first question", "s1", null),
      makeJsonlLine("assistant", "first answer", "s1", "u1"),
      makeJsonlLine("user", "second question", "s1", "u2"),
      makeJsonlLine("assistant", "second answer", "s1", "u3"),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const turns = await loadConversationTurns(filePath);

    expect(turns).toHaveLength(4);
    expect(turns[0].role).toBe("user");
    expect(turns[0].textPreview).toBe("first question");
    expect(turns[0].lineNumber).toBe(2);
    expect(turns[0].index).toBe(0);

    expect(turns[1].role).toBe("assistant");
    expect(turns[1].textPreview).toBe("first answer");
    expect(turns[1].lineNumber).toBe(3);

    expect(turns[2].role).toBe("user");
    expect(turns[3].role).toBe("assistant");
  });

  it("skips non-message lines", async () => {
    const filePath = path.join(tmpDir, "turns2.jsonl");
    const lines = [
      JSON.stringify({ type: "file-history-snapshot", data: {} }),
      JSON.stringify({ type: "progress", data: {} }),
      makeJsonlLine("user", "hello", "s1", null),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const turns = await loadConversationTurns(filePath);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("user");
  });

  it("truncates long text previews", async () => {
    const filePath = path.join(tmpDir, "turns3.jsonl");
    const longText = "a".repeat(200);
    const lines = [makeJsonlLine("user", longText, "s1", null)];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const turns = await loadConversationTurns(filePath);
    expect(turns[0].textPreview.length).toBe(120);
  });
});

describe("checkpointSession", () => {
  it("truncates file and creates backup", async () => {
    const filePath = path.join(tmpDir, "checkpoint.jsonl");
    const lines = [
      JSON.stringify({ type: "file-history-snapshot", data: {} }),
      makeJsonlLine("user", "first", "s1", null),
      makeJsonlLine("assistant", "reply1", "s1", "u1"),
      makeJsonlLine("user", "second", "s1", "u2"),
      makeJsonlLine("assistant", "reply2", "s1", "u3"),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    // Checkpoint at the first assistant reply (line 3, index 1)
    const turns = await loadConversationTurns(filePath);
    expect(turns).toHaveLength(4);

    await checkpointSession(filePath, turns[1]); // assistant "reply1" at line 3

    // Backup exists
    const bkpPath = filePath + ".bkp";
    expect(fs.existsSync(bkpPath)).toBe(true);

    // Backup has original content (5 lines)
    const bkpContent = fs.readFileSync(bkpPath, "utf-8");
    expect(bkpContent.split("\n").filter(Boolean)).toHaveLength(5);

    // Truncated file has 3 lines (snapshot + user + assistant)
    const truncContent = fs.readFileSync(filePath, "utf-8");
    const truncLines = truncContent.split("\n").filter(Boolean);
    expect(truncLines).toHaveLength(3);

    // Verify content
    const lastLine = JSON.parse(truncLines[2]);
    expect(lastLine.message.content).toBe("reply1");
  });

  it("overwrites existing backup", async () => {
    const filePath = path.join(tmpDir, "checkpoint2.jsonl");
    const bkpPath = filePath + ".bkp";

    // Create initial file
    const lines = [
      makeJsonlLine("user", "first", "s1", null),
      makeJsonlLine("assistant", "reply", "s1", "u1"),
      makeJsonlLine("user", "second", "s1", "u2"),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    // Create existing backup
    fs.writeFileSync(bkpPath, "old backup content");

    const turns = await loadConversationTurns(filePath);
    await checkpointSession(filePath, turns[1]); // keep first 2 turns

    // Backup was overwritten with real content
    const bkpContent = fs.readFileSync(bkpPath, "utf-8");
    expect(bkpContent).not.toBe("old backup content");
    expect(bkpContent.split("\n").filter(Boolean)).toHaveLength(3);
  });
});

describe("moveSession", () => {
  it("moves file to target project directory and updates cwd", async () => {
    // Simulate ~/.claude/projects/source-dir/session.jsonl
    const sourceDir = path.join(tmpDir, ".claude", "projects", "-tmp-source");
    fs.mkdirSync(sourceDir, { recursive: true });

    const sessionId = "move-test-session";
    const filePath = path.join(sourceDir, `${sessionId}.jsonl`);
    const lines = [
      makeJsonlLine("user", "hello", sessionId, null),
      makeJsonlLine("assistant", "hi", sessionId, "u1"),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    // Mock os.homedir by using a custom projects dir
    // moveSession uses os.homedir(), so we test the function behavior
    const newProjectPath = "/new/project/path";
    const resultPath = await moveSession(filePath, newProjectPath);

    // Original file should be gone
    expect(fs.existsSync(filePath)).toBe(false);

    // Backup should exist
    expect(fs.existsSync(filePath + ".bkp")).toBe(true);

    // New file should exist at result path
    expect(fs.existsSync(resultPath)).toBe(true);

    // cwd should be updated in all lines
    const newContent = fs.readFileSync(resultPath, "utf-8");
    for (const line of newContent.split("\n").filter(Boolean)) {
      const obj = JSON.parse(line);
      expect(obj.cwd).toBe(newProjectPath);
    }
  });

  it("removes entry from source sessions-index.json", async () => {
    const sourceDir = path.join(tmpDir, ".claude", "projects", "-tmp-src2");
    fs.mkdirSync(sourceDir, { recursive: true });

    const sessionId = "indexed-session";
    const filePath = path.join(sourceDir, `${sessionId}.jsonl`);
    fs.writeFileSync(filePath, makeJsonlLine("user", "hi", sessionId, null) + "\n");

    // Create sessions-index.json with this session
    const indexPath = path.join(sourceDir, "sessions-index.json");
    fs.writeFileSync(indexPath, JSON.stringify({
      version: 1,
      entries: [
        { sessionId, fullPath: filePath },
        { sessionId: "other-session", fullPath: "/other" },
      ],
    }));

    await moveSession(filePath, "/new/path");

    // Index should no longer contain the moved session
    const updatedIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    expect(updatedIndex.entries).toHaveLength(1);
    expect(updatedIndex.entries[0].sessionId).toBe("other-session");
  });
});

describe("getUniqueProjectPaths", () => {
  it("returns sorted deduplicated project paths", () => {
    const sessions = [
      { projectPath: "/b/project" },
      { projectPath: "/a/project" },
      { projectPath: "/b/project" },
      { projectPath: "" },
      { projectPath: "/c/project" },
    ] as SessionDisplay[];

    const paths = getUniqueProjectPaths(sessions);
    expect(paths).toEqual(["/a/project", "/b/project", "/c/project"]);
  });
});
