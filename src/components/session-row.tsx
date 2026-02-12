import { Text } from "ink";
import { timeAgo, truncate, extractProjectName } from "../utils/format.js";
import type { SessionDisplay } from "../types.js";

interface Props {
  session: SessionDisplay;
  isSelected: boolean;
  width: number;
  searchQuery?: string;
  relevanceScore?: number;
  maxScore?: number;
}

function HighlightedText({
  text,
  query,
  color,
  isSelected,
}: {
  text: string;
  query: string;
  color?: string;
  isSelected: boolean;
}) {
  if (!query) {
    return (
      <Text color={isSelected ? "cyan" : color} bold={isSelected}>
        {text}
      </Text>
    );
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;

  let idx = lowerText.indexOf(lowerQuery);
  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push({ text: text.slice(lastIndex, idx), highlight: false });
    }
    parts.push({
      text: text.slice(idx, idx + query.length),
      highlight: true,
    });
    lastIndex = idx + query.length;
    idx = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return (
    <Text>
      {parts.map((part, i) =>
        part.highlight ? (
          <Text key={i} backgroundColor="yellow" color="black" bold>
            {part.text}
          </Text>
        ) : (
          <Text key={i} color={isSelected ? "cyan" : color} bold={isSelected}>
            {part.text}
          </Text>
        ),
      )}
    </Text>
  );
}

const BAR_WIDTH = 8;
const FILLED = "\u2588";
const EMPTY = "\u2591";

function relevanceBar(score: number, maxScore: number): string {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const filled = Math.round(ratio * BAR_WIDTH);
  return FILLED.repeat(filled) + EMPTY.repeat(BAR_WIDTH - filled);
}

export function SessionRow({
  session,
  isSelected,
  width,
  searchQuery,
  relevanceScore,
  maxScore,
}: Props) {
  const hasRelevance =
    relevanceScore !== undefined && maxScore !== undefined && maxScore > 0;
  const barSuffix = hasRelevance
    ? ` ${relevanceBar(relevanceScore!, maxScore!)}`
    : "";
  const effectiveWidth = hasRelevance ? width - BAR_WIDTH - 1 : width;

  const indicator = isSelected ? "\u276f" : " ";
  const time = timeAgo(session.modified);
  const project = extractProjectName(session.projectPath);
  const branch = session.gitBranch ? ` [${session.gitBranch}]` : "";
  const msgs = `${session.messageCount}msg`;

  const timeCol = time.length > 16 ? time.slice(0, 16) : time.padEnd(16);
  const projectCol =
    project.length > 18 ? project.slice(0, 18) : project.padEnd(18);
  const msgsCol = msgs.padStart(6);

  const prefix = `${indicator} ${timeCol} ${projectCol} `;
  const suffix = `${branch} ${msgsCol}`;

  const labelMaxLen = Math.max(10, effectiveWidth - prefix.length - suffix.length);
  const label = truncate(
    session.summary || session.firstPrompt || "(no summary)",
    labelMaxLen,
  );

  // Hard-truncate total line to terminal width
  const fullLine = `${prefix}${label}${suffix}`;
  const line =
    fullLine.length > effectiveWidth
      ? fullLine.slice(0, effectiveWidth)
      : fullLine;

  const prefixEnd = prefix.length;
  const labelEnd = prefixEnd + label.length;

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
      <HighlightedText
        text={timeStr}
        query={searchQuery || ""}
        color="yellow"
        isSelected={isSelected}
      />
      <HighlightedText
        text={projectStr}
        query={searchQuery || ""}
        color="magenta"
        isSelected={isSelected}
      />
      <HighlightedText
        text={labelStr}
        query={searchQuery || ""}
        isSelected={isSelected}
      />
      <HighlightedText
        text={suffixStr}
        query={searchQuery || ""}
        color="gray"
        isSelected={isSelected}
      />
      {hasRelevance && (
        <Text color="green" dimColor={!isSelected}>
          {barSuffix}
        </Text>
      )}
    </Text>
  );
}
