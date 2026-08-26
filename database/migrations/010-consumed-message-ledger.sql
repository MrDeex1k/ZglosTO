-- Migration 010: idempotent consumer ledger.
BEGIN;

CREATE TABLE IF NOT EXISTS consumed_messages (
	consumer_name varchar(128) NOT NULL,
	message_id uuid NOT NULL,
	message_type varchar(128) NOT NULL,
	consumed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (consumer_name, message_id)
);

COMMIT;
