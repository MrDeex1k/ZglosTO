-- Przykładowe sesje i tokeny dla testów bezpieczeństwa

-- Aktywne sesje użytkowników
INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440001', 'admin_session_token_12345', now() + interval '24 hours', now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440006', 'user_session_token_67890', now() + interval '24 hours', now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440007', 'user_session_token_abcde', now() + interval '12 hours', now());

-- Wygasłe sesje (dla testów)
INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440002', 'expired_session_token_old', now() - interval '1 hour', now() - interval '25 hours');

-- Aktywne tokeny resetowania hasła
INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used, created_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440008', 'reset_token_active_123', now() + interval '1 hour', false, now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440009', 'reset_token_active_456', now() + interval '2 hours', false, now());

-- Zużyte tokeny resetowania hasła
INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used, created_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440006', 'reset_token_used_789', now() + interval '1 hour', true, now() - interval '30 minutes');

-- Wygasłe tokeny resetowania hasła
INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used, created_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440007', 'reset_token_expired_101', now() - interval '30 minutes', false, now() - interval '3 hours');

-- Aktywne tokeny weryfikacji email
INSERT INTO email_verification_tokens (id, user_id, token, expires_at, used, created_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440008', 'email_verify_token_active_111', now() + interval '24 hours', false, now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440010', 'email_verify_token_active_222', now() + interval '24 hours', false, now());

-- Zużyte tokeny weryfikacji email
INSERT INTO email_verification_tokens (id, user_id, token, expires_at, used, created_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440009', 'email_verify_token_used_333', now() + interval '24 hours', true, now() - interval '1 hour');
