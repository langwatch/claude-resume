import { Box, Text } from "ink";

interface Props {
  count: number;
  searchMode: boolean;
  searchQuery: string;
  totalCount: number;
  deepSearching?: boolean;
  deepSearchDone?: boolean;
  deepSearchCount?: number;
}

export function Header({
  count,
  searchMode,
  searchQuery,
  totalCount,
  deepSearching,
  deepSearchDone,
  deepSearchCount,
}: Props) {
  if (deepSearching) {
    return (
      <Box>
        <Text bold color="green">
          Searching "{searchQuery}"...
        </Text>
        <Text color="gray">
          {" "}
          — {deepSearchCount || 0} results (Esc to cancel)
        </Text>
      </Box>
    );
  }

  if (deepSearchDone) {
    return (
      <Box>
        <Text bold color="green">
          "{searchQuery}"
        </Text>
        <Text color="gray">
          {" "}
          — {deepSearchCount || 0} results (↓ to browse, Esc to clear)
        </Text>
      </Box>
    );
  }

  if (searchMode && searchQuery) {
    return (
      <Box>
        <Text bold color="yellow">
          {searchQuery}
        </Text>
        <Text color="gray">
          {" "}
          — {count}/{totalCount} matches (↓ to browse, Enter to deep search, Esc
          to clear)
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
        — {totalCount} sessions (type to search, ↑↓ navigate, Enter resume, Esc
        quit)
      </Text>
    </Box>
  );
}
