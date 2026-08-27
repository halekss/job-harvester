import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Campaign } from "../api/client.js";
import { CampaignParamToggles } from "./CampaignParamToggles.js";

function makeCampaign(): Campaign {
  return {
    id: "alternance-data-hdf",
    name: "Data",
    locations: [{ label: "Lille 59000" }, { label: "Paris 75000" }],
    contractTypes: ["apprentissage", "stage"],
  };
}

describe("CampaignParamToggles", () => {
  it("renders one chip per campaign location and per contract type, all pressed by default", () => {
    render(
      <CampaignParamToggles campaign={makeCampaign()} onToggleLocation={vi.fn()} onToggleContractType={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Lille 59000" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Paris 75000" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "apprentissage" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "stage" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reflects an explicit selectedLocations subset via aria-pressed", () => {
    render(
      <CampaignParamToggles
        campaign={makeCampaign()}
        selectedLocations={["Lille 59000"]}
        onToggleLocation={vi.fn()}
        onToggleContractType={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Lille 59000" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Paris 75000" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects an explicit selectedContractTypes subset via aria-pressed", () => {
    render(
      <CampaignParamToggles
        campaign={makeCampaign()}
        selectedContractTypes={["apprentissage"]}
        onToggleLocation={vi.fn()}
        onToggleContractType={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "apprentissage" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "stage" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onToggleLocation with the clicked location's label", async () => {
    const user = userEvent.setup();
    const onToggleLocation = vi.fn();
    render(
      <CampaignParamToggles campaign={makeCampaign()} onToggleLocation={onToggleLocation} onToggleContractType={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Paris 75000" }));
    expect(onToggleLocation).toHaveBeenCalledWith("Paris 75000");
  });

  it("calls onToggleContractType with the clicked contract type", async () => {
    const user = userEvent.setup();
    const onToggleContractType = vi.fn();
    render(
      <CampaignParamToggles campaign={makeCampaign()} onToggleLocation={vi.fn()} onToggleContractType={onToggleContractType} />,
    );
    await user.click(screen.getByRole("button", { name: "stage" }));
    expect(onToggleContractType).toHaveBeenCalledWith("stage");
  });

  it("renders nothing when the campaign has neither locations nor contract types", () => {
    const { container } = render(
      <CampaignParamToggles
        campaign={{ id: "empty", name: "Empty", locations: [], contractTypes: [] }}
        onToggleLocation={vi.fn()}
        onToggleContractType={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
