#!/usr/bin/env node
import { render } from "ink";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { App } from "./app.js";
import type { SessionSelection } from "./app.js";

// Determine which claude command to use based on the binary name
const binName = path.basename(process.argv[1] || "");
const claudeCmd = binName.includes("remote") ? "claude-remote" : "claude";

let selection: SessionSelection | null = null;

function onSelect(s: SessionSelection) {
  selection = s;
}

// Enter alternate screen buffer (like vim/fzf) for clean fullscreen rendering
process.stdout.write("\x1b[?1049h");
process.stdout.write("\x1b[H");

const { waitUntilExit } = render(<App onSelect={onSelect} />);
await waitUntilExit();

// Exit alternate screen buffer
process.stdout.write("\x1b[?1049l");

if (selection !== null) {
  const s: SessionSelection = selection;
  const userShell = process.env.SHELL || "/bin/zsh";
  // Use interactive shell (-i) to pick up user aliases from .zshrc/.bashrc
  execSync(
    `${userShell} -ic '${claudeCmd} --resume "${s.sessionId}"'`,
    {
      stdio: "inherit",
      cwd: s.projectPath,
    },
  );
}
