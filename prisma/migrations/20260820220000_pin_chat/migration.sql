-- Pin a conversation to the top of the chat list, like WhatsApp.
--
-- A timestamp rather than a boolean so several pinned chats keep a stable
-- order (most recently pinned first) instead of shuffling on every refetch.
ALTER TABLE "Contact" ADD COLUMN "pinnedAt" TIMESTAMP(3);
