-- Migration 014: Better Auth 1.7 account issuer metadata.
ALTER TABLE account
  ADD COLUMN IF NOT EXISTS issuer text;
