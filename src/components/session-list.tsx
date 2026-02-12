import { Box } from "ink";
import { SessionRow } from "./session-row.js";
import type { SessionDisplay } from "../types.js";

interface Props {
  sessions: SessionDisplay[];
  selectedIndex: number;
  maxVisible: number;
  searchQuery?: string;
  scores?: Map<string, number>;
  maxScore?: number;
}

export function SessionList({ sessions, selectedIndex, maxVisible, searchQuery, scores, maxScore }: Props) {
  // Calculate sliding window
  let startIndex = 0;
  if (selectedIndex >= startIndex + maxVisible) {
    startIndex = selectedIndex - maxVisible + 1;
  }
  // Keep selected in view when scrolling up
  if (selectedIndex < startIndex) {
    startIndex = selectedIndex;
  }

  // Center the selection when deep in the list
  if (sessions.length > maxVisible) {
    startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
    startIndex = Math.min(startIndex, sessions.length - maxVisible);
  }

  const visibleSessions = sessions.slice(startIndex, startIndex + maxVisible);
  const width = process.stdout.columns || 80;

  return (
    <Box flexDirection="column" height={maxVisible} overflow="hidden">
      {visibleSessions.map((session, i) => (
        <SessionRow
          key={session.sessionId}
          session={session}
          isSelected={startIndex + i === selectedIndex}
          width={width}
          searchQuery={searchQuery}
          relevanceScore={scores?.get(session.sessionId)}
          maxScore={maxScore}
        />
      ))}
    </Box>
  );
}
