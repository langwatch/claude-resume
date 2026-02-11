import { render } from "ink";
import { execSync } from "node:child_process";
import { App } from "./app.js";
import type { SessionSelection } from "./app.js";

export function run(claudeCmd: string) {
  let selection: SessionSelection | null = null;

  function onSelect(s: SessionSelection) {
    selection = s;
  }

  // Enter alternate screen buffer (like vim/fzf) for clean fullscreen rendering
  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[H");

  const { waitUntilExit } = render(<App onSelect={onSelect} />);

  waitUntilExit().then(() => {
    // Exit alternate screen buffer
    process.stdout.write("\x1b[?1049l");

    if (selection !== null) {
      const s: SessionSelection = selection;
      const userShell = process.env.SHELL || "/bin/zsh";
      execSync(
        `${userShell} -ic 'cd "${s.projectPath}" && ${claudeCmd} --resume "${s.sessionId}"'`,
        { stdio: "inherit" },
      );
    }
  });
}
