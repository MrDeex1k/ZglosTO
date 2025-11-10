-- Przykładowe dane użytkowników dla testów
-- Hasła są przechowywane w tabeli accounts (zahashowane przy użyciu bcrypt - symulacja)

-- Administrator systemu
INSERT INTO users (id, name, email, email_verified, is_active, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Administrator Systemu', 'admin@zglasto.pl', true, true, now(), now());

-- Pracownicy służb miejskich
INSERT INTO users (id, name, email, email_verified, is_active, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440002', 'Jan Kowalski', 'jan.kowalski@mpk.krakow.pl', true, true, now(), now()),
('550e8400-e29b-41d4-a716-446655440003', 'Anna Nowak', 'anna.nowak@zgk.krakow.pl', true, true, now(), now()),
('550e8400-e29b-41d4-a716-446655440004', 'Piotr Wiśniewski', 'piotr.wisniewski@pok.krakow.pl', true, true, now(), now()),
('550e8400-e29b-41d4-a716-446655440005', 'Maria Zielińska', 'maria.zielinska@zdz.krakow.pl', true, true, now(), now());

-- Mieszkańcy zgłaszający incydenty
INSERT INTO users (id, name, email, email_verified, is_active, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440006', 'Katarzyna Wojcik', 'katarzyna.wojcik@email.com', true, true, now(), now()),
('550e8400-e29b-41d4-a716-446655440007', 'Michał Szymański', 'michal.szymanski@email.com', true, true, now(), now()),
('550e8400-e29b-41d4-a716-446655440008', 'Ewa Dombrowska', 'ewa.dombrowska@email.com', false, true, now(), now()),
('550e8400-e29b-41d4-a716-446655440009', 'Tomasz Lewandowski', 'tomasz.lewandowski@email.com', true, true, now(), now()),
('550e8400-e29b-41d4-a716-446655440010', 'Agnieszka Malinowska', 'agnieszka.malinowska@email.com', true, true, now(), now());

-- Konta użytkowników (hasła lokalne)
INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440001', 'admin@zglasto.pl', 'email-password', '$2b$10$rOz7zQX8rXq9zQX8rXq9zQX8rXq9zQX8rXq9zQX8rXq9zQX8rXq9', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440002', 'jan.kowalski@mpk.krakow.pl', 'email-password', '$2b$10$hash1', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440003', 'anna.nowak@zgk.krakow.pl', 'email-password', '$2b$10$hash2', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440004', 'piotr.wisniewski@pok.krakow.pl', 'email-password', '$2b$10$hash3', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440005', 'maria.zielinska@zdz.krakow.pl', 'email-password', '$2b$10$hash4', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440006', 'katarzyna.wojcik@email.com', 'email-password', '$2b$10$hash5', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440007', 'michal.szymanski@email.com', 'email-password', '$2b$10$hash6', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440008', 'ewa.dombrowska@email.com', 'email-password', '$2b$10$hash7', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440009', 'tomasz.lewandowski@email.com', 'email-password', '$2b$10$hash8', now(), now()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440010', 'agnieszka.malinowska@email.com', 'email-password', '$2b$10$hash9', now(), now());
