import { toast } from "sonner";

/**
 * Runs a save and tells the user when it fails.
 *
 * Several settings panels called apiFetch bare — on blur, with no catch. A
 * rejected save (validation, a dropped connection, an expired session) then
 * did nothing at all: no toast, no revert, no console trace the owner would
 * ever see. They typed a new room price, clicked away, and believed it was
 * saved. That is the same failure shape as the WhatsApp "single tick" bug —
 * the action reports success by saying nothing, and the truth only surfaces
 * later, somewhere else.
 *
 * Returns whether it succeeded, so a caller can skip a refetch or keep a
 * dialog open on failure.
 */
export async function saveWithFeedback(action: () => Promise<unknown>, fallbackMessage = "Couldn't save that change"): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (err) {
    toast.error(err instanceof Error && err.message ? err.message : fallbackMessage);
    return false;
  }
}
