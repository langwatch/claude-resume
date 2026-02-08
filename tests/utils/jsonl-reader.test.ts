import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  readLastMessages,
  extractTextContent,
  clearCache,
} from "../../src/utils/jsonl-reader.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-resume-jsonl-"));
  clearCache();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function jsonlLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

function userMsg(content: string, timestamp?: string): string {
  return jsonlLine({
    type: "user",
    message: { role: "user", content },
    timestamp: timestamp || "2026-01-01T00:00:00.000Z",
  });
}

function assistantMsg(
  content: string | { type: string; text?: string }[],
  timestamp?: string,
): string {
  return jsonlLine({
    type: "assistant",
    message: { role: "assistant", content },
    timestamp: timestamp || "2026-01-01T00:00:01.000Z",
  });
}

describe("extractTextContent", () => {
  it("handles string content", () => {
    expect(extractTextContent("hello world")).toBe("hello world");
  });

  it("handles content block array with text", () => {
    expect(
      extractTextContent([
        { type: "text", text: "hello" },
        { type: "text", text: " world" },
      ]),
    ).toBe("hello\n world");
  });

  it("skips thinking and tool_use blocks", () => {
    expect(
      extractTextContent([
        { type: "thinking", thinking: "let me think..." },
        { type: "tool_use", name: "Read" },
        { type: "text", text: "final answer" },
      ]),
    ).toBe("final answer");
  });

  it("returns undefined for empty content", () => {
    expect(extractTextContent(undefined)).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(extractTextContent([])).toBeUndefined();
  });

  it("returns undefined for array with no text blocks", () => {
    expect(
      extractTextContent([{ type: "tool_use", name: "Bash" }]),
    ).toBeUndefined();
  });
});

describe("readLastMessages", () => {
  it("reads last user and assistant messages from small file", async () => {
    const filePath = path.join(tmpDir, "small.jsonl");
    await fs.writeFile(
      filePath,
      userMsg("hello there") + assistantMsg("hi back!"),
    );

    const result = await readLastMessages(filePath);
    expect(result.lastUser).toBe("hello there");
    expect(result.lastAssistant).toBe("hi back!");
  });

  it("returns the LAST user and assistant messages", async () => {
    const filePath = path.join(tmpDir, "multi.jsonl");
    await fs.writeFile(
      filePath,
      userMsg("first question") +
        assistantMsg("first answer") +
        userMsg("second question") +
        assistantMsg("second answer"),
    );

    const result = await readLastMessages(filePath);
    expect(result.lastUser).toBe("second question");
    expect(result.lastAssistant).toBe("second answer");
  });

  it("handles file with only user messages", async () => {
    const filePath = path.join(tmpDir, "user-only.jsonl");
    await fs.writeFile(filePath, userMsg("just a user message"));

    const result = await readLastMessages(filePath);
    expect(result.lastUser).toBe("just a user message");
    expect(result.lastAssistant).toBeUndefined();
  });

  it("handles file with only assistant messages", async () => {
    const filePath = path.join(tmpDir, "assistant-only.jsonl");
    await fs.writeFile(filePath, assistantMsg("just an assistant message"));

    const result = await readLastMessages(filePath);
    expect(result.lastUser).toBeUndefined();
    expect(result.lastAssistant).toBe("just an assistant message");
  });

  it("handles content block arrays in assistant messages", async () => {
    const filePath = path.join(tmpDir, "blocks.jsonl");
    await fs.writeFile(
      filePath,
      userMsg("tell me something") +
        assistantMsg([
          { type: "thinking", text: "thinking..." },
          { type: "text", text: "Here is my answer" },
        ]),
    );

    const result = await readLastMessages(filePath);
    expect(result.lastAssistant).toBe("Here is my answer");
  });

  it("skips non-message types like file-history-snapshot", async () => {
    const filePath = path.join(tmpDir, "mixed.jsonl");
    await fs.writeFile(
      filePath,
      userMsg("my question") +
        assistantMsg("my answer") +
        jsonlLine({ type: "file-history-snapshot", data: {} }) +
        jsonlLine({ type: "progress", message: "working..." }),
    );

    const result = await readLastMessages(filePath);
    expect(result.lastUser).toBe("my question");
    expect(result.lastAssistant).toBe("my answer");
  });

  it("handles nonexistent file gracefully", async () => {
    const result = await readLastMessages("/nonexistent/file.jsonl");
    expect(result.lastUser).toBeUndefined();
    expect(result.lastAssistant).toBeUndefined();
  });

  it("handles empty file", async () => {
    const filePath = path.join(tmpDir, "empty.jsonl");
    await fs.writeFile(filePath, "");

    const result = await readLastMessages(filePath);
    expect(result.lastUser).toBeUndefined();
    expect(result.lastAssistant).toBeUndefined();
  });

  it("handles large file by reading only the tail", async () => {
    const filePath = path.join(tmpDir, "large.jsonl");
    // Write a bunch of padding lines, then the real messages at the end
    let content = "";
    for (let i = 0; i < 500; i++) {
      content += jsonlLine({
        type: "file-history-snapshot",
        data: { padding: "x".repeat(200) },
      });
    }
    content += userMsg("the real question");
    content += assistantMsg("the real answer");
    await fs.writeFile(filePath, content);

    // Use a small initial buffer to test escalation
    const result = await readLastMessages(filePath, 1024);
    expect(result.lastUser).toBe("the real question");
    expect(result.lastAssistant).toBe("the real answer");
  });

  it("handles malformed JSON lines gracefully", async () => {
    const filePath = path.join(tmpDir, "malformed.jsonl");
    await fs.writeFile(
      filePath,
      "this is not json\n" +
        "{broken json\n" +
        userMsg("valid question") +
        assistantMsg("valid answer"),
    );

    const result = await readLastMessages(filePath);
    expect(result.lastUser).toBe("valid question");
    expect(result.lastAssistant).toBe("valid answer");
  });

  it("caches results for repeated reads", async () => {
    const filePath = path.join(tmpDir, "cached.jsonl");
    await fs.writeFile(
      filePath,
      userMsg("cached question") + assistantMsg("cached answer"),
    );

    const result1 = await readLastMessages(filePath);
    // Delete the file — cached result should still be returned
    await fs.unlink(filePath);
    const result2 = await readLastMessages(filePath);

    expect(result1).toEqual(result2);
    expect(result2.lastUser).toBe("cached question");
  });
});
