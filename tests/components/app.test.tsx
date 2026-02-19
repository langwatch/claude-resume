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

vi.mock("../../src/utils/deep-search.js", () => ({
  deepSearch: vi.fn().mockResolvedValue(undefined),
  extractMatchSnippets: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/utils/session-ops.js", () => ({
  forkSession: vi.fn().mockResolvedValue("new-forked-id"),
  loadConversationTurns: vi.fn().mockResolvedValue([
    { index: 0, lineNumber: 1, role: "user", textPreview: "hello", timestamp: "2026-01-01T00:00:00Z" },
    { index: 1, lineNumber: 2, role: "assistant", textPreview: "hi there", timestamp: "2026-01-01T00:01:00Z" },
  ]),
  checkpointSession: vi.fn().mockResolvedValue(undefined),
}));

import { loadAllSessions } from "../../src/utils/sessions.js";
import { readLastMessages } from "../../src/utils/jsonl-reader.js";
import { forkSession, loadConversationTurns, checkpointSession } from "../../src/utils/session-ops.js";
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
      expect(frame).toContain("Dark mode implement");
      expect(frame).toContain("Auth refactoring");
    });
  });

  it("shows preview pane content after selecting a session", async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Login bug fix");
    });

    // Press down arrow to select first session (starts in search bar)
    stdin.write("\x1B[B");

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

    // Press down twice: -1 → 0 (first session) → 1 (second session)
    stdin.write("\x1B[B");
    stdin.write("\x1B[B");

    await vi.waitFor(() => {
      expect(readLastMessages).toHaveBeenCalledWith("/tmp/session-2.jsonl");
    });
  });

  it("calls onSelect when Enter is pressed on a session", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(loadAllSessions).toHaveBeenCalled();
    });

    // Small delay for state to settle
    await new Promise((r) => setTimeout(r, 50));

    // Press down arrow to select first session (starts in search bar at -1)
    stdin.write("\x1B[B");
    await new Promise((r) => setTimeout(r, 50));

    // Press Enter to resume
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

  it("opens action menu on right arrow when session focused", async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Login bug fix");
    });

    // Navigate to first session
    stdin.write("\x1B[B");
    await new Promise((r) => setTimeout(r, 50));

    // Press right arrow to open action menu
    stdin.write("\x1B[C");
    await new Promise((r) => setTimeout(r, 50));

    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain("Fork");
      expect(frame).toContain("Checkpoint");
    });
  });

  it("pressing f opens fork confirmation dialog", async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Login bug fix");
    });

    // Navigate to first session
    stdin.write("\x1B[B");
    await new Promise((r) => setTimeout(r, 50));

    // Press f to fork
    stdin.write("f");
    await new Promise((r) => setTimeout(r, 50));

    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain("Fork session?");
      expect(frame).toContain("Confirm");
      expect(frame).toContain("Cancel");
    });
  });

  it("pressing c opens checkpoint view", async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Login bug fix");
    });

    // Navigate to first session
    stdin.write("\x1B[B");
    await new Promise((r) => setTimeout(r, 50));

    // Press c to checkpoint
    stdin.write("c");
    await new Promise((r) => setTimeout(r, 50));

    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain("Checkpoint:");
      expect(frame).toContain("hello");
      expect(frame).toContain("hi there");
    });
  });

  it("f and c do not activate when in search bar", async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<App onSelect={onSelect} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Login bug fix");
    });

    // Type 'f' while in search bar — should filter, not fork
    stdin.write("f");
    await new Promise((r) => setTimeout(r, 50));

    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).not.toContain("Fork session?");
      // 'f' was added to search query — should filter
      expect(frame).toContain("f");
    });
  });
});
