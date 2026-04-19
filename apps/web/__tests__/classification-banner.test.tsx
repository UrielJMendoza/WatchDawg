import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ClassificationBanner } from "@/components/classification-banner";

describe("ClassificationBanner", () => {
  it("renders the UNCLASSIFIED // OSINT marking", () => {
    render(<ClassificationBanner position="top" />);
    expect(screen.getByText("UNCLASSIFIED // OSINT")).toBeInTheDocument();
  });

  it("exposes banner role and classification aria-label", () => {
    render(<ClassificationBanner position="bottom" />);
    const banner = screen.getByRole("banner", { name: /classification marking/i });
    expect(banner).toHaveAttribute("data-position", "bottom");
  });
});
