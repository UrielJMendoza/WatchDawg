import { beforeEach, describe, expect, it } from "vitest";
import { useStatusStore } from "@/lib/store/status-store";

function reset() {
  useStatusStore.setState({
    backendStatus: "unknown",
    failCount: 0,
    lastCheckedAt: null,
    lastLatencyMs: null,
  });
}

describe("status-store", () => {
  beforeEach(reset);

  it("starts in the unknown state", () => {
    const s = useStatusStore.getState();
    expect(s.backendStatus).toBe("unknown");
    expect(s.failCount).toBe(0);
  });

  it("flips to live on successful probe and resets failCount", () => {
    useStatusStore.getState().markProbeFailed();
    expect(useStatusStore.getState().failCount).toBe(1);

    useStatusStore.getState().markProbeSucceeded(42);
    const s = useStatusStore.getState();
    expect(s.backendStatus).toBe("live");
    expect(s.failCount).toBe(0);
    expect(s.lastLatencyMs).toBe(42);
  });

  it("returns degraded after 1-2 failures and offline after 3", () => {
    const { markProbeFailed } = useStatusStore.getState();
    markProbeFailed();
    expect(useStatusStore.getState().backendStatus).toBe("degraded");
    markProbeFailed();
    expect(useStatusStore.getState().backendStatus).toBe("degraded");
    markProbeFailed();
    expect(useStatusStore.getState().backendStatus).toBe("offline");
  });
});
