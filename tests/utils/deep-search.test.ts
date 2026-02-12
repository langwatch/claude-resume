import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { deepSearch } from "../../src/utils/deep-search.js";
import type { SearchResult } from "../../src/utils/deep-search.js";
import type { SessionDisplay } from "../../src/types.js";

function makeSession(
  id: string,
  fullPath: string,
  overrides?: Partial<SessionDisplay>,
): SessionDisplay {
  return {
    sessionId: id,
    fullPath,
    firstPrompt: "",
    summary: "",
    messageCount: 10,
    created: new Date(),
    modified: new Date(),
    gitBranch: "",
    projectPath: "/tmp",
    projectName: "test",
    isSidechain: false,
    ...overrides,
  };
}

// Write a .jsonl file with parentUuid-prefixed message lines (real Claude format)
function writeJsonl(filePath: string, messages: { type: string; text: string }[]) {
  const lines = messages.map((m) =>
    JSON.stringify({
      parentUuid: "abc-123",
      isSidechain: false,
      type: m.type,
      message: {
        role: m.type,
        content: m.text,
      },
      uuid: "def-456",
      timestamp: new Date().toISOString(),
    }),
  );
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

describe("deepSearch", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deep-search-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("finds matches in user messages", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    writeJsonl(file1, [
      { type: "user", text: "fix the crazy login bug please" },
      { type: "assistant", text: "Sure, I will fix that bug." },
    ]);

    const sessions = [makeSession("s1", file1, { firstPrompt: "fix the crazy login bug" })];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    await deepSearch(sessions, "crazy", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    expect(results.length).toBe(1);
    expect(results[0].session.sessionId).toBe("s1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("finds matches with camelCase terms", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    writeJsonl(file1, [
      { type: "user", text: "inside the traceDetails drawer we have tabs" },
      { type: "assistant", text: "I see the traceDetails component." },
    ]);

    const sessions = [makeSession("s1", file1)];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    await deepSearch(sessions, "traceDetails", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    expect(results.length).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("supports prefix matching (traceDetail matches traceDetails)", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    writeJsonl(file1, [
      { type: "user", text: "inside the traceDetails drawer we have tabs" },
      { type: "assistant", text: "I see the traceDetails component." },
    ]);

    const sessions = [makeSession("s1", file1)];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    // Search with partial term (no trailing 's')
    await deepSearch(sessions, "traceDetail", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    expect(results.length).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("handles parentUuid-prefixed lines (real Claude format)", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    // Simulate real format where lines start with parentUuid, not type
    const line = JSON.stringify({
      parentUuid: null,
      isSidechain: false,
      userType: "external",
      cwd: "/tmp",
      sessionId: "s1",
      version: "2.1.39",
      type: "user",
      message: { role: "user", content: "find the crazy bug" },
      uuid: "abc",
      timestamp: "2026-01-01T00:00:00Z",
    });
    fs.writeFileSync(file1, line + "\n");

    const sessions = [makeSession("s1", file1)];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    await deepSearch(sessions, "crazy", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    expect(results.length).toBe(1);
  });

  it("ranks sessions by relevance", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    const file2 = path.join(tmpDir, "s2.jsonl");

    writeJsonl(file1, [
      { type: "user", text: "authentication is important" },
      { type: "assistant", text: "Yes it is." },
    ]);

    writeJsonl(file2, [
      { type: "user", text: "fix authentication login authentication flow authentication" },
      { type: "assistant", text: "The authentication system needs authentication updates for authentication." },
    ]);

    const sessions = [
      makeSession("s1", file1),
      makeSession("s2", file2),
    ];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    await deepSearch(sessions, "authentication", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    expect(results.length).toBe(2);
    // s2 has more mentions, should rank higher
    expect(results[0].session.sessionId).toBe("s2");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("returns nothing for non-matching queries", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    writeJsonl(file1, [
      { type: "user", text: "fix the login bug" },
      { type: "assistant", text: "Done." },
    ]);

    const sessions = [makeSession("s1", file1)];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    await deepSearch(sessions, "zzzznotfound", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    expect(results.length).toBe(0);
  });

  it("can be cancelled via AbortSignal", async () => {
    const file = path.join(tmpDir, "s0.jsonl");
    writeJsonl(file, [
      { type: "user", text: "hello world" },
    ]);
    const sessions = [makeSession("s0", file)];

    const results: SearchResult[] = [];
    const controller = new AbortController();

    // Abort immediately before starting
    controller.abort();

    await deepSearch(sessions, "hello", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    // Should have exited early, no results
    expect(results.length).toBe(0);
  });

  it("skips non-message lines", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    const lines = [
      JSON.stringify({ type: "file-history-snapshot", timestamp: "2026-01-01" }),
      JSON.stringify({ type: "summary", summary: "crazy summary" }),
      JSON.stringify({
        parentUuid: null,
        type: "user",
        message: { role: "user", content: "find the crazy thing" },
        uuid: "abc",
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ];
    fs.writeFileSync(file1, lines.join("\n") + "\n");

    const sessions = [makeSession("s1", file1)];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    await deepSearch(sessions, "crazy", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    // Should find it from the user message, not the summary line
    expect(results.length).toBe(1);
  });

  it("handles ContentBlock array format", async () => {
    const file1 = path.join(tmpDir, "s1.jsonl");
    const line = JSON.stringify({
      parentUuid: null,
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "The crazy solution is here." },
          { type: "thinking", thinking: "Let me think..." },
          { type: "tool_use", name: "read", input: {} },
        ],
      },
      uuid: "abc",
      timestamp: "2026-01-01T00:00:00Z",
    });
    fs.writeFileSync(file1, line + "\n");

    const sessions = [makeSession("s1", file1)];
    const results: SearchResult[] = [];
    const controller = new AbortController();

    await deepSearch(sessions, "crazy", (r) => { results.length = 0; results.push(...r); }, controller.signal);

    expect(results.length).toBe(1);
  });
});
