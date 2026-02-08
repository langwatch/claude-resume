import { describe, it, expect } from "vitest";
import { truncate, extractProjectName, timeAgo, wrapLines } from "../../src/utils/format.js";

describe("truncate", () => {
  it("returns short text unchanged", () => {
    expect(truncate("hello world", 20)).toBe("hello world");
  });

  it("truncates long text with ellipsis", () => {
    const result = truncate("this is a very long string that should be truncated", 20);
    expect(result).toHaveLength(20);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("strips HTML/XML tags", () => {
    expect(truncate("<system-reminder>hello</system-reminder>", 50)).toBe(
      "hello",
    );
  });

  it("collapses newlines to spaces", () => {
    expect(truncate("hello\n\nworld\nfoo", 50)).toBe("hello world foo");
  });

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles string exactly at max length", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });

  it("handles string one over max length", () => {
    expect(truncate("123456", 5)).toBe("1234\u2026");
  });
});

describe("extractProjectName", () => {
  it("extracts last path segment", () => {
    expect(extractProjectName("/Users/rchaves/Projects/my-app")).toBe("my-app");
  });

  it("handles root path", () => {
    expect(extractProjectName("/")).toBe("/");
  });

  it("handles single segment", () => {
    expect(extractProjectName("my-app")).toBe("my-app");
  });

  it("handles trailing slash", () => {
    expect(extractProjectName("/Users/rchaves/Projects/")).toBe("Projects");
  });
});

describe("wrapLines", () => {
  it("returns short text as single line", () => {
    expect(wrapLines("hello world", 40, 5)).toEqual(["hello world"]);
  });

  it("wraps long lines at word boundaries", () => {
    const result = wrapLines("the quick brown fox jumps over the lazy dog", 20, 5);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((line) => expect(line.length).toBeLessThanOrEqual(20));
  });

  it("preserves newlines from original text", () => {
    const result = wrapLines("line one\nline two\nline three", 40, 5);
    expect(result).toEqual(["line one", "line two", "line three"]);
  });

  it("respects max lines limit", () => {
    const result = wrapLines("a\nb\nc\nd\ne\nf", 40, 3);
    expect(result).toHaveLength(3);
  });

  it("strips HTML/XML tags", () => {
    const result = wrapLines("<b>hello</b> <i>world</i>", 40, 5);
    expect(result).toEqual(["hello world"]);
  });

  it("handles empty string", () => {
    expect(wrapLines("", 40, 5)).toEqual([""]);
  });

  it("breaks long words that exceed width", () => {
    const result = wrapLines("abcdefghijklmnopqrstuvwxyz", 10, 5);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((line) => expect(line.length).toBeLessThanOrEqual(10));
  });
});

describe("timeAgo", () => {
  it("returns a human-readable relative time", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = timeAgo(fiveMinutesAgo);
    expect(result).toContain("minutes ago");
  });

  it("handles recent dates", () => {
    const justNow = new Date(Date.now() - 10 * 1000);
    const result = timeAgo(justNow);
    expect(result).toContain("ago");
  });

  it("handles old dates", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = timeAgo(thirtyDaysAgo);
    expect(result).toContain("ago");
  });
});
