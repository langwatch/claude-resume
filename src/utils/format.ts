import { formatDistanceToNow } from "date-fns";

export function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function truncate(text: string, maxLen: number): string {
  const cleaned = text
    .replace(/<[^>]+>/g, "")
    .replace(/\n+/g, " ")
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + "\u2026";
}

export function extractProjectName(projectPath: string): string {
  return projectPath.split("/").filter(Boolean).pop() || projectPath;
}

export function wrapLines(
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const cleaned = text
    .replace(/<[^>]+>/g, "")
    .replace(/\t/g, "  ")
    .trim();
  const lines: string[] = [];
  for (const raw of cleaned.split("\n")) {
    if (lines.length >= maxLines) break;
    if (raw.length <= maxWidth) {
      lines.push(raw);
    } else {
      // Word-wrap long lines
      let remaining = raw;
      while (remaining.length > 0 && lines.length < maxLines) {
        if (remaining.length <= maxWidth) {
          lines.push(remaining);
          break;
        }
        let breakAt = remaining.lastIndexOf(" ", maxWidth);
        if (breakAt <= 0) breakAt = maxWidth;
        lines.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).trimStart();
      }
    }
  }
  if (lines.length >= maxLines) {
    lines[maxLines - 1] =
      lines[maxLines - 1].slice(0, maxWidth - 1) + "\u2026";
  }
  return lines.slice(0, maxLines);
}
