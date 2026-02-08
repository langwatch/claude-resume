import { Text } from "ink";
import { timeAgo, truncate, extractProjectName } from "../utils/format.js";
import type { SessionDisplay } from "../types.js";

interface Props {
  session: SessionDisplay;
  isSelected: boolean;
  width: number;
}

export function SessionRow({ session, isSelected, width }: Props) {
  const indicator = isSelected ? "\u276f" : " ";
  const time = timeAgo(session.modified);
  const project = extractProjectName(session.projectPath);
  const branch = session.gitBranch ? ` [${session.gitBranch}]` : "";
  const msgs = `${session.messageCount}msg`;

  // Pad fixed columns
  const timeCol = time.length > 16 ? time.slice(0, 16) : time.padEnd(16);
  const projectCol =
    project.length > 18 ? project.slice(0, 18) : project.padEnd(18);
  const msgsCol = msgs.padStart(6);

  // Fixed parts: "❯ " + timeCol + " " + projectCol + " " + ... + " " + msgsCol
  const prefix = `${indicator} ${timeCol} ${projectCol} `;
  const suffix = `${branch} ${msgsCol}`;

  // Calculate remaining space for the summary label, ensuring total fits in width
  const labelMaxLen = Math.max(10, width - prefix.length - suffix.length);
  const label = truncate(
    session.summary || session.firstPrompt || "(no summary)",
    labelMaxLen,
  );

  // Build the full line and hard-truncate to terminal width
  const fullLine = `${prefix}${label}${suffix}`;
  const line = fullLine.length > width ? fullLine.slice(0, width) : fullLine;

  // Find segment boundaries for coloring
  const prefixEnd = prefix.length;
  const labelEnd = prefixEnd + label.length;

  // Split into: indicator(2) | timeCol | projectCol | label | suffix
  const indicatorStr = line.slice(0, 2);
  const timeStr = line.slice(2, 2 + 17);
  const projectStr = line.slice(2 + 17, prefixEnd);
  const labelStr = line.slice(prefixEnd, Math.min(labelEnd, line.length));
  const suffixStr = labelEnd < line.length ? line.slice(labelEnd) : "";

  return (
    <Text wrap="truncate">
      <Text
        color={isSelected ? "cyan" : undefined}
        bold={isSelected}
        dimColor={!isSelected}
      >
        {indicatorStr}
      </Text>
      <Text color={isSelected ? "cyan" : "yellow"}>{timeStr}</Text>
      <Text color={isSelected ? "cyan" : "magenta"}>{projectStr}</Text>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {labelStr}
      </Text>
      <Text color="gray">{suffixStr}</Text>
    </Text>
  );
}
