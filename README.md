# claude-resume

A fast, interactive terminal session browser for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Browse, search, fork, and checkpoint any of your past sessions across all projects — with live filtering, BM25 full-text deep search, and message previews.

## Why?

Claude Code's built-in `/resume` is limited to the current project, `/checkpoint` can't go earlier than summarized context, and `/fork` UX is clunky. `claude-resume` gives you **all sessions across all projects** with powerful search, session forking, and full checkpoint control over your conversation history.

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
| Type anything | Live filter by summary, project, branch |
| `Up` / `Down` | Navigate sessions |
| `Enter` | Resume selected session, or deep search when in search bar |
| `Right` | Open action menu (Fork / Checkpoint) on selected session |
| `f` | Fork (duplicate) the selected session |
| `c` | Checkpoint — roll back to any conversation turn |
| `Backspace` | Delete search characters |
| `Esc` | Clear search / cancel action / quit |

### Search

- **Live filtering**: Just start typing — sessions are filtered instantly by summary, first prompt, project name, path, and git branch. Multi-word queries highlight each term independently.
- **Deep search** (`Enter` in search bar): Performs a full BM25 search through the actual conversation content of all your `.jsonl` files. Results stream in ranked by relevance with recency boost, and show relevance bars and match snippets in the preview pane.

### Fork & Checkpoint

- **Fork** (`f` or `Right` → Fork): Duplicates the session `.jsonl` file with a new UUID. The forked session appears immediately in the list. Useful for branching a conversation without losing the original.
- **Checkpoint** (`c` or `Right` → Checkpoint): Shows every conversation turn in a scrollable list. Select a turn and confirm to truncate the session to that point. The original file is backed up to `.jsonl.bkp` before truncation. Unlike Claude's built-in `/checkpoint`, this works on any turn — even ones before summarized context.

Both actions are available in browse mode and deep search mode, and require confirmation before executing.

## How it works

1. Reads `sessions-index.json` files from `~/.claude/projects/` for instant metadata, and scans `.jsonl` files directly to catch sessions not yet indexed
2. Uses actual file modification times (`fs.stat`) instead of stale index timestamps
3. Merges and deduplicates sessions from all projects, sorted by most recently modified
4. Preview pane reads the last 8KB of conversation files for quick message previews
5. Deep search streams through `.jsonl` files newest-first, scoring with BM25 (k1=1.2, b=0.4) plus a recency boost, with prefix matching for partial terms
6. Uses alternate screen buffer (like vim/fzf) for clean fullscreen rendering
7. Launches `claude --resume <sessionId>` via your shell (`$SHELL -ic`) so aliases are inherited

## Development

```bash
pnpm dev          # Run directly with tsx
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm build        # Compile TypeScript to dist/
```

## License

MIT
