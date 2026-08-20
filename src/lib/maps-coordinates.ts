/**
 * Pulls latitude/longitude out of whatever a hotel owner pastes.
 *
 * The coordinates were always in the schema and always empty, because the only
 * way to fill them was to know them — and no hotel owner knows their hotel's
 * decimal degrees. They do have a Google Maps link, because that is what they
 * already send guests. So the settings field takes the link and derives the
 * numbers.
 *
 * This matters because a link is friction: the guest taps it, waits for a
 * browser, gets a consent screen, then has to hand off to their map app. A
 * native WhatsApp location message opens directly in whatever maps app they
 * already use, with a "Directions" button, inside the chat.
 *
 * Handles the URL shapes Google actually produces:
 *   .../@17.4065,78.4772,17z/...        the map's own centre
 *   ...?q=17.4065,78.4772               a dropped pin
 *   ...!3d17.4065!4d78.4772             the place's real coordinates
 *   ...&ll=17.4065,78.4772              older share links
 *   17.4065, 78.4772                    pasted bare, which people also do
 *
 * Short links (maps.app.goo.gl, share.google) carry no coordinates at all —
 * they have to be opened to resolve. Those return null, and the caller asks
 * the owner to paste the full link instead of silently storing nothing.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/** !3d<lat>!4d<lng> — the place's true coordinates, not the viewport centre. */
const PLACE_PATTERN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
/** @<lat>,<lng>,<zoom>z — where the map is centred. */
const AT_PATTERN = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
/** ?q= / &query= / &ll= / &sll= */
const QUERY_PATTERN = /[?&](?:q|query|ll|sll|destination)=(-?\d+(?:\.\d+)?)%2C\s*(-?\d+(?:\.\d+)?)|[?&](?:q|query|ll|sll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/;
/** Bare "17.4065, 78.4772". */
const BARE_PATTERN = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function valid(lat: number, lng: number): Coordinates | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // 0,0 is in the Atlantic. It is far more likely to be a parse artefact than
  // a hotel, and sending a guest there is worse than sending nothing.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function parseCoordinates(input: string): Coordinates | null {
  const text = (input ?? "").trim();
  if (!text) return null;

  const bare = BARE_PATTERN.exec(text);
  if (bare) return valid(Number(bare[1]), Number(bare[2]));

  // Place coordinates first: on a full Google Maps place URL both !3d!4d and
  // @lat,lng are present, and only the former is the place itself — @ is
  // wherever the map happened to be centred when the link was made.
  const place = PLACE_PATTERN.exec(text);
  if (place) {
    const found = valid(Number(place[1]), Number(place[2]));
    if (found) return found;
  }

  const query = QUERY_PATTERN.exec(text);
  if (query) {
    const lat = query[1] ?? query[3];
    const lng = query[2] ?? query[4];
    const found = valid(Number(lat), Number(lng));
    if (found) return found;
  }

  const at = AT_PATTERN.exec(text);
  if (at) return valid(Number(at[1]), Number(at[2]));

  return null;
}

/** True for the shortened links that carry no coordinates until resolved. */
export function isShortMapsLink(input: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|share\.google)/i.test(input ?? "");
}
