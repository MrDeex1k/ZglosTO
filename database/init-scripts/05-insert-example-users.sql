-- Przykładowe dane użytkowników dla testów
-- Hasła są zahashowane przy użyciu bcrypt (symulacja)

-- Administrator systemu
INSERT INTO users (id, name, email, email_verified, password_hash, is_active, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Administrator Systemu', 'admin@zglasto.pl', true, '$2b$10$rOz7zQX8rXq9zQX8rXq9zQX8rXq9zQX8rXq9zQX8rXq9zQX8rXq9', true, now(), now());

-- Pracownicy służb miejskich
INSERT INTO users (id, name, email, email_verified, password_hash, is_active, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440002', 'Jan Kowalski', 'jan.kowalski@mpk.krakow.pl', true, '$2b$10$hash1', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440003', 'Anna Nowak', 'anna.nowak@zgk.krakow.pl', true, '$2b$10$hash2', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440004', 'Piotr Wiśniewski', 'piotr.wisniewski@pok.krakow.pl', true, '$2b$10$hash3', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440005', 'Maria Zielińska', 'maria.zielinska@zdz.krakow.pl', true, '$2b$10$hash4', true, now(), now());

-- Mieszkańcy zgłaszający incydenty
INSERT INTO users (id, name, email, email_verified, password_hash, is_active, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440006', 'Katarzyna Wojcik', 'katarzyna.wojcik@email.com', true, '$2b$10$hash5', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440007', 'Michał Szymański', 'michal.szymanski@email.com', true, '$2b$10$hash6', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440008', 'Ewa Dombrowska', 'ewa.dombrowska@email.com', false, '$2b$10$hash7', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440009', 'Tomasz Lewandowski', 'tomasz.lewandowski@email.com', true, '$2b$10$hash8', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440010', 'Agnieszka Malinowska', 'agnieszka.malinowska@email.com', true, '$2b$10$hash9', true, now(), now());
