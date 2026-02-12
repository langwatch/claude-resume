import * as fs from "node:fs";
import * as readline from "node:readline";
import { tokenize, termFrequencies, computeIDF, scoreBM25 } from "./bm25.js";
import type { SessionDisplay } from "../types.js";

export interface SearchResult {
  session: SessionDisplay;
  score: number;
}

/**
 * Check if a doc token matches any query term.
 * Supports exact match and prefix match (query is prefix of token or
 * token is prefix of query), so "traceDetail" matches "tracedetails".
 * Returns the matched query term, or undefined.
 */
function matchTerm(token: string, queryTerms: string[]): string | undefined {
  for (const qt of queryTerms) {
    if (token === qt || token.startsWith(qt) || qt.startsWith(token)) {
      return qt;
    }
  }
  return undefined;
}

/** Mild recency boost: recent sessions get up to 30% score increase, decays over 30 days */
function recencyBoost(modified: Date): number {
  const daysSince = (Date.now() - modified.getTime()) / (1000 * 60 * 60 * 24);
  return 1 + 0.3 * Math.max(0, 1 - daysSince / 30);
}

/**
 * Stream-search through .jsonl files using BM25 scoring.
 * Processes sessions newest-first, calling onResult with accumulated
 * sorted results after each session is scored.
 */
export async function deepSearch(
  sessions: SessionDisplay[],
  query: string,
  onResult: (results: SearchResult[]) => void,
  signal: AbortSignal,
): Promise<void> {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return;

  // Phase 1: Estimate IDF from session metadata (fast)
  const docFreq = new Map<string, number>();
  for (const s of sessions) {
    const metaText = `${s.summary} ${s.firstPrompt}`;
    const tokens = new Set(tokenize(metaText));
    for (const term of queryTerms) {
      if (tokens.has(term)) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }
  }
  let idf = computeIDF(queryTerms, docFreq, sessions.length);

  // Phase 2: Stream through .jsonl files, score each
  const results: SearchResult[] = [];
  const fullDocFreq = new Map<string, number>();
  let totalDocLen = 0;
  let docsProcessed = 0;

  for (const session of sessions) {
    if (signal.aborted) return;

    const { tokens: docTokens, length: docLen } = await extractSessionTokens(
      session.fullPath,
      queryTerms,
      signal,
    );
    if (signal.aborted) return;

    docsProcessed++;
    totalDocLen += docLen;

    // Update document frequencies for IDF refinement
    const uniqueTerms = new Set(docTokens);
    for (const term of queryTerms) {
      if (uniqueTerms.has(term)) {
        fullDocFreq.set(term, (fullDocFreq.get(term) || 0) + 1);
      }
    }

    const tf = termFrequencies(docTokens);
    const avgDocLen = totalDocLen / docsProcessed;
    const rawScore = scoreBM25(queryTerms, tf, docLen, avgDocLen, idf);
    const score = rawScore * recencyBoost(session.modified);

    if (score > 0) {
      results.push({ session, score });
      results.sort((a, b) => b.score - a.score);
      onResult([...results]);
    }
  }

  // Final re-rank with accurate IDF from full corpus
  if (results.length > 0 && !signal.aborted) {
    idf = computeIDF(queryTerms, fullDocFreq, docsProcessed);
    const avgDocLen = totalDocLen / docsProcessed;

    for (const r of results) {
      const { tokens, length } = await extractSessionTokens(
        r.session.fullPath,
        queryTerms,
        signal,
      );
      if (signal.aborted) return;
      const tf = termFrequencies(tokens);
      const rawScore = scoreBM25(queryTerms, tf, length, avgDocLen, idf);
      r.score = rawScore * recencyBoost(r.session.modified);
    }
    results.sort((a, b) => b.score - a.score);
    onResult([...results]);
  }
}

/**
 * Extract match context snippets from a .jsonl session file.
 * Returns text snippets around matching terms for display in preview.
 */
export async function extractMatchSnippets(
  filePath: string,
  query: string,
  maxSnippets = 8,
): Promise<string[]> {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const snippets: string[] = [];

  return new Promise((resolve) => {
    let stream: fs.ReadStream;
    try {
      stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    } catch {
      resolve([]);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (snippets.length >= maxSnippets) {
        rl.close();
        stream.destroy();
        return;
      }

      if (
        !line.includes('"type":"user"') &&
        !line.includes('"type":"assistant"')
      ) {
        return;
      }

      try {
        const obj = JSON.parse(line);
        if (obj.type !== "user" && obj.type !== "assistant") return;
        const content = obj.message?.content;
        if (!content) return;

        let text: string;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text?: string }) => b.text || "")
            .join(" ");
        } else {
          return;
        }

        // Check if any query term appears (with prefix matching)
        const lower = text.toLowerCase();
        for (const qt of queryTerms) {
          const idx = lower.indexOf(qt);
          if (idx === -1) continue;

          // Extract snippet: ~40 chars before and after match
          const start = Math.max(0, idx - 40);
          const end = Math.min(text.length, idx + qt.length + 60);
          const prefix = start > 0 ? "..." : "";
          const suffix = end < text.length ? "..." : "";
          const role = obj.type === "user" ? "You" : "Claude";
          snippets.push(
            `${role}: ${prefix}${text.slice(start, end).replace(/\n/g, " ")}${suffix}`,
          );
          break; // one snippet per message
        }
      } catch {
        // skip
      }
    });

    rl.on("close", () => resolve(snippets));
    rl.on("error", () => resolve([]));
  });
}

/**
 * Extract only relevant tokens from a .jsonl session file.
 * Streams the file line-by-line, only parsing user/assistant messages.
 * Supports prefix matching: "traceDetail" matches "tracedetails".
 */
async function extractSessionTokens(
  filePath: string,
  queryTerms: string[],
  signal: AbortSignal,
): Promise<{ tokens: string[]; length: number }> {
  const tokens: string[] = [];
  let wordCount = 0;

  return new Promise((resolve) => {
    let stream: fs.ReadStream;
    try {
      stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    } catch {
      resolve({ tokens: [], length: 0 });
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const onAbort = () => {
      rl.close();
      stream.destroy();
    };
    signal.addEventListener("abort", onAbort, { once: true });

    rl.on("line", (line) => {
      // Fast string check — skip lines that aren't user/assistant messages.
      // The "type" field may not be the first key (lines often start with
      // "parentUuid"), so check with includes rather than startsWith.
      if (
        !line.includes('"type":"user"') &&
        !line.includes('"type":"assistant"')
      ) {
        return;
      }

      try {
        const obj = JSON.parse(line);
        if (obj.type !== "user" && obj.type !== "assistant") return;
        const content = obj.message?.content;
        if (!content) return;

        let text: string;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text?: string }) => b.text || "")
            .join(" ");
        } else {
          return;
        }

        // Tokenize and count, with prefix matching
        const docTokens = text
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 1);

        wordCount += docTokens.length;
        for (const t of docTokens) {
          const matched = matchTerm(t, queryTerms);
          if (matched) {
            tokens.push(matched); // normalize to query term for TF counting
          }
        }
      } catch {
        // skip malformed lines
      }
    });

    rl.on("close", () => {
      signal.removeEventListener("abort", onAbort);
      resolve({ tokens, length: wordCount });
    });

    rl.on("error", () => {
      signal.removeEventListener("abort", onAbort);
      resolve({ tokens: [], length: 0 });
    });
  });
}
