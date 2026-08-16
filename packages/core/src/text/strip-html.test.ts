import { describe, it, expect } from "vitest";
import { stripHtml } from "./strip-html.js";

describe("stripHtml", () => {
  it("removes tags while preserving the text content", () => {
    expect(stripHtml("<p>Rejoignez notre <strong>équipe</strong>.</p>")).toBe("Rejoignez notre équipe .");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Data &amp; Analytics &lt;junior&gt;")).toBe("Data & Analytics <junior>");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(stripHtml("<ul><li>Un</li>  <li>Deux</li></ul>")).toBe("Un Deux");
  });
});
