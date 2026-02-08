import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../../src/app.js";

// Mock the sessions loader and jsonl reader
vi.mock("../../src/utils/sessions.js", () => ({
  loadAllSessions: vi.fn(),
}));

vi.mock("../../src/utils/jsonl-reader.js", () => ({
  readLastMessages: vi.fn(),
}));

import { loadAllSessions } from "../../src/utils/sessions.js";
import { readLastMessages } from "../../src/utils/jsonl-reader.js";
import type { SessionDisplay } from "../../src/types.js";

const mockSessions: SessionDisplay[] = [
  {
    sessionId: "session-1",
    fullPath: "/tmp/session-1.jsonl",
    firstPrompt: "fix the login bug",
    summary: "Login bug fix",
    messageCount: 12,
    created: new Date("2026-01-03T00:00:00Z"),
    modified: new Date("2026-01-03T12:00:00Z"),
    gitBranch: "main",
    projectPath: "/Users/test/my-app",
    projectName: "my-app",
    isSidechain: false,
  },
  {
    sessionId: "session-2",
    fullPath: "/tmp/session-2.jsonl",
    firstPrompt: "add dark mode",
    summary: "Dark mode implementation",
    messageCount: 25,
    created: new Date("2026-01-02T00:00:00Z"),
    modified: new Date("2026-01-02T18:00:00Z"),
    gitBranch: "feature/dark",
    projectPath: "/Users/test/other-project",
    projectName: "other-project",
    isSidechain: false,
  },
  {
    sessionId: "session-3",
    fullPath: "/tmp/session-3.jsonl",
    firstPrompt: "refactor auth module",
    summary: "Auth refactoring",
    messageCount: 8,
    created: new Date("2026-01-01T00:00:00Z"),
    modified: new Date("2026-01-01T06:00:00Z"),
    gitBranch: "",
    projectPath: "/Users/test/my-app",
    projectName: "my-app",
    isSidechain: false,
  },
];

beforeEach(() => {
  vi.mocked(loadAllSessions).mockResolvedValue(mockSessions);
  vi.mocked(readLastMessages).mockResolvedValue({
    lastUser: "can you fix this?",
    lastAssistant: "Sure, I'll fix the login bug.",
  });
});

describe("App", () => {
  it("shows loading state initially", () => {
    // Make loadAllSessions never resolve to see loading state
    vi.mocked(loadAllSessions).mockReturnValue(new Promise(() => {}));
    const onSelect = vi.fn();
    const { lastFrame } = render(<App onSelect={onSelect} />);
    expect(lastFrame()).toContain("Loading sessions");
  });

  it("renders session list after loading", async () => {
    const onSelect = vi.fn();
    const { lastFrame } = render(<App onSelect={onSelect} />);

    // Wait for async load
    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain("claude-resume");
      expect(frame).toContain("3 sessions");
    });
  });

  it("shows session summaries", async () => {
    const onSelect = vi.fn();
    const { lastFrame } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain("Login bug fix");
      // May be truncated depending on terminal width
      expect(frame).toContain("Dark mode implement");
      expect(frame).toContain("Auth refactoring");
    });
  });

  it("shows preview pane content", async () => {
    const onSelect = vi.fn();
    const { lastFrame } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain("can you fix this?");
      expect(frame).toContain("Sure, I'll fix the login bug.");
    });
  });

  it("navigates with arrow keys", async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Login bug fix");
    });

    // Press down arrow
    stdin.write("\x1B[B");

    await vi.waitFor(() => {
      // readLastMessages should be called again for the new selection
      expect(readLastMessages).toHaveBeenCalledWith("/tmp/session-2.jsonl");
    });
  });

  it("calls onSelect when Enter is pressed", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(loadAllSessions).toHaveBeenCalled();
    });

    // Small delay for state to settle
    await new Promise((r) => setTimeout(r, 50));

    // Press Enter
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        sessionId: "session-1",
        projectPath: "/Users/test/my-app",
      });
    });
  });

  it("shows empty state when no sessions", async () => {
    vi.mocked(loadAllSessions).mockResolvedValue([]);
    const onSelect = vi.fn();
    const { lastFrame } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No sessions found");
    });
  });
});
