import { useState, useEffect, useCallback, useMemo } from "react";
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

function matchesQuery(session: SessionDisplay, query: string): boolean {
  const q = query.toLowerCase();
  const fields = [
    session.summary,
    session.firstPrompt,
    session.projectName,
    session.projectPath,
    session.gitBranch,
  ];
  return fields.some((f) => f && f.toLowerCase().includes(q));
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
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    return sessions.filter((s) => matchesQuery(s, searchQuery));
  }, [sessions, searchQuery]);

  // Load all sessions on mount
  useEffect(() => {
    loadAllSessions().then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Load preview when selection changes
  useEffect(() => {
    if (filteredSessions.length === 0) return;
    const session = filteredSessions[selectedIndex];
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
  }, [selectedIndex, filteredSessions]);

  const handleSelect = useCallback(() => {
    const session = filteredSessions[selectedIndex];
    if (session) {
      onSelect({
        sessionId: session.sessionId,
        projectPath: session.projectPath,
      });
      exit();
    }
  }, [filteredSessions, selectedIndex, onSelect, exit]);

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchQuery("");
      } else if (key.return) {
        setSearchMode(false);
        if (filteredSessions.length > 0) {
          handleSelect();
        }
      } else if (key.backspace || key.delete) {
        setSearchQuery((q) => {
          const next = q.slice(0, -1);
          if (next === "") setSearchMode(false);
          return next;
        });
      } else if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) =>
          Math.min(filteredSessions.length - 1, i + 1),
        );
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + input);
      }
    } else {
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) =>
          Math.min(filteredSessions.length - 1, i + 1),
        );
      } else if (key.return) {
        handleSelect();
      } else if (input === "/" ) {
        setSearchMode(true);
      } else if (input === "q" || key.escape) {
        exit();
      }
    }
  });

  if (loading) {
    return <Text color="gray">Loading sessions...</Text>;
  }

  if (sessions.length === 0) {
    return <Text color="yellow">No sessions found.</Text>;
  }

  const termRows = process.stdout.rows || 24;
  const maxVisible = Math.max(1, termRows - 16);

  return (
    <Box flexDirection="column" height={termRows} overflow="hidden">
      <Header
        count={filteredSessions.length}
        searchMode={searchMode}
        searchQuery={searchQuery}
        totalCount={sessions.length}
      />
      <SessionList
        sessions={filteredSessions}
        selectedIndex={selectedIndex}
        maxVisible={maxVisible}
        searchQuery={searchMode || searchQuery ? searchQuery : undefined}
      />
      <PreviewPane preview={preview} loading={previewLoading} />
    </Box>
  );
}
