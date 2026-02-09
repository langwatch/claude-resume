import { Box, Text } from "ink";
import { wrapLines, truncate } from "../utils/format.js";
import type { SessionDisplay } from "../types.js";

const PREVIEW_LINES = 10;

interface Props {
  preview: { lastUser?: string; lastAssistant?: string };
  loading: boolean;
  session?: SessionDisplay;
}

export function PreviewPane({ preview, loading, session }: Props) {
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

  const hasContent = preview.lastUser || preview.lastAssistant;

  // Header line: session ID + summary title (takes 1 line)
  const headerLine = session
    ? `${session.sessionId}${session.summary ? "  " + truncate(session.summary, maxWidth - session.sessionId.length - 2) : ""}`
    : "";
  // 1 for header, 1 for blank line after header
  const headerLines = session ? 2 : 0;
  const remainingLines = PREVIEW_LINES - headerLines;

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
