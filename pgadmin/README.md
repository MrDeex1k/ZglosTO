# PgAdmin dla ZglosTO
===================

Ten plik opisuje sposób uruchomienia i używania kontenera PgAdmin w środowisku projektu ZglosTO.

## Szybkie uruchomienie
--------------------

Uruchom serwis `pgadmin` z `docker-compose`:

```
docker compose up -d pgadmin
```

Panel PgAdmin będzie dostępny lokalnie:

- przez NGINX reverse-proxy: `http://localhost:9753/pgadmin/`

## Dostęp i dane logowania
------------------------

Zaloguj się używając zmiennych środowiskowych skonfigurowanych dla serwisu:

- `PGADMIN_DEFAULT_EMAIL` (domyślnie `admin@local`)
- `PGADMIN_DEFAULT_PASSWORD` (domyślnie `admin`)

Jeżeli korzystasz z reverse-proxy (NGINX), dostęp do PgAdmin może być wystawiony pod ścieżką `/pgadmin/`.
W takim wypadku zwróć uwagę na możliwe problemy z przekierowaniami lub assetami (patrz sekcja "Uwaga").

## Dodanie serwera PostgreSQL w PgAdmin
-----------------------------------

Aby dodać serwer PostgreSQL (uruchomiony jako serwis `database` w `docker-compose`), użyj następujących ustawień:

- Host name/address: `database`
- Port: wartość `POSTGRES_PORT` (sprawdzona w `.env` / `docker-compose.yml`)
- Maintenance database / Database: `POSTGRES_DB` (np. `zglosto_db`)
- Username: `POSTGRES_USER` (np. `zglosto_user`)
- Password: `POSTGRES_PASSWORD`

## Uwaga
-----

- W standardowym compose usługi są podłączone do sieci `internal-net`, więc `pgadmin` komunikuje się z Postgresem po nazwie usługi (`database`).
- PgAdmin wewnątrz kontenera działa na root path, więc prosty reverse-proxy może nie przepisać wszystkich linków/assetów poprawnie. Jeśli zauważysz brakujące zasoby lub błędne przekierowania, można:
  - dodać reguły sub_filter w konfiguracji NGINX,
  - albo uruchomić PgAdmin z konfiguracją obsługującą zmienny `SCRIPT_NAME`.

## Rozwiązywanie problemów
-----------------------

- Brak połączenia z bazą: sprawdź, czy kontener `database` działa i czy `pgadmin` jest w tej samej sieci Docker.
- Niepoprawne logowanie: upewnij się, że używasz wartości z `.env` przypisanych do `pgadmin` w `docker-compose.yml`.
- Problemy z reverse-proxy: spróbuj uzyskać dostęp bezpośrednio na porcie `5050`, aby potwierdzić czy problem dotyczy NGINX.