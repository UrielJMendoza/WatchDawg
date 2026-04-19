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

  it("renders distinct top and bottom instances when both are mounted", () => {
    render(
      <>
        <ClassificationBanner position="top" />
        <ClassificationBanner position="bottom" />
      </>,
    );
    const banners = screen.getAllByRole("banner", { name: /classification marking/i });
    expect(banners).toHaveLength(2);
    const positions = banners.map((b) => b.getAttribute("data-position")).sort();
    expect(positions).toEqual(["bottom", "top"]);
    for (const b of banners) {
      expect(b).toHaveTextContent("UNCLASSIFIED // OSINT");
    }
  });
});
