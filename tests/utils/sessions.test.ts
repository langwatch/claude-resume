import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadAllSessions } from "../../src/utils/sessions.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-resume-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createProjectWithIndex(
  projectName: string,
  entries: Record<string, unknown>[],
) {
  const projectDir = path.join(tmpDir, projectName);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, "sessions-index.json"),
    JSON.stringify({ version: 1, entries }),
  );
  return projectDir;
}

function jsonlLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

async function createProjectWithJsonl(
  projectName: string,
  sessions: { id: string; firstPrompt: string; cwd?: string }[],
) {
  const projectDir = path.join(tmpDir, projectName);
  await fs.mkdir(projectDir, { recursive: true });
  for (const session of sessions) {
    const content =
      jsonlLine({
        type: "user",
        message: { role: "user", content: session.firstPrompt },
        timestamp: "2026-02-07T12:00:00.000Z",
        sessionId: session.id,
        cwd: session.cwd || "/Users/test/my-project",
        gitBranch: "main",
      }) +
      jsonlLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Sure thing!" }],
        },
        timestamp: "2026-02-07T12:00:01.000Z",
        sessionId: session.id,
      });
    await fs.writeFile(path.join(projectDir, `${session.id}.jsonl`), content);
  }
  return projectDir;
}

describe("loadAllSessions", () => {
  it("loads sessions from sessions-index.json files", async () => {
    await createProjectWithIndex("-Users-test-project-a", [
      {
        sessionId: "aaa-111",
        fullPath: "/tmp/aaa-111.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "fix the bug",
        summary: "Bug fix session",
        messageCount: 10,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-02T00:00:00.000Z",
        gitBranch: "main",
        projectPath: "/Users/test/project-a",
        isSidechain: false,
      },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("aaa-111");
    expect(sessions[0].summary).toBe("Bug fix session");
    expect(sessions[0].projectName).toBe("project-a");
    expect(sessions[0].messageCount).toBe(10);
    expect(sessions[0].gitBranch).toBe("main");
  });

  it("merges sessions from multiple project dirs", async () => {
    await createProjectWithIndex("-Users-test-project-a", [
      {
        sessionId: "aaa-111",
        fullPath: "/tmp/aaa-111.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "first",
        messageCount: 5,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project-a",
        isSidechain: false,
      },
    ]);
    await createProjectWithIndex("-Users-test-project-b", [
      {
        sessionId: "bbb-222",
        fullPath: "/tmp/bbb-222.jsonl",
        fileMtime: 1700000001000,
        firstPrompt: "second",
        messageCount: 3,
        created: "2026-01-02T00:00:00.000Z",
        modified: "2026-01-03T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project-b",
        isSidechain: false,
      },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].sessionId).toBe("bbb-222");
    expect(sessions[1].sessionId).toBe("aaa-111");
  });

  it("filters out sidechain sessions", async () => {
    await createProjectWithIndex("-Users-test-project", [
      {
        sessionId: "main-session",
        fullPath: "/tmp/main.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "main",
        messageCount: 5,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: false,
      },
      {
        sessionId: "side-session",
        fullPath: "/tmp/side.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "sidechain",
        messageCount: 2,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-02T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: true,
      },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("main-session");
  });

  it("deduplicates sessions by sessionId", async () => {
    await createProjectWithIndex("-Users-test-project-a", [
      {
        sessionId: "same-id",
        fullPath: "/tmp/same.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "first copy",
        messageCount: 5,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project-a",
        isSidechain: false,
      },
    ]);
    await createProjectWithIndex("-Users-test-project-b", [
      {
        sessionId: "same-id",
        fullPath: "/tmp/same.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "second copy",
        messageCount: 5,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-02T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project-b",
        isSidechain: false,
      },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toHaveLength(1);
  });

  it("sorts sessions by modified date descending", async () => {
    await createProjectWithIndex("-Users-test-project", [
      {
        sessionId: "old",
        fullPath: "/tmp/old.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "old",
        messageCount: 1,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: false,
      },
      {
        sessionId: "newest",
        fullPath: "/tmp/newest.jsonl",
        fileMtime: 1700000002000,
        firstPrompt: "newest",
        messageCount: 1,
        created: "2026-01-03T00:00:00.000Z",
        modified: "2026-01-03T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: false,
      },
      {
        sessionId: "middle",
        fullPath: "/tmp/middle.jsonl",
        fileMtime: 1700000001000,
        firstPrompt: "middle",
        messageCount: 1,
        created: "2026-01-02T00:00:00.000Z",
        modified: "2026-01-02T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: false,
      },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions.map((s) => s.sessionId)).toEqual([
      "newest",
      "middle",
      "old",
    ]);
  });

  it("returns empty array for nonexistent directory", async () => {
    const sessions = await loadAllSessions("/nonexistent/path");
    expect(sessions).toEqual([]);
  });

  it("skips non-directory entries", async () => {
    await fs.writeFile(path.join(tmpDir, "some-file.txt"), "not a directory");

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toEqual([]);
  });

  it("uses firstPrompt as fallback when summary is missing", async () => {
    await createProjectWithIndex("-Users-test-project", [
      {
        sessionId: "no-summary",
        fullPath: "/tmp/no-summary.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "my first prompt here",
        messageCount: 1,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: false,
      },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions[0].summary).toBe("my first prompt here");
  });

  // --- New tests for .jsonl file scanning ---

  it("discovers sessions from .jsonl files when no index exists", async () => {
    await createProjectWithJsonl("-Users-test-my-project", [
      { id: "unindexed-1", firstPrompt: "hello from unindexed" },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("unindexed-1");
    expect(sessions[0].firstPrompt).toBe("hello from unindexed");
    expect(sessions[0].projectPath).toBe("/Users/test/my-project");
  });

  it("discovers .jsonl files missing from stale index", async () => {
    const projectDir = await createProjectWithIndex("-Users-test-project", [
      {
        sessionId: "indexed-1",
        fullPath: "/tmp/indexed-1.jsonl",
        fileMtime: 1700000000000,
        firstPrompt: "indexed session",
        messageCount: 5,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: false,
      },
    ]);

    // Add a .jsonl file not in the index
    const content =
      jsonlLine({
        type: "user",
        message: { role: "user", content: "new unindexed session" },
        timestamp: "2026-02-07T12:00:00.000Z",
        sessionId: "unindexed-2",
        cwd: "/Users/test/project",
        gitBranch: "feat/new",
      }) +
      jsonlLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Response" }],
        },
        timestamp: "2026-02-07T12:00:01.000Z",
        sessionId: "unindexed-2",
      });
    await fs.writeFile(path.join(projectDir, "unindexed-2.jsonl"), content);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.sessionId);
    expect(ids).toContain("indexed-1");
    expect(ids).toContain("unindexed-2");
  });

  it("does not duplicate sessions already in the index", async () => {
    const projectDir = await createProjectWithIndex("-Users-test-project", [
      {
        sessionId: "already-indexed",
        fullPath: path.join(tmpDir, "-Users-test-project", "already-indexed.jsonl"),
        fileMtime: 1700000000000,
        firstPrompt: "from index",
        messageCount: 5,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
        gitBranch: "",
        projectPath: "/Users/test/project",
        isSidechain: false,
      },
    ]);

    // Also create the .jsonl file with the same session ID
    const content = jsonlLine({
      type: "user",
      message: { role: "user", content: "from file" },
      timestamp: "2026-02-07T12:00:00.000Z",
      sessionId: "already-indexed",
      cwd: "/Users/test/project",
    });
    await fs.writeFile(
      path.join(projectDir, "already-indexed.jsonl"),
      content,
    );

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    // Should use the index version (has summary, more metadata)
    expect(sessions[0].firstPrompt).toBe("from index");
  });

  it("extracts project path from cwd field in .jsonl", async () => {
    await createProjectWithJsonl("-Users-test-my-app", [
      {
        id: "cwd-test",
        firstPrompt: "test cwd extraction",
        cwd: "/Users/rchaves/Projects/my-app",
      },
    ]);

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions[0].projectPath).toBe("/Users/rchaves/Projects/my-app");
    expect(sessions[0].projectName).toBe("my-app");
  });

  it("skips empty .jsonl files", async () => {
    const projectDir = path.join(tmpDir, "-Users-test-empty");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, "empty-session.jsonl"), "");

    const sessions = await loadAllSessions(tmpDir);
    expect(sessions).toEqual([]);
  });
});
