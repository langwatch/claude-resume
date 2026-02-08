import { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { loadAllSessions } from "./utils/sessions.js";
import { readLastMessages } from "./utils/jsonl-reader.js";
import { SessionList } from "./components/session-list.js";
import { PreviewPane } from "./components/preview-pane.js";
import { Header } from "./components/header.js";
import type { SessionDisplay } from "./types.js";

export interface SessionSelection {
  sessionId: string;
  projectPath: string;
}

interface Props {
  onSelect: (selection: SessionSelection) => void;
}

export function App({ onSelect }: Props) {
  const { exit } = useApp();
  const [sessions, setSessions] = useState<SessionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [preview, setPreview] = useState<{
    lastUser?: string;
    lastAssistant?: string;
  }>({});
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load all sessions on mount
  useEffect(() => {
    loadAllSessions().then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  // Load preview when selection changes
  useEffect(() => {
    if (sessions.length === 0) return;
    const session = sessions[selectedIndex];
    if (!session) return;

    let cancelled = false;
    setPreviewLoading(true);
    readLastMessages(session.fullPath).then((p) => {
      if (!cancelled) {
        setPreview(p);
        setPreviewLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedIndex, sessions]);

  const handleSelect = useCallback(() => {
    const session = sessions[selectedIndex];
    if (session) {
      onSelect({ sessionId: session.sessionId, projectPath: session.projectPath });
      exit();
    }
  }, [sessions, selectedIndex, onSelect, exit]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(sessions.length - 1, i + 1));
    } else if (key.return) {
      handleSelect();
    } else if (input === "q" || key.escape) {
      exit();
    }
  });

  if (loading) {
    return <Text color="gray">Loading sessions...</Text>;
  }

  if (sessions.length === 0) {
    return <Text color="yellow">No sessions found.</Text>;
  }

  // Reserve lines for header (1) + preview pane (10 + 2 border = 12) + terminal chrome buffer (3)
  const termRows = process.stdout.rows || 24;
  const maxVisible = Math.max(1, termRows - 16);

  return (
    <Box flexDirection="column" height={termRows} overflow="hidden">
      <Header count={sessions.length} />
      <SessionList
        sessions={sessions}
        selectedIndex={selectedIndex}
        maxVisible={maxVisible}
      />
      <PreviewPane preview={preview} loading={previewLoading} />
    </Box>
  );
}
