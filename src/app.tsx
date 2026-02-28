import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { loadAllSessions } from "./utils/sessions.js";
import { readLastMessages } from "./utils/jsonl-reader.js";
import { deepSearch, extractMatchSnippets } from "./utils/deep-search.js";
import type { SearchResult } from "./utils/deep-search.js";
import { forkSession, loadConversationTurns, checkpointSession, moveSession, getUniqueProjectPaths } from "./utils/session-ops.js";
import { SessionList } from "./components/session-list.js";
import { PreviewPane } from "./components/preview-pane.js";
import { Header } from "./components/header.js";
import { CheckpointView } from "./components/checkpoint-view.js";
import { ConfirmDialog } from "./components/confirm-dialog.js";
import { MovePicker } from "./components/move-picker.js";
import { ACTIONS } from "./components/action-menu.js";
import type { SessionDisplay, ConversationTurn, AppMode } from "./types.js";

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
  // -1 = search bar focused, 0+ = session in list
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [preview, setPreview] = useState<{
    lastUser?: string;
    lastAssistant?: string;
  }>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Deep search state
  const [deepSearching, setDeepSearching] = useState(false);
  const [deepSearchDone, setDeepSearchDone] = useState(false);
  const [deepResults, setDeepResults] = useState<SearchResult[]>([]);
  const [matchSnippets, setMatchSnippets] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Action menu / fork / checkpoint state
  const [mode, setMode] = useState<AppMode>("browse");
  const [actionMenuIndex, setActionMenuIndex] = useState(0);
  const [checkpointTurns, setCheckpointTurns] = useState<ConversationTurn[]>([]);
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [checkpointSessionState, setCheckpointSessionState] = useState<SessionDisplay | null>(null);
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [confirmSelected, setConfirmSelected] = useState(1); // 0=Confirm, 1=Cancel (default Cancel)
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Move state
  const [moveTargetIndex, setMoveTargetIndex] = useState(0);
  const [moveTypingMode, setMoveTypingMode] = useState(false);
  const [moveCustomPath, setMoveCustomPath] = useState("");
  const [moveTargetPath, setMoveTargetPath] = useState("");

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    return sessions.filter((s) => matchesQuery(s, searchQuery));
  }, [sessions, searchQuery]);

  // Unique project paths for move picker
  const uniqueProjectPaths = useMemo(
    () => getUniqueProjectPaths(sessions),
    [sessions],
  );

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

  // When search query changes, go back to search bar
  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchQuery]);

  // Clamp selection when deep results change
  useEffect(() => {
    if (isDeepMode && selectedIndex >= 0) {
      setSelectedIndex((prev) => Math.min(prev, Math.max(0, deepResults.length - 1)));
    }
  }, [deepResults, isDeepMode]);

  // Derive selected session stably (by ID, not array reference)
  const inSearchBar = selectedIndex === -1;
  const listIndex = inSearchBar ? -1 : selectedIndex;
  const selectedSession = listIndex >= 0 ? displaySessions[listIndex] : undefined;
  const selectedSessionId = selectedSession?.sessionId;
  const selectedSessionPath = selectedSession?.fullPath;

  // Load preview when selection changes — keyed by session ID to avoid flicker
  useEffect(() => {
    if (!selectedSessionId || !selectedSessionPath) {
      setPreviewLoading(false);
      return;
    }

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
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      setDeepSearching(true);
      setDeepSearchDone(false);
      setDeepResults([]);
      setMatchSnippets([]);
      setSelectedIndex(-1);

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
    setSelectedIndex(-1);
  }, []);

  const showStatus = useCallback((msg: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  const resetMode = useCallback(() => {
    setMode("browse");
    setActionMenuIndex(0);
    setCheckpointTurns([]);
    setCheckpointIndex(0);
    setCheckpointSessionState(null);
    setCheckpointLoading(false);
    setConfirmSelected(1);
    setMoveTargetIndex(0);
    setMoveTypingMode(false);
    setMoveCustomPath("");
    setMoveTargetPath("");
  }, []);

  const reloadSessions = useCallback(() => {
    loadAllSessions().then((s) => setSessions(s));
  }, []);

  const enterCheckpointMode = useCallback((session: SessionDisplay) => {
    setCheckpointSessionState(session);
    setCheckpointLoading(true);
    setMode("checkpoint");
    loadConversationTurns(session.fullPath).then((turns) => {
      setCheckpointTurns(turns);
      setCheckpointIndex(turns.length - 1);
      setCheckpointLoading(false);
    });
  }, []);

  const executeFork = useCallback(() => {
    const session = displaySessions[selectedIndex];
    if (!session) return;
    forkSession(session.fullPath)
      .then((newId) => {
        showStatus(`Forked! New session: ${newId.slice(0, 8)}...`);
        reloadSessions();
        resetMode();
      })
      .catch((err: Error) => {
        showStatus(`Fork failed: ${err.message}`);
        resetMode();
      });
  }, [displaySessions, selectedIndex, showStatus, reloadSessions, resetMode]);

  const executeCheckpoint = useCallback(() => {
    const turn = checkpointTurns[checkpointIndex];
    const session = checkpointSessionState;
    if (!turn || !session) return;
    checkpointSession(session.fullPath, turn)
      .then(() => {
        showStatus(`Checkpointed to turn ${turn.index + 1}. Backup saved.`);
        reloadSessions();
        resetMode();
      })
      .catch((err: Error) => {
        showStatus(`Checkpoint failed: ${err.message}`);
        resetMode();
      });
  }, [checkpointTurns, checkpointIndex, checkpointSessionState, showStatus, reloadSessions, resetMode]);

  const enterMoveMode = useCallback(() => {
    setMoveTargetIndex(0);
    setMoveTypingMode(false);
    setMoveCustomPath("");
    setMoveTargetPath("");
    setMode("moveSession");
  }, []);

  const executeMove = useCallback(() => {
    const session = displaySessions[selectedIndex];
    if (!session || !moveTargetPath) return;
    moveSession(session.fullPath, moveTargetPath)
      .then(() => {
        showStatus(`Moved to ${moveTargetPath}`);
        reloadSessions();
        resetMode();
      })
      .catch((err: Error) => {
        showStatus(`Move failed: ${err.message}`);
        resetMode();
      });
  }, [displaySessions, selectedIndex, moveTargetPath, showStatus, reloadSessions, resetMode]);

  const handleSelect = useCallback(() => {
    if (selectedIndex < 0) return;
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
    // Move session: project picker
    if (mode === "moveSession") {
      if (key.escape) {
        if (moveTypingMode) {
          setMoveTypingMode(false);
          setMoveCustomPath("");
        } else {
          resetMode();
        }
        return;
      }
      if (moveTypingMode) {
        if (key.return && moveCustomPath.trim()) {
          setMoveTargetPath(moveCustomPath.trim());
          setConfirmSelected(1);
          setMode("confirmMove");
        } else if (key.backspace || key.delete) {
          setMoveCustomPath((p) => p.slice(0, -1));
        } else if (input && !key.ctrl && !key.meta) {
          setMoveCustomPath((p) => p + input);
        }
        return;
      }
      // List mode
      if (input === "/" || input === "t") {
        setMoveTypingMode(true);
        return;
      }
      if (key.downArrow) {
        setMoveTargetIndex((i) => Math.min(uniqueProjectPaths.length - 1, i + 1));
        return;
      }
      if (key.upArrow) {
        setMoveTargetIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.return) {
        const targetPath = uniqueProjectPaths[moveTargetIndex];
        if (targetPath) {
          setMoveTargetPath(targetPath);
          setConfirmSelected(1);
          setMode("confirmMove");
        }
        return;
      }
      return;
    }

    // Confirm move dialog
    if (mode === "confirmMove") {
      if (key.escape || input === "n" || input === "N") {
        setMode("moveSession");
        setConfirmSelected(1);
        return;
      }
      if (input === "y" || input === "Y") {
        executeMove();
        return;
      }
      if (key.return) {
        if (confirmSelected === 0) {
          executeMove();
        } else {
          setMode("moveSession");
        }
        setConfirmSelected(1);
        return;
      }
      if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow || key.tab) {
        setConfirmSelected((s) => (s === 0 ? 1 : 0));
        return;
      }
      return;
    }

    // Confirm dialog mode (fork or checkpoint)
    if (mode === "confirmFork" || mode === "confirmCheckpoint") {
      if (key.escape || input === "n" || input === "N") {
        if (mode === "confirmCheckpoint") {
          setMode("checkpoint");
        } else {
          resetMode();
        }
        setConfirmSelected(1);
        return;
      }
      if (input === "y" || input === "Y") {
        if (mode === "confirmFork") executeFork();
        else executeCheckpoint();
        return;
      }
      if (key.return) {
        if (confirmSelected === 0) {
          if (mode === "confirmFork") executeFork();
          else executeCheckpoint();
        } else {
          if (mode === "confirmCheckpoint") {
            setMode("checkpoint");
          } else {
            resetMode();
          }
        }
        setConfirmSelected(1);
        return;
      }
      if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow || key.tab) {
        setConfirmSelected((s) => (s === 0 ? 1 : 0));
        return;
      }
      return;
    }

    // Checkpoint turn selection mode
    if (mode === "checkpoint") {
      if (key.escape) {
        resetMode();
        return;
      }
      if (key.downArrow) {
        setCheckpointIndex((i) => Math.min(checkpointTurns.length - 1, i + 1));
        return;
      }
      if (key.upArrow) {
        setCheckpointIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.return && checkpointTurns.length > 0) {
        setConfirmSelected(1);
        setMode("confirmCheckpoint");
        return;
      }
      return;
    }

    // Action menu mode
    if (mode === "actionMenu") {
      if (key.escape) {
        resetMode();
        return;
      }
      if (key.downArrow) {
        setActionMenuIndex((i) => Math.min(ACTIONS.length - 1, i + 1));
        return;
      }
      if (key.upArrow) {
        setActionMenuIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.leftArrow) {
        resetMode();
        return;
      }
      if (key.return) {
        const action = ACTIONS[actionMenuIndex];
        if (action === "Fork") {
          setConfirmSelected(1);
          setMode("confirmFork");
        } else if (action === "Checkpoint") {
          const session = displaySessions[selectedIndex];
          if (session) enterCheckpointMode(session);
        } else if (action === "Move") {
          enterMoveMode();
        }
        return;
      }
      return;
    }

    // Deep search mode
    if (isDeepMode) {
      if (key.escape) {
        cancelDeepSearch();
      } else if (key.downArrow) {
        setSelectedIndex((i) =>
          Math.min(displaySessions.length - 1, i + 1),
        );
      } else if (key.upArrow) {
        setSelectedIndex((i) => Math.max(-1, i - 1));
      } else if (key.return) {
        if (inSearchBar) {
          if (searchQuery) startDeepSearch(searchQuery);
        } else {
          handleSelect();
        }
      } else if (key.rightArrow && selectedIndex >= 0) {
        setActionMenuIndex(0);
        setMode("actionMenu");
      } else if (input === "f" && selectedIndex >= 0) {
        setConfirmSelected(1);
        setMode("confirmFork");
      } else if (input === "c" && selectedIndex >= 0) {
        const session = displaySessions[selectedIndex];
        if (session) enterCheckpointMode(session);
      } else if (input === "m" && selectedIndex >= 0) {
        enterMoveMode();
      } else if (inSearchBar) {
        if (key.backspace || key.delete) {
          setSearchQuery((q) => q.slice(0, -1));
          cancelDeepSearch();
        } else if (input && !key.ctrl && !key.meta) {
          cancelDeepSearch();
          setSearchQuery((q) => q + input);
        }
      }
      return;
    }

    // Normal / search bar mode
    if (key.escape) {
      if (searchQuery) {
        setSearchQuery("");
        setSelectedIndex(-1);
      } else {
        exit();
      }
    } else if (key.downArrow) {
      setSelectedIndex((i) =>
        Math.min(displaySessions.length - 1, i + 1),
      );
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(-1, i - 1));
    } else if (key.return) {
      if (inSearchBar) {
        // Enter in search bar → deep search
        if (searchQuery) {
          startDeepSearch(searchQuery);
        }
      } else {
        handleSelect();
      }
    } else if (key.rightArrow && selectedIndex >= 0) {
      setActionMenuIndex(0);
      setMode("actionMenu");
    } else if (input === "f" && selectedIndex >= 0) {
      setConfirmSelected(1);
      setMode("confirmFork");
    } else if (input === "c" && selectedIndex >= 0) {
      const session = displaySessions[selectedIndex];
      if (session) enterCheckpointMode(session);
    } else if (input === "m" && selectedIndex >= 0) {
      enterMoveMode();
    } else if (key.backspace || key.delete) {
      setSearchQuery((q) => q.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      // Any printable char → type into search
      setSearchQuery((q) => q + input);
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

  // Confirm dialog overlays
  if (mode === "confirmFork") {
    const session = displaySessions[selectedIndex];
    return (
      <ConfirmDialog
        title="Fork session?"
        message={`This will duplicate the session${session ? `: ${session.summary.slice(0, 60)}` : ""}`}
        selectedButton={confirmSelected}
      />
    );
  }

  if (mode === "confirmCheckpoint") {
    const turn = checkpointTurns[checkpointIndex];
    return (
      <ConfirmDialog
        title={`Truncate after turn ${turn ? turn.index + 1 : 0}?`}
        message={`Keep turns 1-${turn ? turn.index + 1 : 0}, delete turns ${turn ? turn.index + 2 : 0}-${checkpointTurns.length}. A .bkp backup will be saved.`}
        selectedButton={confirmSelected}
      />
    );
  }

  // Confirm move dialog
  if (mode === "confirmMove") {
    return (
      <ConfirmDialog
        title="Move session?"
        message={`Move to: ${moveTargetPath}`}
        selectedButton={confirmSelected}
      />
    );
  }

  // Move picker
  if (mode === "moveSession") {
    const session = displaySessions[selectedIndex];
    return (
      <Box flexDirection="column" height={termRows} overflow="hidden">
        <MovePicker
          projectPaths={uniqueProjectPaths}
          selectedIndex={moveTargetIndex}
          maxVisible={termRows - 2}
          sessionSummary={session?.summary || ""}
          currentProjectPath={session?.projectPath || ""}
          typingMode={moveTypingMode}
          customPath={moveCustomPath}
        />
      </Box>
    );
  }

  // Checkpoint view
  if (mode === "checkpoint") {
    return (
      <Box flexDirection="column" height={termRows} overflow="hidden">
        {checkpointLoading ? (
          <Text color="gray">Loading conversation turns...</Text>
        ) : (
          <CheckpointView
            turns={checkpointTurns}
            selectedIndex={checkpointIndex}
            maxVisible={termRows - 2}
            sessionSummary={checkpointSessionState?.summary || ""}
          />
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termRows} overflow="hidden">
      <Header
        count={filteredSessions.length}
        searchMode={inSearchBar}
        searchQuery={searchQuery}
        totalCount={sessions.length}
        deepSearching={deepSearching}
        deepSearchDone={deepSearchDone}
        deepSearchCount={deepResults.length}
        statusMessage={statusMessage || undefined}
        sessionFocused={selectedIndex >= 0}
      />
      <SessionList
        sessions={displaySessions}
        selectedIndex={selectedIndex}
        maxVisible={maxVisible}
        searchQuery={searchQuery || undefined}
        scores={scoresMap}
        maxScore={maxScore}
        showActionMenu={mode === "actionMenu"}
        actionMenuIndex={actionMenuIndex}
      />
      <PreviewPane
        preview={preview}
        loading={previewLoading}
        session={selectedSession}
        matchSnippets={isDeepMode ? matchSnippets : undefined}
        searchQuery={searchQuery}
      />
    </Box>
  );
}
