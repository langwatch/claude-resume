// BM25 scoring for full-text search through session conversations

const K1 = 1.2;
// Lower b = less length normalization penalty, so sessions with more
// matches in longer conversations aren't unfairly penalized.
const B = 0.4;

// Common English stopwords to skip during tokenization
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "had", "has", "have", "he", "her", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "just", "my", "no", "not", "of", "on", "or", "our",
  "out", "so", "than", "that", "the", "them", "then", "there", "these",
  "they", "this", "to", "up", "was", "we", "were", "what", "when", "which",
  "who", "will", "with", "you", "your",
]);

/** Tokenize text into lowercase terms, filtering stopwords and short tokens */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Count term frequencies in a token list */
export function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

/** Compute IDF for query terms given document frequency counts */
export function computeIDF(
  queryTerms: string[],
  docFreq: Map<string, number>,
  totalDocs: number,
): Map<string, number> {
  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    const df = docFreq.get(term) || 0;
    // BM25 IDF formula (non-negative variant)
    idf.set(term, Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5)));
  }
  return idf;
}

/** Score a single document against query terms using BM25 */
export function scoreBM25(
  queryTerms: string[],
  docTF: Map<string, number>,
  docLen: number,
  avgDocLen: number,
  idf: Map<string, number>,
): number {
  let score = 0;
  for (const term of queryTerms) {
    const tf = docTF.get(term) || 0;
    if (tf === 0) continue;
    const termIDF = idf.get(term) || 0;
    const numerator = tf * (K1 + 1);
    const denominator = tf + K1 * (1 - B + B * (docLen / avgDocLen));
    score += termIDF * (numerator / denominator);
  }
  return score;
}
