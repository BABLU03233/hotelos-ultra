import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { CHAT_FILTERS } from "@/lib/crm/chat-filters";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string; filter?: string }>;
}) {
  const { contact, filter } = await searchParams;
  // Validated against the real filter list rather than cast: ?filter= is
  // user-editable, and an unknown value should open the normal list, not
  // render an empty one with no chip selected.
  const initialFilter = CHAT_FILTERS.find((f) => f.key === filter)?.key;

  // Deliberately bare: no page title, no description, no max-width.
  //
  // Every other page in this app is a reading or forms page where a heading
  // and a constrained line length help. This one is a chat desk built to match
  // WhatsApp Web, which gives the entire window to the list and the
  // conversation — and a three-line title above it was the single biggest
  // thing making this read as a dashboard rather than WhatsApp. It also cost
  // real estate that matters: on a 900px laptop it was roughly a chat bubble
  // and a half of visible history, on every conversation, forever.
  //
  // CrmWorkspace sizes itself from the viewport, so it needs no height here.
  return <CrmWorkspace initialContactId={contact ?? null} initialFilter={initialFilter} />;
}
