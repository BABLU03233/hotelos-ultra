import { describe, expect, it } from "vitest";
import { avatarColorClass } from "./avatar-color";

describe("avatar colours spread out across ids created in the same burst", () => {
  // Real cuids from one seed run — created within milliseconds of each other,
  // so they share a long identical prefix and differ only in a short suffix.
  // The naive rolling hash this replaced let that shared prefix dominate: 4
  // of these 7 collapsed onto the same colour. FNV-1a must not repeat that.
  const BURST_IDS = [
    "cmt1bmyft0007wgq96vcoofb9",
    "cmt1bmygr000dwgq9ghshm39u",
    "cmt1bmyhp000jwgq9gtyoxvga",
    "cmt1bmyim000pwgq9j1nkqy94",
    "cmt1bmyjk000vwgq9ztwr6wcv",
    "cmt1bmyke0011wgq9yem4a0wf",
    "cmt1bmyeb0001wgq9okkxr7d0",
  ];

  it("assigns at least 4 distinct colours across 7 same-burst ids", () => {
    const distinct = new Set(BURST_IDS.map(avatarColorClass));
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });

  it("is deterministic — the same id always gets the same colour", () => {
    const id = "cmt1bmyft0007wgq96vcoofb9";
    expect(avatarColorClass(id)).toBe(avatarColorClass(id));
  });

  it("always returns a solid background plus white text", () => {
    for (const id of BURST_IDS) {
      expect(avatarColorClass(id)).toMatch(/^bg-\S+ text-white$/);
    }
  });
});
