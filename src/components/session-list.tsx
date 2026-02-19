import { Box } from "ink";
import { SessionRow } from "./session-row.js";
import { ActionMenu } from "./action-menu.js";
import type { SessionDisplay } from "../types.js";

interface Props {
  sessions: SessionDisplay[];
  selectedIndex: number;
  maxVisible: number;
  searchQuery?: string;
  scores?: Map<string, number>;
  maxScore?: number;
  showActionMenu?: boolean;
  actionMenuIndex?: number;
}

export function SessionList({ sessions, selectedIndex, maxVisible, searchQuery, scores, maxScore, showActionMenu, actionMenuIndex }: Props) {
  // selectedIndex can be -1 (search bar focused) — treat as top of list
  const effectiveIndex = Math.max(0, selectedIndex);

  // When action menu is open, it takes 2 extra rows
  const menuRows = showActionMenu ? 2 : 0;
  const sessionSlots = Math.max(1, maxVisible - menuRows);

  // Calculate sliding window
  let startIndex = 0;
  if (effectiveIndex >= startIndex + sessionSlots) {
    startIndex = effectiveIndex - sessionSlots + 1;
  }

  // Center the selection when deep in the list
  if (sessions.length > sessionSlots) {
    startIndex = Math.max(0, effectiveIndex - Math.floor(sessionSlots / 2));
    startIndex = Math.min(startIndex, sessions.length - sessionSlots);
  }

  const visibleSessions = sessions.slice(startIndex, startIndex + sessionSlots);
  const width = process.stdout.columns || 80;

  return (
    <Box flexDirection="column" height={maxVisible} overflow="hidden">
      {visibleSessions.map((session, i) => {
        const absoluteIndex = startIndex + i;
        const isSelected = absoluteIndex === selectedIndex;
        return (
          <Box key={session.sessionId} flexDirection="column">
            <SessionRow
              session={session}
              isSelected={isSelected}
              width={width}
              searchQuery={searchQuery}
              relevanceScore={scores?.get(session.sessionId)}
              maxScore={maxScore}
            />
            {isSelected && showActionMenu && (
              <ActionMenu selectedIndex={actionMenuIndex ?? 0} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
