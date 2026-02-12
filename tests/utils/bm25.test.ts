import { describe, it, expect } from "vitest";
import { tokenize, termFrequencies, computeIDF, scoreBM25 } from "../../src/utils/bm25.js";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  it("filters stopwords", () => {
    expect(tokenize("the quick brown fox and the lazy dog")).toEqual([
      "quick", "brown", "fox", "lazy", "dog",
    ]);
  });

  it("filters single-character tokens", () => {
    expect(tokenize("a b c hello")).toEqual(["hello"]);
  });

  it("handles special characters", () => {
    expect(tokenize("user@email.com foo-bar_baz")).toEqual([
      "user", "email", "com", "foo", "bar", "baz",
    ]);
  });

  it("returns empty for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("keeps numbers", () => {
    expect(tokenize("error 404 page")).toEqual(["error", "404", "page"]);
  });
});

describe("termFrequencies", () => {
  it("counts term occurrences", () => {
    const tf = termFrequencies(["hello", "world", "hello"]);
    expect(tf.get("hello")).toBe(2);
    expect(tf.get("world")).toBe(1);
  });

  it("returns empty map for empty array", () => {
    expect(termFrequencies([]).size).toBe(0);
  });
});

describe("computeIDF", () => {
  it("gives higher IDF to rarer terms", () => {
    const docFreq = new Map([["common", 90], ["rare", 2]]);
    const idf = computeIDF(["common", "rare"], docFreq, 100);
    expect(idf.get("rare")!).toBeGreaterThan(idf.get("common")!);
  });

  it("gives positive IDF for terms not in any document", () => {
    const docFreq = new Map<string, number>();
    const idf = computeIDF(["missing"], docFreq, 100);
    expect(idf.get("missing")!).toBeGreaterThan(0);
  });
});

describe("scoreBM25", () => {
  const avgDocLen = 100;
  const idf = new Map([["hello", 1.5], ["world", 0.5]]);

  it("scores higher for more term occurrences", () => {
    const tf1 = new Map([["hello", 1]]);
    const tf2 = new Map([["hello", 5]]);
    const s1 = scoreBM25(["hello"], tf1, 100, avgDocLen, idf);
    const s2 = scoreBM25(["hello"], tf2, 100, avgDocLen, idf);
    expect(s2).toBeGreaterThan(s1);
  });

  it("returns 0 when no query terms match", () => {
    const tf = new Map([["other", 5]]);
    expect(scoreBM25(["hello"], tf, 100, avgDocLen, idf)).toBe(0);
  });

  it("scores higher for shorter docs with same TF", () => {
    const tf = new Map([["hello", 3]]);
    const short = scoreBM25(["hello"], tf, 50, avgDocLen, idf);
    const long = scoreBM25(["hello"], tf, 200, avgDocLen, idf);
    expect(short).toBeGreaterThan(long);
  });

  it("combines scores across multiple query terms", () => {
    const tf = new Map([["hello", 2], ["world", 3]]);
    const both = scoreBM25(["hello", "world"], tf, 100, avgDocLen, idf);
    const one = scoreBM25(["hello"], tf, 100, avgDocLen, idf);
    expect(both).toBeGreaterThan(one);
  });
});
