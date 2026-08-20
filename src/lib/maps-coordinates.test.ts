import { describe, expect, it } from "vitest";
import { isShortMapsLink, parseCoordinates } from "./maps-coordinates";

describe("parseCoordinates", () => {
  it("prefers the place's own coordinates over the map's centre", () => {
    // A full Google place URL carries both. @ is wherever the map happened to
    // be centred when the link was made; !3d!4d is the place itself.
    const url =
      "https://www.google.com/maps/place/Hotel+Ivory+Towers/@17.4100000,78.4800000,17z/data=!4m6!3m5!1s0x3bcb99!8m2!3d17.4065432!4d78.4772345";
    expect(parseCoordinates(url)).toEqual({ lat: 17.4065432, lng: 78.4772345 });
  });

  it("reads a dropped pin", () => {
    expect(parseCoordinates("https://maps.google.com/?q=17.4065,78.4772")).toEqual({ lat: 17.4065, lng: 78.4772 });
  });

  it("reads a URL-encoded comma", () => {
    expect(parseCoordinates("https://maps.google.com/?q=17.4065%2C78.4772")).toEqual({ lat: 17.4065, lng: 78.4772 });
  });

  it("reads the map centre when that is all there is", () => {
    expect(parseCoordinates("https://www.google.com/maps/@17.4065,78.4772,15z")).toEqual({ lat: 17.4065, lng: 78.4772 });
  });

  it("accepts coordinates pasted bare, which people also do", () => {
    expect(parseCoordinates("17.4065, 78.4772")).toEqual({ lat: 17.4065, lng: 78.4772 });
    expect(parseCoordinates("17.4065,78.4772")).toEqual({ lat: 17.4065, lng: 78.4772 });
  });

  it("handles the southern and western hemispheres", () => {
    expect(parseCoordinates("-33.8688, 151.2093")).toEqual({ lat: -33.8688, lng: 151.2093 });
    expect(parseCoordinates("40.7128, -74.006")).toEqual({ lat: 40.7128, lng: -74.006 });
  });

  it("returns null for a short link, which carries no coordinates", () => {
    // These only resolve by being opened. Storing nothing silently would leave
    // the owner believing the location was saved.
    expect(parseCoordinates("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(isShortMapsLink("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isShortMapsLink("https://share.google/xyz")).toBe(true);
  });

  it("rejects out-of-range and empty input", () => {
    expect(parseCoordinates("")).toBeNull();
    expect(parseCoordinates("not a link")).toBeNull();
    expect(parseCoordinates("91.0, 20.0")).toBeNull();
    expect(parseCoordinates("20.0, 181.0")).toBeNull();
  });

  it("rejects 0,0", () => {
    // The Atlantic. Far likelier a parse artefact than a hotel, and sending a
    // guest there is worse than sending nothing.
    expect(parseCoordinates("0, 0")).toBeNull();
  });

  it("does not treat a full maps URL as a short link", () => {
    expect(isShortMapsLink("https://www.google.com/maps/@17.4,78.4,15z")).toBe(false);
  });
});
