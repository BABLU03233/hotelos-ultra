import { BellOff, BotOff } from "lucide-react";
import { Contact } from "@/types";

/** AI-paused / opted-out icon badges shared between the CRM list and pipeline card views. */
export function ContactStatusBadges({ contact }: { contact: Pick<Contact, "aiPaused" | "optedOutAt"> }) {
  return (
    <>
      {contact.aiPaused && (
        <span title="AI paused — replies aren't automated right now">
          <BotOff className="size-2.5 shrink-0 text-amber-600" />
        </span>
      )}
      {contact.optedOutAt && (
        <span title="Opted out of promotions">
          <BellOff className="size-2.5 shrink-0 text-amber-600" />
        </span>
      )}
    </>
  );
}
