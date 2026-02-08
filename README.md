# claude-resume

A fast, interactive terminal session browser for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Browse and resume any of your past sessions across all projects with arrow-key navigation, live search, and message previews.

## Why?

Claude Code's built-in `/resume` command only shows sessions for the current project and is slow to navigate. `claude-resume` shows **all sessions across all projects**, sorted by most recent, with instant message previews and vim-style search.

## Install

```bash
pnpm install
pnpm build
pnpm link --global
```

## Usage

```bash
claude-resume          # resumes with `claude`
claude-remote-resume   # resumes with `claude-remote`
```

### Controls

| Key | Action |
|-----|--------|
| `Up` / `Down` | Navigate sessions |
| `/` | Enter search mode (filters by summary, project, branch) |
| `Enter` | Resume the selected session |
| `Backspace` | Delete search chars (exits search when empty) |
| `Esc` | Clear search / quit |
| `q` | Quit |

## How it works

1. Reads `sessions-index.json` files from `~/.claude/projects/` for instant metadata, and also scans `.jsonl` files directly to catch sessions not yet indexed
2. Merges and deduplicates sessions from all projects, sorted by last modified time
3. When you highlight a session, reads only the **last 8KB** of the `.jsonl` conversation file to extract a preview of the last messages
4. Uses alternate screen buffer (like vim/fzf) for clean fullscreen rendering
5. On Enter, launches `claude --resume <sessionId>` via your shell (`$SHELL -ic`) so aliases are inherited
6. Search with `/` filters live and highlights matches with yellow background

## Development

```bash
pnpm dev          # Run directly with tsx
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm build        # Compile TypeScript to dist/
```

## License

MIT
