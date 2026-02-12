import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { loadAllSessions } from "./utils/sessions.js";
import { readLastMessages } from "./utils/jsonl-reader.js";
import { deepSearch, extractMatchSnippets } from "./utils/deep-search.js";
import type { SearchResult } from "./utils/deep-search.js";
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

  // Deep search state
  const [deepSearching, setDeepSearching] = useState(false);
  const [deepSearchDone, setDeepSearchDone] = useState(false);
  const [deepResults, setDeepResults] = useState<SearchResult[]>([]);
  const [matchSnippets, setMatchSnippets] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    return sessions.filter((s) => matchesQuery(s, searchQuery));
  }, [sessions, searchQuery]);

  // Determine which session list to display
  const isDeepMode = deepSearching || deepSearchDone;
  const displaySessions = useMemo(
    () => (isDeepMode ? deepResults.map((r) => r.session) : filteredSessions),
    [isDeepMode, deepResults, filteredSessions],
  );

  // Build scores map and max for relevance bars
  const scoresMap = useMemo(() => {
    if (!isDeepMode) return undefined;
    const m = new Map<string, number>();
    for (const r of deepResults) {
      m.set(r.session.sessionId, r.score);
    }
    return m;
  }, [isDeepMode, deepResults]);

  const maxScore = useMemo(() => {
    if (!isDeepMode || deepResults.length === 0) return undefined;
    return deepResults[0]?.score || 0;
  }, [isDeepMode, deepResults]);

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

  // Reset selection when deep results change
  useEffect(() => {
    if (isDeepMode) {
      setSelectedIndex((prev) => Math.min(prev, Math.max(0, deepResults.length - 1)));
    }
  }, [deepResults, isDeepMode]);

  // Derive selected session stably (by ID, not array reference)
  const selectedSession = displaySessions[selectedIndex];
  const selectedSessionId = selectedSession?.sessionId;
  const selectedSessionPath = selectedSession?.fullPath;

  // Load preview when selection changes — keyed by session ID to avoid flicker
  useEffect(() => {
    if (!selectedSessionId || !selectedSessionPath) return;

    // In deep search mode, load match snippets instead
    if (isDeepMode) {
      let cancelled = false;
      setPreviewLoading(true);
      extractMatchSnippets(selectedSessionPath, searchQuery).then((snippets) => {
        if (!cancelled) {
          setMatchSnippets(snippets);
          setPreviewLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    // Normal mode: load last messages
    let cancelled = false;
    setPreviewLoading(true);
    setMatchSnippets([]);
    readLastMessages(selectedSessionPath).then((p) => {
      if (!cancelled) {
        setPreview(p);
        setPreviewLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, isDeepMode, searchQuery]);

  // Start deep search
  const startDeepSearch = useCallback(
    (query: string) => {
      // Cancel any existing search
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      setDeepSearching(true);
      setDeepSearchDone(false);
      setDeepResults([]);
      setMatchSnippets([]);
      setSelectedIndex(0);
      setSearchMode(false);

      deepSearch(
        sessions,
        query,
        (results) => {
          if (!controller.signal.aborted) {
            setDeepResults(results);
          }
        },
        controller.signal,
      ).then(() => {
        if (!controller.signal.aborted) {
          setDeepSearching(false);
          setDeepSearchDone(true);
        }
      });
    },
    [sessions],
  );

  // Cancel deep search and return to normal
  const cancelDeepSearch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDeepSearching(false);
    setDeepSearchDone(false);
    setDeepResults([]);
    setMatchSnippets([]);
    setSearchQuery("");
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(() => {
    const session = displaySessions[selectedIndex];
    if (session) {
      abortRef.current?.abort();
      onSelect({
        sessionId: session.sessionId,
        projectPath: session.projectPath,
      });
      exit();
    }
  }, [displaySessions, selectedIndex, onSelect, exit]);

  useInput((input, key) => {
    // Deep search mode (results displayed, searching or done)
    if (isDeepMode) {
      if (key.escape) {
        cancelDeepSearch();
      } else if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) =>
          Math.min(displaySessions.length - 1, i + 1),
        );
      } else if (key.return) {
        handleSelect();
      }
      return;
    }

    // Live filter search mode
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchQuery("");
      } else if (key.return) {
        // Enter in search mode → trigger deep search
        if (searchQuery) {
          startDeepSearch(searchQuery);
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
      } else if (input === "/") {
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
        deepSearching={deepSearching}
        deepSearchDone={deepSearchDone}
        deepSearchCount={deepResults.length}
      />
      <SessionList
        sessions={displaySessions}
        selectedIndex={selectedIndex}
        maxVisible={maxVisible}
        searchQuery={searchMode || searchQuery ? searchQuery : undefined}
        scores={scoresMap}
        maxScore={maxScore}
      />
      <PreviewPane
        preview={preview}
        loading={previewLoading}
        session={displaySessions[selectedIndex]}
        matchSnippets={isDeepMode ? matchSnippets : undefined}
        searchQuery={searchQuery}
      />
    </Box>
  );
}
