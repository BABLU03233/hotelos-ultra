import { describe, expect, it } from "vitest";
import { classifyAttachment, describeLimit, exceedsLimit } from "./attachment";

describe("classifying a staff attachment", () => {
  it("recognises the media types WhatsApp renders natively", () => {
    expect(classifyAttachment("image/jpeg")).toBe("image");
    expect(classifyAttachment("image/png")).toBe("image");
    expect(classifyAttachment("video/mp4")).toBe("video");
    expect(classifyAttachment("audio/mpeg")).toBe("audio");
  });

  it("ignores charset parameters and casing, which browsers add freely", () => {
    expect(classifyAttachment("IMAGE/JPEG")).toBe("image");
    expect(classifyAttachment("image/png; charset=binary")).toBe("image");
  });

  it("sends anything unsupported as a document rather than refusing it", () => {
    // A hotel sending an invoice, an ID scan or a HEIC photo from an iPhone
    // cares that it arrives. Meta rejects unknown types on the native paths
    // but accepts them as documents, so that is the safe landing place.
    for (const mime of ["application/pdf", "image/heic", "text/csv", "application/octet-stream", ""]) {
      expect(classifyAttachment(mime), mime).toBe("document");
    }
  });
});

describe("size limits", () => {
  it("holds images to WhatsApp's 5MB ceiling", () => {
    expect(exceedsLimit("image", 4 * 1024 * 1024)).toBe(false);
    expect(exceedsLimit("image", 6 * 1024 * 1024)).toBe(true);
    expect(describeLimit("image")).toBe("5MB");
  });

  it("allows documents more room than images", () => {
    expect(exceedsLimit("document", 6 * 1024 * 1024)).toBe(false);
    expect(describeLimit("document")).toBe("20MB");
  });

  it("rejects a file that is exactly one byte over", () => {
    expect(exceedsLimit("image", 5 * 1024 * 1024)).toBe(false);
    expect(exceedsLimit("image", 5 * 1024 * 1024 + 1)).toBe(true);
  });
});
