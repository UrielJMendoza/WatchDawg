import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/actions", () => ({
  signOutAction: vi.fn(),
}));

import { Topbar } from "@/components/topbar";
import { LeftNav } from "@/components/nav/left-nav";
import { DetailPanel } from "@/components/panel/detail-panel";
import { TimelineStrip } from "@/components/timeline-strip";
import { StatusPill, type BackendStatus } from "@/components/status/status-pill";

describe("Topbar", () => {
  it("renders the wordmark, tagline, sign-out, and user email", () => {
    render(<Topbar userEmail="analyst@example.org" />);
    expect(screen.getByText("WATCHDAWG")).toBeInTheDocument();
    expect(screen.getByText(/maritime osint/i)).toBeInTheDocument();
    expect(screen.getByText("analyst@example.org")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("hides the email when user is null", () => {
    render(<Topbar userEmail={null} />);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});

describe("LeftNav", () => {
  it("renders the four Phase-1 section headers + SYSTEM footer", () => {
    render(<LeftNav />);
    for (const title of ["FEEDS", "FILTERS", "ENTITIES", "SAVED VIEWS", "SYSTEM"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/last ingest/i)).toBeInTheDocument();
  });
});

describe("DetailPanel", () => {
  it("renders the NO SELECTION empty state", () => {
    render(<DetailPanel />);
    expect(screen.getByRole("heading", { name: "SELECTION" })).toBeInTheDocument();
    expect(screen.getByText(/no selection/i)).toBeInTheDocument();
  });
});

describe("TimelineStrip", () => {
  it("renders the awaiting-data placeholder", () => {
    render(<TimelineStrip />);
    expect(screen.getByText(/timeline — awaiting data/i)).toBeInTheDocument();
  });
});

describe("StatusPill", () => {
  it.each<[BackendStatus, string]>([
    ["live", "LIVE"],
    ["degraded", "DEGRADED"],
    ["offline", "OFFLINE"],
    ["unknown", "BOOTING"],
  ])("renders %s as %s", (status, expected) => {
    render(<StatusPill status={status} />);
    expect(screen.getByRole("status")).toHaveTextContent(expected);
  });
});
