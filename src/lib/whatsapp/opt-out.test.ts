import { describe, expect, it } from "vitest";
import { isOptOutSignal } from "./opt-out";

describe("isOptOutSignal", () => {
  it("treats a 'Stop promos' button click as opt-out", () => {
    expect(isOptOutSignal({ type: "button", text: null, buttonText: "Stop promos" })).toBe(true);
  });

  it("treats an interactive button_reply titled 'Stop' as opt-out", () => {
    expect(isOptOutSignal({ type: "interactive", text: null, buttonText: "Stop" })).toBe(true);
  });

  it("treats exact-text STOP as opt-out, case-insensitively", () => {
    expect(isOptOutSignal({ type: "text", text: "STOP", buttonText: null })).toBe(true);
    expect(isOptOutSignal({ type: "text", text: "unsubscribe", buttonText: null })).toBe(true);
  });

  it("does not treat 'stop' appearing inside an unrelated sentence as opt-out", () => {
    expect(isOptOutSignal({ type: "text", text: "can I stop by the pool bar after 6pm?", buttonText: null })).toBe(false);
  });

  it("does not treat an ordinary text message as opt-out", () => {
    expect(isOptOutSignal({ type: "text", text: "Do you have rooms this weekend?", buttonText: null })).toBe(false);
  });

  it("does not treat a button unrelated to stopping as opt-out", () => {
    expect(isOptOutSignal({ type: "button", text: null, buttonText: "Book now" })).toBe(false);
  });
});
