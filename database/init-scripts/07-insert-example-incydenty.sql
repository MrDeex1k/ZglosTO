-- Przykładowe zgłoszenia incydentów w różnych statusach

-- Zgłoszenia oczekujące (ZGŁOSZONY)
INSERT INTO incydenty (id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, sprawdzenie_incydentu, status_incydentu, typ_sluzby) VALUES
(uuid_generate_v4(), 'Zepsuty przystanek autobusowy na ul. Królewskiej - zniszczona wiata', 'katarzyna.wojcik@email.com', false, 'ZGŁOSZONY', 'Miejskie Przedsiębiorstwo Komunikacyjne'),
(uuid_generate_v4(), 'Brak oświetlenia ulicznego przy ul. Straszewskiego 15', 'michal.szymanski@email.com', false, 'ZGŁOSZONY', 'Zakład Gospodarki Komunalnej'),
(uuid_generate_v4(), 'Zapchana studzienka kanalizacyjna na rogu ul. Warszawskiej i Krakowskiej', 'ewa.dombrowska@email.com', false, 'ZGŁOSZONY', 'Pogotowie Kanalizacyjne'),
(uuid_generate_v4(), 'Duże wyrwy w jezdni na ul. Długiej - niebezpieczne dla rowerzystów', 'tomasz.lewandowski@email.com', false, 'ZGŁOSZONY', 'Zarząd Dróg'),
(uuid_generate_v4(), 'Przewrócony kosz na śmieci przy placu Nowy', 'agnieszka.malinowska@email.com', false, 'ZGŁOSZONY', 'Zakład Gospodarki Komunalnej');

-- Zgłoszenia w trakcie naprawy (W TRAKCIE NAPRAWY)
INSERT INTO incydenty (id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, sprawdzenie_incydentu, status_incydentu, typ_sluzby) VALUES
(uuid_generate_v4(), 'Awaria sygnalizacji świetlnej na skrzyżowaniu ul. Basztowej z ul. Grodzką', 'katarzyna.wojcik@email.com', true, 'W TRAKCIE NAPRAWY', 'Zarząd Dróg'),
(uuid_generate_v4(), 'Zniszczone ławki w parku Jordana - graffiti i połamane siedziska', 'michal.szymanski@email.com', true, 'W TRAKCIE NAPRAWY', 'Zakład Gospodarki Komunalnej'),
(uuid_generate_v4(), 'Problemy z kursowaniem tramwajów linii 4 - opóźnienia co 15 minut', 'ewa.dombrowska@email.com', true, 'W TRAKCIE NAPRAWY', 'Miejskie Przedsiębiorstwo Komunikacyjne');

-- Zgłoszenia naprawione (NAPRAWIONY)
INSERT INTO incydenty (id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, sprawdzenie_incydentu, status_incydentu, typ_sluzby) VALUES
(uuid_generate_v4(), 'Przerwa w dostawie wody na os. Na Skarpie - trwała 3 godziny', 'tomasz.lewandowski@email.com', true, 'NAPRAWIONY', 'Zakład Gospodarki Komunalnej'),
(uuid_generate_v4(), 'Zawalone drzewo na chodniku ul. Karmelickiej - blokowało przejście', 'agnieszka.malinowska@email.com', true, 'NAPRAWIONY', 'Zakład Gospodarki Komunalnej'),
(uuid_generate_v4(), 'Wandalizm - wybite szyby w przystanku na pl. Matejki', 'katarzyna.wojcik@email.com', true, 'NAPRAWIONY', 'Miejskie Przedsiębiorstwo Komunikacyjne'),
(uuid_generate_v4(), 'Nieczynna fontanna na Rynku Głównym - nie działa od tygodnia', 'michal.szymanski@email.com', true, 'NAPRAWIONY', 'Zakład Gospodarki Komunalnej'),
(uuid_generate_v4(), 'Zablokowany wjazd do garażu podziemnego przy ul. Westerplatte', 'ewa.dombrowska@email.com', true, 'NAPRAWIONY', 'Zarząd Dróg');
