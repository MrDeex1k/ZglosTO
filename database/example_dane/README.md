# Przykładowe dane testowe dla bazy danych ZglosTO

Ten folder zawiera przykładowe dane SQL do wypełnienia bazy danych celach testowych i demonstracyjnych.

## ⚠️ UWAGA: Dane są automatycznie wgrywane podczas podman compose build!

Pliki z tego folderu zostały skopiowane do `database/init-scripts/` z numeracją `05-*` do `08-*` i są wykonywane automatycznie podczas pierwszego uruchomienia kontenera PostgreSQL.

Jeśli chcesz **wyłączyć** automatyczne wgrywanie danych testowych, usuń pliki:
- `database/init-scripts/05-insert-example-users.sql`
- `database/init-scripts/06-insert-example-uzytkownicy.sql`
- `database/init-scripts/07-insert-example-incydenty.sql`
- `database/init-scripts/08-insert-example-sessions-tokens.sql`

## Struktura plików

- `01-insert-users.sql` - Podstawowi użytkownicy systemu (Better Auth)
- `02-insert-uzytkownicy-extended.sql` - Rozszerzone dane użytkowników z rolami
- `03-insert-incydenty.sql` - Zgłoszenia incydentów w różnych statusach
- `04-insert-sessions-tokens.sql` - Sesje i tokeny bezpieczeństwa

## Jak uruchomić dane testowe

### Opcja 1: Wykonanie wszystkich plików naraz
```bash
# Skopiuj pliki do kontenera
podman cp database/example_dane/01-insert-users.sql zglosto-postgres:/tmp/
podman cp database/example_dane/02-insert-uzytkownicy-extended.sql zglosto-postgres:/tmp/
podman cp database/example_dane/03-insert-incydenty.sql zglosto-postgres:/tmp/
podman cp database/example_dane/04-insert-sessions-tokens.sql zglosto-postgres:/tmp/

# Wykonaj pliki w kontenerze
podman exec -e PGPASSWORD=admin_zglosto zglosto-postgres psql -U zglosto_admin -d zglosto_db -h localhost -p 54325 -f /tmp/01-insert-users.sql
podman exec -e PGPASSWORD=admin_zglosto zglosto-postgres psql -U zglosto_admin -d zglosto_db -h localhost -p 54325 -f /tmp/02-insert-uzytkownicy-extended.sql
podman exec -e PGPASSWORD=admin_zglosto zglosto-postgres psql -U zglosto_admin -d zglosto_db -h localhost -p 54325 -f /tmp/03-insert-incydenty.sql
podman exec -e PGPASSWORD=admin_zglosto zglosto-postgres psql -U zglosto_admin -d zglosto_db -h localhost -p 54325 -f /tmp/04-insert-sessions-tokens.sql
```

### Opcja 2: Wykonanie pojedynczego skryptu
```bash
# Przykład dla użytkowników
podman cp database/example_dane/01-insert-users.sql zglosto-postgres:/tmp/
podman exec -e PGPASSWORD=admin_zglosto zglosto-postgres psql -U zglosto_admin -d zglosto_db -h localhost -p 54325 -f /tmp/01-insert-users.sql
```

## Opis przykładowych danych

### Użytkownicy (`01-insert-users.sql`)
- **Administrator**: admin@zglasto.pl
- **Pracownicy służb**: 4 użytkowników z różnych instytucji miejskich
- **Mieszkańcy**: 5 zwykłych użytkowników zgłaszających incydenty

### Role i uprawnienia (`02-insert-uzytkownicy-extended.sql`)
- **admin**: Administrator systemu
- **sluzby**: Pracownicy z 4 instytucji (MPK, ZGK, POK, ZDZ)
- **mieszkaniec**: Zwykli mieszkańcy

### Zgłoszenia incydentów (`03-insert-incydenty.sql`)
- **ZGŁOSZONY**: 5 nowych zgłoszeń oczekujących na sprawdzenie
- **W TRAKCIE NAPRAWY**: 3 zgłoszenia w trakcie realizacji
- **NAPRAWIONY**: 5 zgłoszeń zakończonych

### Sesje i tokeny (`04-insert-sessions-tokens.sql`)
- Aktywne sesje administratora i użytkowników
- Wygasłe sesje do testów
- Aktywne i zużyte tokeny resetowania hasła
- Tokeny weryfikacji email w różnych stanach

## Testowe konta do logowania

|             Email          | Hasło (symulowane) |     Rola     |         Opis          |
|----------------------------|--------------------|--------------|-----------------------|
|        admin@zglasto.pl    |       admin123     |     admin    | Administrator systemu |
| jan.kowalski@mpk.krakow.pl |        mpk123      | służby (MPK) |     Pracownik MPK     |
| katarzyna.wojcik@email.com |       user123      | mieszkaniec  |   Zwykły mieszkaniec  |

## Czyszczenie danych testowych

Aby usunąć wszystkie dane testowe:
```bash
podman exec -e PGPASSWORD=admin_zglosto zglosto-postgres psql -U zglosto_admin -d zglosto_db -h localhost -p 54325 -c "
DELETE FROM password_reset_tokens;
DELETE FROM email_verification_tokens;
DELETE FROM sessions;
DELETE FROM incydenty;
DELETE FROM uzytkownicy;
DELETE FROM users;
"
```

## Uwagi bezpieczeństwa

- Hasła w plikach są zasymulowane (nieprawdziwe hashe bcrypt)
- W produkcji należy używać prawdziwych, bezpiecznych hashy
- Tokeny sesji i resetowania są przykładowe - w rzeczywistości generowane losowo
- Dane zawierają realistyczne informacje dla celów demonstracyjnych
