import { Box, Text } from "ink";
import { wrapLines } from "../utils/format.js";

const PREVIEW_LINES = 10;

interface Props {
  preview: { lastUser?: string; lastAssistant?: string };
  loading: boolean;
}

export function PreviewPane({ preview, loading }: Props) {
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

  // Allocate lines: 2 for user, rest for assistant
  const userLines = preview.lastUser
    ? wrapLines(preview.lastUser, maxWidth - 5, 2)
    : [];
  const assistantMaxLines = PREVIEW_LINES - userLines.length - (userLines.length > 0 ? 1 : 0);
  const assistantLines = preview.lastAssistant
    ? wrapLines(preview.lastAssistant, maxWidth - 8, Math.max(1, assistantMaxLines))
    : [];

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      flexDirection="column"
      paddingX={1}
      height={PREVIEW_LINES + 2}
    >
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
