import { Box, Text } from "ink";
import { wrapLines, truncate } from "../utils/format.js";
import type { SessionDisplay } from "../types.js";

const PREVIEW_LINES = 10;

interface Props {
  preview: { lastUser?: string; lastAssistant?: string };
  loading: boolean;
  session?: SessionDisplay;
  matchSnippets?: string[];
  searchQuery?: string;
}

/** Render text with query matches highlighted in yellow.
 *  Multi-word queries highlight each word independently. */
function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  if (!query) return <Text color="gray">{text}</Text>;

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return <Text color="gray">{text}</Text>;

  // Build a list of highlight ranges [start, end) for all term occurrences
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];

  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      ranges.push([idx, idx + term.length]);
      idx = lower.indexOf(term, idx + 1);
    }
  }

  if (ranges.length === 0) return <Text color="gray">{text}</Text>;

  // Merge overlapping ranges
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push(ranges[i]);
    }
  }

  // Build parts from merged ranges
  const parts: { text: string; highlight: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), highlight: false });
    }
    parts.push({ text: text.slice(start, end), highlight: true });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlight: false });
  }

  return (
    <Text>
      {parts.map((part, i) =>
        part.highlight ? (
          <Text key={i} backgroundColor="yellow" color="black" bold>
            {part.text}
          </Text>
        ) : (
          <Text key={i} color="gray">
            {part.text}
          </Text>
        ),
      )}
    </Text>
  );
}

export function PreviewPane({ preview, loading, session, matchSnippets, searchQuery }: Props) {
  const maxWidth = (process.stdout.columns || 80) - 6; // border + padding

  if (loading) {
    return (
      <Box
        borderStyle="single"
        borderColor="gray"
        flexDirection="column"
        paddingX={1}
        height={PREVIEW_LINES + 2}
      >
        <Text color="gray">Loading preview...</Text>
      </Box>
    );
  }

  // Header line: session ID + summary title (takes 1 line)
  const headerLine = session
    ? `${session.sessionId}${session.summary ? "  " + truncate(session.summary, maxWidth - session.sessionId.length - 2) : ""}`
    : "";
  // 1 for header, 1 for blank line after header
  const headerLines = session ? 2 : 0;
  const remainingLines = PREVIEW_LINES - headerLines;

  // Deep search mode: show match snippets with highlighting
  if (matchSnippets && matchSnippets.length > 0) {
    const snippetLines = matchSnippets.slice(0, remainingLines);
    return (
      <Box
        borderStyle="single"
        borderColor="gray"
        flexDirection="column"
        paddingX={1}
        height={PREVIEW_LINES + 2}
      >
        {session && (
          <>
            <Text>
              <Text color="gray">{truncate(headerLine, maxWidth)}</Text>
            </Text>
            <Text> </Text>
          </>
        )}
        {snippetLines.map((snippet, i) => (
          <HighlightedSnippet
            key={i}
            text={truncate(snippet, maxWidth)}
            query={searchQuery || ""}
          />
        ))}
      </Box>
    );
  }

  const hasContent = preview.lastUser || preview.lastAssistant;

  // Allocate lines: 2 for user, rest for assistant
  const userLines = preview.lastUser
    ? wrapLines(preview.lastUser, maxWidth - 5, 2)
    : [];
  const assistantMaxLines =
    remainingLines - userLines.length - (userLines.length > 0 ? 1 : 0);
  const assistantLines = preview.lastAssistant
    ? wrapLines(
        preview.lastAssistant,
        maxWidth - 8,
        Math.max(1, assistantMaxLines),
      )
    : [];

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      flexDirection="column"
      paddingX={1}
      height={PREVIEW_LINES + 2}
    >
      {session && (
        <>
          <Text>
            <Text color="gray">{truncate(headerLine, maxWidth)}</Text>
          </Text>
          <Text> </Text>
        </>
      )}
      {hasContent ? (
        <>
          {userLines.length > 0 && (
            <Box flexDirection="column">
              {userLines.map((line, i) => (
                <Text key={i}>
                  {i === 0 ? (
                    <Text color="green" bold>
                      You:{" "}
                    </Text>
                  ) : (
                    <Text>{"     "}</Text>
                  )}
                  <Text>{line}</Text>
                </Text>
              ))}
            </Box>
          )}
          {userLines.length > 0 && assistantLines.length > 0 && <Text> </Text>}
          {assistantLines.length > 0 && (
            <Box flexDirection="column">
              {assistantLines.map((line, i) => (
                <Text key={i}>
                  {i === 0 ? (
                    <Text color="blue" bold>
                      Claude:{" "}
                    </Text>
                  ) : (
                    <Text>{"        "}</Text>
                  )}
                  <Text>{line}</Text>
                </Text>
              ))}
            </Box>
          )}
        </>
      ) : (
        <Text color="gray">No preview available</Text>
      )}
    </Box>
  );
}

export { PREVIEW_LINES };
