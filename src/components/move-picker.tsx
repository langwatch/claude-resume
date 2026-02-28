import { Box, Text } from "ink";
import { truncate } from "../utils/format.js";

interface Props {
  projectPaths: string[];
  selectedIndex: number;
  maxVisible: number;
  sessionSummary: string;
  currentProjectPath: string;
  typingMode: boolean;
  customPath: string;
}

export function MovePicker({
  projectPaths,
  selectedIndex,
  maxVisible,
  sessionSummary,
  currentProjectPath,
  typingMode,
  customPath,
}: Props) {
  const width = process.stdout.columns || 80;
  const listHeight = maxVisible - 4; // header + instructions + blank + input line

  // Sliding window
  let startIndex = 0;
  if (projectPaths.length > listHeight) {
    startIndex = Math.max(0, selectedIndex - Math.floor(listHeight / 2));
    startIndex = Math.min(startIndex, projectPaths.length - listHeight);
  }

  const visiblePaths = projectPaths.slice(startIndex, startIndex + listHeight);

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="yellow">
          {"Move: "}
        </Text>
        <Text color="gray">{truncate(sessionSummary, width - 8)}</Text>
      </Box>
      <Text color="gray">
        {typingMode
          ? "Type a path (Enter confirm, Esc back to list)"
          : "Select destination (Enter confirm, / type path, Esc cancel)"}
      </Text>
      <Text> </Text>
      {typingMode ? (
        <Box>
          <Text bold color="cyan">
            {"Path: "}
          </Text>
          <Text>{customPath}</Text>
          <Text color="gray">_</Text>
        </Box>
      ) : (
        <Box flexDirection="column" height={listHeight} overflow="hidden">
          {visiblePaths.map((p, i) => {
            const actualIndex = startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const isCurrent = p === currentProjectPath;
            const indicator = isSelected ? "\u276f" : " ";

            return (
              <Text key={p} wrap="truncate">
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {indicator}{" "}
                </Text>
                <Text
                  color={isCurrent ? "gray" : isSelected ? "cyan" : undefined}
                  bold={isSelected}
                  dimColor={isCurrent}
                >
                  {truncate(p, width - 4)}
                </Text>
                {isCurrent && (
                  <Text color="gray"> (current)</Text>
                )}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
