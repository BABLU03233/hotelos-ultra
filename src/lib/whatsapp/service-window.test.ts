import { describe, expect, it } from "vitest";
import { SERVICE_WINDOW_MS, describeRemaining, serviceWindow } from "./service-window";

const NOW = new Date("2026-08-18T12:00:00Z");
const agoHours = (h: number) => new Date(NOW.getTime() - h * 3600_000);

describe("the 24-hour service window", () => {
  it("is open just inside 24 hours", () => {
    const w = serviceWindow(agoHours(23.9), NOW);
    expect(w.open).toBe(true);
    expect(w.msRemaining).toBeGreaterThan(0);
  });

  it("is closed just past 24 hours", () => {
    expect(serviceWindow(agoHours(24.1), NOW).open).toBe(false);
  });

  it("is closed exactly at the boundary", () => {
    // Meta measures this itself and a request landing on the boundary is a
    // coin flip; treating it as closed keeps us on the side that fails loudly
    // in our UI rather than silently at delivery.
    expect(serviceWindow(agoHours(24), NOW).open).toBe(false);
  });

  it("reproduces the exact production failures", () => {
    // The real numbers from the incident: every FAILED outbound went to a
    // contact past 24 hours, and the one that was READ had just messaged.
    expect(serviceWindow(agoHours(45.9), NOW).open).toBe(false); // 919912529325
    expect(serviceWindow(agoHours(28.2), NOW).open).toBe(false); // 916305389600
    expect(serviceWindow(agoHours(0), NOW).open).toBe(true); // 917036832421
  });

  it("treats a guest who never messaged as closed, not open", () => {
    // The cold-import case. An unknown last-inbound must not be read as
    // permission — there is no conversation to be inside of.
    const w = serviceWindow(null, NOW);
    expect(w.open).toBe(false);
    expect(w.closesAt).toBeNull();
  });

  it("treats an unparseable date as closed rather than throwing", () => {
    expect(serviceWindow("not-a-date", NOW).open).toBe(false);
  });

  it("accepts an ISO string, which is what the API layer actually carries", () => {
    expect(serviceWindow(agoHours(1).toISOString(), NOW).open).toBe(true);
  });

  it("reports the moment it closes", () => {
    const last = agoHours(2);
    expect(serviceWindow(last, NOW).closesAt?.getTime()).toBe(last.getTime() + SERVICE_WINDOW_MS);
  });
});

describe("describeRemaining", () => {
  it("uses minutes under an hour and hours above", () => {
    expect(describeRemaining(45 * 60_000)).toBe("45m left");
    expect(describeRemaining(3.5 * 3600_000)).toBe("3h left");
    expect(describeRemaining(0)).toBe("closed");
  });
});
