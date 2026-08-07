import { MetaTemplateComponent } from "./meta-templates";

export type VariableSource = "guest_name" | "hotel_name" | "custom";

/** One {{n}} placeholder in a template's body, in position order. */
export interface BodyVariableSlot {
  source: VariableSource;
  /** For "custom": the human label shown when asking the sender to fill it in (e.g. "Discount %"). For known sources, unused — display label comes from KNOWN_AUTO_VARIABLES. */
  label: string;
}

export const KNOWN_AUTO_VARIABLES: Record<Exclude<VariableSource, "custom">, { label: string; example: string }> = {
  guest_name: { label: "Guest name", example: "Priya" },
  hotel_name: { label: "Hotel name", example: "Hotel Ivory Towers" },
};

/** Example value shown in the builder's live preview — not what actually gets sent. */
export function exampleValueForSlot(slot: BodyVariableSlot): string {
  if (slot.source === "custom") return slot.label || "value";
  return KNOWN_AUTO_VARIABLES[slot.source].example;
}

/**
 * Resolves a template's stored bodyVariableSlots into the `components`
 * array Meta's send-message API expects (positional text parameters on the
 * body component only — headers/footers/buttons in this app's templates
 * are always static, so they need no parameters at send time).
 */
export function buildTemplateComponents(
  bodyVariableSlots: BodyVariableSlot[],
  contact: { name: string | null },
  hotelProfile: { name: string } | null,
  staticValues: Record<string, string>
): MetaTemplateComponent[] {
  if (bodyVariableSlots.length === 0) return [];

  const parameters = bodyVariableSlots.map((slot) => {
    if (slot.source === "guest_name") return { type: "text", text: contact.name || "there" };
    if (slot.source === "hotel_name") return { type: "text", text: hotelProfile?.name || "us" };
    return { type: "text", text: staticValues[slot.label] ?? "" };
  });

  return [{ type: "body", parameters }];
}
