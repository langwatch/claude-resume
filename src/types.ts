export interface SessionIndexEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary?: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
}

export interface SessionsIndex {
  version: number;
  entries: SessionIndexEntry[];
  originalPath?: string;
}

export interface SessionDisplay {
  sessionId: string;
  fullPath: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: Date;
  modified: Date;
  gitBranch: string;
  projectPath: string;
  projectName: string;
  isSidechain: boolean;
}

export interface ContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface JsonlMessage {
  type: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
}
