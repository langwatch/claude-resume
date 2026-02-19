import { Box, Text } from "ink";
import type { ConversationTurn } from "../types.js";
import { truncate } from "../utils/format.js";

interface Props {
  turns: ConversationTurn[];
  selectedIndex: number;
  maxVisible: number;
  sessionSummary: string;
}

export function CheckpointView({
  turns,
  selectedIndex,
  maxVisible,
  sessionSummary,
}: Props) {
  const width = process.stdout.columns || 80;
  const listHeight = maxVisible - 3; // header + instructions + blank line

  // Sliding window (same pattern as SessionList)
  let startIndex = 0;
  if (turns.length > listHeight) {
    startIndex = Math.max(0, selectedIndex - Math.floor(listHeight / 2));
    startIndex = Math.min(startIndex, turns.length - listHeight);
  }

  const visibleTurns = turns.slice(startIndex, startIndex + listHeight);

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="yellow">
          {"Checkpoint: "}
        </Text>
        <Text color="gray">{truncate(sessionSummary, width - 14)}</Text>
      </Box>
      <Text color="gray">
        Select a turn to keep up to. Everything after will be removed. (Enter
        confirm, Esc cancel)
      </Text>
      <Text> </Text>
      <Box flexDirection="column" height={listHeight} overflow="hidden">
        {visibleTurns.map((turn, i) => {
          const actualIndex = startIndex + i;
          const isSelected = actualIndex === selectedIndex;
          const indicator = isSelected ? "\u276f" : " ";
          const roleColor = turn.role === "user" ? "green" : "blue";
          const roleLabel =
            turn.role === "user" ? "You:    " : "Claude: ";
          const turnNum = String(turn.index + 1).padStart(3);
          const maxPreview = width - 18;

          return (
            <Text key={turn.lineNumber} wrap="truncate">
              <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                {indicator} {turnNum}{" "}
              </Text>
              <Text color={isSelected ? "cyan" : roleColor} bold={isSelected}>
                {roleLabel}
              </Text>
              <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                {truncate(turn.textPreview, maxPreview)}
              </Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
