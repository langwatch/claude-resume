# claude-resume

A fast, interactive terminal session browser for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Browse and resume any of your past sessions across all projects with arrow-key navigation and message previews.

## Why?

Claude Code's built-in `/resume` command only shows sessions for the current project and is slow to navigate. `claude-resume` shows **all sessions across all projects**, sorted by most recent, with instant message previews.

## Install

```bash
pnpm install
pnpm build
pnpm link --global
```

## Usage

```bash
claude-resume
```

### Controls

| Key | Action |
|-----|--------|
| `Up` / `Down` | Navigate sessions |
| `Enter` | Resume the selected session |
| `q` / `Esc` | Quit |

## How it works

1. Reads all `sessions-index.json` files from `~/.claude/projects/` for instant metadata loading (no full conversation parsing)
2. Merges and sorts sessions from all projects by last modified time
3. When you highlight a session, reads only the **last 8KB** of the `.jsonl` conversation file to extract a preview of the last messages
4. On Enter, hands off to `claude --resume <sessionId>`

## Development

```bash
pnpm dev          # Run directly with tsx
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm build        # Compile TypeScript to dist/
```

## License

ISC
