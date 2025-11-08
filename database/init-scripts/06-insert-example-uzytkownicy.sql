-- Rozszerzone dane użytkowników z rolami i uprawnieniami

-- Administrator
INSERT INTO uzytkownicy (id_uzytkownika, uprawnienia, typ_uprawnien) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'admin', NULL);

-- Pracownicy służb miejskich
INSERT INTO uzytkownicy (id_uzytkownika, uprawnienia, typ_uprawnien) VALUES
('550e8400-e29b-41d4-a716-446655440002', 'sluzby', 'Miejskie Przedsiębiorstwo Komunikacyjne'),
('550e8400-e29b-41d4-a716-446655440003', 'sluzby', 'Zakład Gospodarki Komunalnej'),
('550e8400-e29b-41d4-a716-446655440004', 'sluzby', 'Pogotowie Kanalizacyjne'),
('550e8400-e29b-41d4-a716-446655440005', 'sluzby', 'Zarząd Dróg');

-- Zwykli mieszkańcy
INSERT INTO uzytkownicy (id_uzytkownika, uprawnienia, typ_uprawnien) VALUES
('550e8400-e29b-41d4-a716-446655440006', 'mieszkaniec', NULL),
('550e8400-e29b-41d4-a716-446655440007', 'mieszkaniec', NULL),
('550e8400-e29b-41d4-a716-446655440008', 'mieszkaniec', NULL),
('550e8400-e29b-41d4-a716-446655440009', 'mieszkaniec', NULL),
('550e8400-e29b-41d4-a716-446655440010', 'mieszkaniec', NULL);
