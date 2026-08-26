import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge.js";

describe("StatusBadge", () => {
  it("renders the French label for each status", () => {
    render(<StatusBadge status="new" />);
    expect(screen.getByText("Collecté")).toBeInTheDocument();
  });

  it("renders the label for a pipeline lane status", () => {
    render(<StatusBadge status="interview" />);
    expect(screen.getByText("Entretien")).toBeInTheDocument();
  });

  it("applies the subtle (repos) classes by default", () => {
    render(<StatusBadge status="rejected" />);
    expect(screen.getByText("Refus")).toHaveClass("bg-status-rejected-bg", "text-status-rejected-fg");
  });

  it("applies the solid classes when solid is true", () => {
    render(<StatusBadge status="rejected" solid />);
    expect(screen.getByText("Refus")).toHaveClass("bg-status-rejected-solid", "text-status-rejected-on");
  });
});
