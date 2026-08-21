import { describe, expect, it } from "vitest";
import { contentTypeFor, isSafeKey } from "./media-store";

describe("isSafeKey", () => {
  it("accepts the keys this app actually generates", () => {
    expect(isSafeKey("tenant123/9f8e7d6c-1234-4321-abcd-0123456789ab.jpg")).toBe(true);
    expect(isSafeKey("tenant123/9f8e7d6c-1234-4321-abcd-0123456789ab.png")).toBe(true);
  });

  it("refuses to walk out of the upload directory", () => {
    // The serving route takes its key straight from the URL path, so this is
    // the only thing standing between a crafted request and reading arbitrary
    // files off the container.
    expect(isSafeKey("../../etc/passwd")).toBe(false);
    expect(isSafeKey("tenant/../../../app.env")).toBe(false);
    expect(isSafeKey("/etc/passwd")).toBe(false);
    expect(isSafeKey("tenant/..%2Fsecret.jpg")).toBe(false);
  });

  it("refuses anything that is not an image extension", () => {
    expect(isSafeKey("tenant/file.env")).toBe(false);
    expect(isSafeKey("tenant/file.js")).toBe(false);
    expect(isSafeKey("tenant/file")).toBe(false);
    expect(isSafeKey("")).toBe(false);
  });
});

describe("contentTypeFor", () => {
  it("maps the extensions we store", () => {
    expect(contentTypeFor("a/b.png")).toBe("image/png");
    expect(contentTypeFor("a/b.webp")).toBe("image/webp");
    expect(contentTypeFor("a/b.gif")).toBe("image/gif");
    expect(contentTypeFor("a/b.jpg")).toBe("image/jpeg");
  });
});
