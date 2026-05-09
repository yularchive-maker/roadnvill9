-- Telegram vendor linking fields.
-- Run this in the Supabase SQL editor before sending Telegram messages.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS vendors_telegram_chat_id_idx
  ON public.vendors(telegram_chat_id)
  WHERE is_deleted = false AND telegram_chat_id IS NOT NULL;
