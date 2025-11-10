-- Przykładowe sesje i wartości weryfikacyjne dla testów bezpieczeństwa

-- Aktywne sesje użytkowników
INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent, created_at, updated_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440001', 'admin_session_token_12345', now() + interval '24 hours', '192.168.1.100', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440006', 'user_session_token_67890', now() + interval '24 hours', '192.168.1.101', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440007', 'user_session_token_abcde', now() + interval '12 hours', '192.168.1.102', 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15', now(), now());

-- Wygasłe sesje (dla testów)
INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent, created_at, updated_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440002', 'expired_session_token_old', now() - interval '1 hour', '192.168.1.103', 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36', now() - interval '25 hours', now() - interval '25 hours');

-- Aktywne wartości weryfikacyjne (reset hasła)
INSERT INTO verification (id, identifier, value, expires_at, user_id, created_at, updated_at) VALUES
(uuid_generate_v4(), 'ewa.dombrowska@email.com', 'reset_token_active_123', now() + interval '1 hour', '550e8400-e29b-41d4-a716-446655440008', now(), now()),
(uuid_generate_v4(), 'tomasz.lewandowski@email.com', 'reset_token_active_456', now() + interval '2 hours', '550e8400-e29b-41d4-a716-446655440009', now(), now());

-- Wygasłe wartości weryfikacyjne (reset hasła)
INSERT INTO verification (id, identifier, value, expires_at, user_id, created_at, updated_at) VALUES
(uuid_generate_v4(), 'michal.szymanski@email.com', 'reset_token_expired_789', now() - interval '30 minutes', '550e8400-e29b-41d4-a716-446655440007', now() - interval '3 hours', now() - interval '3 hours');

-- Aktywne wartości weryfikacyjne (weryfikacja email)
INSERT INTO verification (id, identifier, value, expires_at, user_id, created_at, updated_at) VALUES
(uuid_generate_v4(), 'ewa.dombrowska@email.com', 'email_verify_token_active_111', now() + interval '24 hours', '550e8400-e29b-41d4-a716-446655440008', now(), now()),
(uuid_generate_v4(), 'agnieszka.malinowska@email.com', 'email_verify_token_active_222', now() + interval '24 hours', '550e8400-e29b-41d4-a716-446655440010', now(), now());
