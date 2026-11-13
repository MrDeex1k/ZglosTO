-- The official PostgreSQL entrypoint creates POSTGRES_DB owned by POSTGRES_USER.
-- Do not create a second hard-coded database/administrator inside a DO transaction.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
