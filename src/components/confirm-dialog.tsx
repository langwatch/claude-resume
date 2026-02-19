import { Box, Text } from "ink";

interface Props {
  title: string;
  message: string;
  selectedButton: number; // 0 = Confirm, 1 = Cancel
}

export function ConfirmDialog({ title, message, selectedButton }: Props) {
  const width = process.stdout.columns || 80;
  const termRows = process.stdout.rows || 24;

  const boxWidth = Math.min(60, width - 4);
  const topPad = Math.max(0, Math.floor((termRows - 8) / 2));

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      height={termRows}
      width={width}
    >
      <Box height={topPad} />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
        width={boxWidth}
      >
        <Text bold color="yellow">
          {title}
        </Text>
        <Text color="gray">{message}</Text>
        <Text> </Text>
        <Box gap={2}>
          <Text
            color={selectedButton === 0 ? "black" : "gray"}
            backgroundColor={selectedButton === 0 ? "green" : undefined}
            bold={selectedButton === 0}
          >
            {" Confirm "}
          </Text>
          <Text
            color={selectedButton === 1 ? "black" : "gray"}
            backgroundColor={selectedButton === 1 ? "red" : undefined}
            bold={selectedButton === 1}
          >
            {" Cancel "}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
