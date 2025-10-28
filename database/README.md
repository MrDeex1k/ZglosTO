# PostgreSQL 18 Database

Ten folder zawiera konfigurację bazy danych PostgreSQL 18 dla projektu ZglosTO.

## Struktura
````markdown
# PostgreSQL 18 Database

Ten folder zawiera konfigurację bazy danych PostgreSQL 18 dla projektu ZglosTO.

## Struktura

```
database/
├── Dockerfile              # Obraz Docker dla PostgreSQL 18
├── init-scripts/          # Skrypty inicjalizacyjne SQL (wykonywane w kolejności alfabetycznej)
│   ├── 01-init.sql       # Główny skrypt inicjalizacyjny (rozszerzenia)
│   └── 02-create-tables.sql  # Tworzenie tabel aplikacji
└── README.md             # Ten plik
```

## Struktura bazy danych

Plik inicjalizacyjny z definicjami tabel znajduje się w `database/init-scripts/02-create-tables.sql`.

Poniżej znajduje się opis struktury bazy (PostgreSQL 18) używanej przez aplikację.

### Typy ENUM
- `status_incydentu_enum` — wartości: `ZGŁOSZONY`, `W TRAKCIE NAPRAWY`, `NAPRAWIONY`
- `typ_sluzby_enum` — wartości: `Miejskie Przedsiębiorstwo Komunikacyjne`, `Zakład Gospodarki Komunalnej`, `Pogotowie Kanalizacyjne`, `Zarząd Dróg`, `Inne`
- `uprawnienia_enum` — wartości: `mieszkaniec`, `sluzby`, `admin`

### Tabela: incydenty

Kolumny:
- `id_zgloszenia` uuid PRIMARY KEY — domyślnie generowane funkcją `uuidv7()` (Postgres 18)
- `opis_zgloszenia` varchar(255) NOT NULL — opis zgłoszenia (max 255 znaków)
- `mail_zglaszajacego` varchar(50) NOT NULL — adres mailowy zgłaszającego (max 50 znaków)
- `zdjecie_incydentu` bytea — opcjonalne zdjęcie incydentu
- `sprawdzenie_incydentu` boolean NOT NULL DEFAULT FALSE — czy incydent został sprawdzony
- `status_incydentu` `status_incydentu_enum` NOT NULL DEFAULT 'ZGŁOSZONY'
- `typ_sluzby` `typ_sluzby_enum` — typ służby odpowiedzialnej (opcjonalne)

### Tabela: uzytkownicy

Kolumny:
- `id_uzytkownika` uuid PRIMARY KEY — domyślnie `uuidv7()`
- `mail` varchar(50) NOT NULL UNIQUE — adres e-mail użytkownika
- `haslo` varchar(40) NOT NULL — hasło (wymagane: min 10, max 40 znaków). Uwaga: w aplikacji rekomendowane przechowywanie hasła w formie zahashowanej (bcrypt/argon2).
- `uprawnienia` `uprawnienia_enum` NOT NULL DEFAULT 'mieszkaniec'

## Inicjalizacja bazy danych

Skrypty w folderze `init-scripts/` są automatycznie wykonywane podczas pierwszego uruchomienia kontenera PostgreSQL. Pliki są wykonywane w **kolejności alfabetycznej**.

Obecnie dostępne skrypty:
- `01-init.sql` - rozszerzenia PostgreSQL (uuid-ossp, pg_trgm)
- `02-create-tables.sql` - tworzenie tabel aplikacji

#### Jak dodać nowy skrypt?

1. **Utwórz plik** w folderze `init-scripts/` z nazwą zaczynającą się od liczby (np. `03-moj-skrypt.sql`)
2. **Nazwa powinna być opisowa** i zaczynać się od kolejnego numeru
3. **Skrypt zostanie automatycznie wykonany** przy następnym uruchomieniu kontenera

⚠️ **WAŻNE**: Skrypty są wykonywane tylko przy **pierwszym uruchomieniu** kontenera. Jeśli chcesz wykonać dodatkowy skrypt później, musisz:
- Zrestartować kontener z nową nazwą wolumenu
- Lub wykonać skrypt ręcznie przez `docker-compose exec database psql -U user -d db -f /path/to/script.sql`

## Uruchomienie

### Uruchomienie całego stosu aplikacji

```bash
docker-compose up -d
```

### Uruchomienie tylko bazy danych

```bash
docker-compose up -d database
```

### Sprawdzenie statusu

```bash
docker-compose ps
```

### Sprawdzenie logów

```bash
docker-compose logs database
```

## Zarządzanie danymi

### Backup bazy danych

```bash
docker-compose exec database pg_dump -U zglosto_user zglosto_db > backup.sql
```

### Przywracanie z backupu

```bash
docker-compose exec -T database psql -U zglosto_user -d zglosto_db < backup.sql
```

### Czyszczenie danych

⚠️ **UWAGA**: To usunie wszystkie dane!

```bash
docker-compose down -v
```

## Health Check

Kontener PostgreSQL ma skonfigurowany health check, który sprawdza:
- Czy baza danych jest gotowa do przyjmowania połączeń
- Test wykonywany co 10 sekund
- Timeout 5 sekund
- 5 prób przed uznaniem za unhealthy

## Wolumeny

Dane PostgreSQL są przechowywane w wolumenie Docker `postgres-data`, co zapewnia:
- Trwałość danych między restartami kontenerów
- Izolację danych
- Łatwe zarządzanie i backup

## Połączenie z backendem

Backend automatycznie łączy się z bazą danych używając zmiennej środowiskowej `DATABASE_URL`.
Backend czeka na to, aż baza danych będzie "healthy" dzięki konfiguracji `depends_on`.

## Bezpieczeństwo

1. **Używaj silnych haseł** - nie używaj domyślnego hasła w produkcji
2. **Regularnie aktualizuj** - utrzymuj PostgreSQL w najnowszej wersji
3. **Backupy** - regularnie twórz kopie zapasowe bazy danych
4. **Sieć** - baza danych jest w izolowanej sieci Docker `zglosto-net`

## Rozwiązywanie problemów

### Nie można połączyć się z bazą danych

1. Sprawdź czy kontener działa: `docker-compose ps`
2. Sprawdź logi: `docker-compose logs database`
3. Sprawdź health check: `docker inspect zglosto-postgres`

### Reset bazy danych

```bash
docker-compose down
docker volume rm zglosto_postgres-data
docker-compose up -d database
```

## Wersja PostgreSQL

Ten projekt używa **PostgreSQL 18** - najnowszej wersji z ulepszoną wydajnością i nowymi funkcjami.

### Uwaga o init-scripts
Pliki znajdujące się w `database/init-scripts/` są wykonywane tylko przy **pierwszym** tworzeniu wolumenu danych (np. `postgres-data`). Jeśli chcesz, aby zmiany w skryptach zostały zastosowane automatycznie, uruchom destrukcyjny reinit (ostrzegamy: utracisz wszystkie dane):

```bash
docker compose down
docker compose down -v   # usuwa wolumeny, w tym postgres-data — DESTRUKCYJNE
docker compose up --build -d
```

### Weryfikacja
Po uruchomieniu świeżej instancji możesz sprawdzić, czy rola istnieje:

```bash
docker compose exec -e PGPASSWORD=admin_zglosto database psql -U zglosto_admin -d postgres -c "SELECT rolname FROM pg_roles WHERE rolname='zglosto_admin';"
```
