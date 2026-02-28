import { Box, Text } from "ink";

const ACTIONS = ["Fork", "Checkpoint", "Move"] as const;
export type ActionType = (typeof ACTIONS)[number];

interface Props {
  selectedIndex: number;
}

export function ActionMenu({ selectedIndex }: Props) {
  return (
    <Box flexDirection="column" paddingLeft={4}>
      {ACTIONS.map((action, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Text key={action} color={isSelected ? "cyan" : "gray"} bold={isSelected}>
            {isSelected ? "\u276f " : "  "}
            {action}
          </Text>
        );
      })}
    </Box>
  );
}

export { ACTIONS };
