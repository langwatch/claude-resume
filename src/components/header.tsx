import { Box, Text } from "ink";

interface Props {
  count: number;
  searchMode: boolean;
  searchQuery: string;
  totalCount: number;
}

export function Header({ count, searchMode, searchQuery, totalCount }: Props) {
  if (searchMode) {
    return (
      <Box>
        <Text bold color="yellow">
          /{searchQuery}
        </Text>
        <Text color="gray">
          {" "}
          — {count}/{totalCount} matches (Esc to clear)
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text bold color="cyan">
        claude-resume
      </Text>
      <Text color="gray">
        {" "}
        — {count} sessions (↑↓ navigate, / search, Enter resume, q quit)
      </Text>
    </Box>
  );
}
