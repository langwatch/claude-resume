import { Box, Text } from "ink";

interface Props {
  count: number;
}

export function Header({ count }: Props) {
  return (
    <Box>
      <Text bold color="cyan">
        claude-resume
      </Text>
      <Text color="gray">
        {" "}
        — {count} sessions (↑↓ navigate, Enter resume, q quit)
      </Text>
    </Box>
  );
}
