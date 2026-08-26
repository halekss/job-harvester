import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PipelineFilters } from "./PipelineFilters.js";

describe("PipelineFilters", () => {
  it("renders one toggle chip per source, pressed when not excluded", () => {
    render(
      <PipelineFilters
        sources={["francetravail", "labonnealternance"]}
        excludedSources={new Set(["labonnealternance"])}
        onToggleSource={vi.fn()}
        hideRejected={false}
        onToggleHideRejected={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "francetravail" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "labonnealternance" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onToggleSource with the clicked source", async () => {
    const user = userEvent.setup();
    const onToggleSource = vi.fn();
    render(
      <PipelineFilters
        sources={["francetravail"]}
        excludedSources={new Set()}
        onToggleSource={onToggleSource}
        hideRejected={false}
        onToggleHideRejected={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "francetravail" }));
    expect(onToggleSource).toHaveBeenCalledWith("francetravail");
  });

  it("reflects hideRejected via the switch's aria-checked and toggles it on click", async () => {
    const user = userEvent.setup();
    const onToggleHideRejected = vi.fn();
    render(
      <PipelineFilters sources={[]} excludedSources={new Set()} onToggleSource={vi.fn()} hideRejected onToggleHideRejected={onToggleHideRejected} />,
    );
    const toggle = screen.getByRole("switch", { name: "Masquer les refus" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(onToggleHideRejected).toHaveBeenCalled();
  });
});
