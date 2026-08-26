# Faza 9 / krok 2 — produkcyjny kandydat Docker Compose

## Status

**Wdrożony 2026-07-24.**

Powstał odrębny profil produkcyjny dla pojedynczego hosta. Nie zastępuje on lokalnego
Compose używanego do developmentu. Jest pierwszym kandydatem produkcyjnym; test odtworzenia
na świeżym hoście, test restartu całej maszyny i certyfikacja RTO/RPO pozostają bramką
Fazy 12.

> **Aktualizacja 2026-07-26:** ten dokument opisuje historyczny kandydat z Fazy 9.
> [Krok 10 Fazy 11](phase-11-step-10-production-compose-modules.md) zastąpił obrazy
> z registry lokalnym buildem źródłowym, ustawił RustFS jako domyślny i wdrożył selektor
> modułów. Poniższe fragmenty o domyślnym zewnętrznym S3, digestach i rollbacku przez
> zachowany obraz nie są już aktualnym kontraktem.

## Uruchamiany zestaw

Profil składa się z:

- PostgreSQL, PgBouncer i RabbitMQ;
- Authorization, backendu NestJS, `media_worker` i `llm_gateway`;
- statycznego frontendu oraz publicznego Nginx.

RustFS nie jest częścią domyślnego profilu produkcyjnego. Backend pozostaje neutralny wobec
implementacji S3 i łączy się z zewnętrznym AWS S3, Cloudflare R2 albo innym kompatybilnym
Object Storage przez konfigurację. PgAdmin i historyczny FastAPI nie występują w profilu.

## Pliki i kontrakt

- `docker-compose.production.yml` jest override'em dla `docker-compose.no-rustfs.yml`;
- `.env.production.example` zawiera wyłącznie przykładową konfigurację niesekretną;
- `deploy/compose/required-secret-files.txt` jest kanoniczną listą plików sekretów;
- `scripts/check-production-compose.ts` egzekwuje politykę profilu;
- `scripts/production-compose.sh` realizuje cykl życia wydania;
- `deploy/compose/zglosto-compose.service` jest przykładową jednostką systemd.

Rzeczywisty plik środowiska powinien znajdować się poza checkoutem, np.
`/etc/zglosto/production.env`, a sekrety w chronionym katalogu wskazanym przez
`ZTO_SECRETS_DIR`. Pliki sekretów należy nadać właścicielowi procesu wdrożeniowego i
ograniczyć co najmniej do trybu `0600`; katalog powinien mieć tryb `0700`.

Każdy obraz musi pochodzić z registry i kończyć się rzeczywistym
`@sha256:<64 znaki>`. Zerowe digesty z pliku przykładowego służą tylko do sprawdzania
struktury i są odrzucane przez procedurę produkcyjną. Host nie kompiluje kodu.

## Bezpieczeństwo i izolacja

- jedynym publikowanym portem jest konfigurowalny port hosta (domyślnie `443`) prowadzący
  do nieuprzywilejowanego HTTPS `8443` Nginx;
- PostgreSQL, PgBouncer, RabbitMQ i usługi aplikacyjne są dostępne tylko w izolowanych
  sieciach Compose;
- Nginx używa TLS 1.3 i łączy się z Authorization przez mTLS;
- backend łączy się z Authorization przez mTLS, a usługi aplikacyjne z PostgreSQL przez
  TLS;
- sekrety są montowane jako pliki Compose secrets i ładowane dopiero w entrypoincie;
- usługi mają `no-new-privileges`, limity CPU, pamięci i PID, rotację logów, politykę
  restartu oraz kontrolowany czas zatrzymania;
- procesy bez potrzeby zapisu używają systemu plików `read_only`, `tmpfs` i
  `cap_drop: ALL`;
- Authorization, frontendowy Nginx, publiczny Nginx i PgBouncer działają na read-only
  rootfs, z `cap_drop: ALL` i bez odzyskiwania capabilities. Zapisy są ograniczone do
  jawnych `tmpfs`; oba Nginx-y oraz PgBouncer używają portów nieuprzywilejowanych.

Hardening obrazów i runtime zrealizowały kroki 3–8 Fazy 11. Supply chain oraz publikacja
zweryfikowanych digestów pozostają kolejnymi krokami tej fazy.

Firewall hosta powinien zezwalać publicznie wyłącznie na HTTPS oraz kontrolowany dostęp
administracyjny, np. SSH z zaufanej sieci. Docker API, porty bazy, brokera i management UI
nie mogą być wystawione do Internetu.

## Przygotowanie hosta

1. Zainstalować Docker Engine z Compose v2 obsługującym tagi `!reset` i `!override`.
2. Utworzyć użytkownika wdrożeniowego, katalog stanu oraz katalog sekretów.
3. Skopiować `.env.production.example` poza repozytorium i podstawić rzeczywiste adresy oraz
   digesty.
4. Dostarczyć wszystkie pliki wymienione w `required-secret-files.txt`.
5. Zapewnić zewnętrzny Object Storage, DNS, certyfikat publiczny, off-host backup i
   monitoring hosta.
6. Zainstalować jednostkę systemd i hostowy mechanizm odnawiania certyfikatów, który po
   atomowej wymianie plików wywoła `rotate-certs`.

Walidacja bez uruchamiania usług:

```bash
PRODUCTION_ENV_FILE=/etc/zglosto/production.env \
  ./scripts/production-compose.sh validate
```

## Cykl życia wydania

```bash
./scripts/production-compose.sh deploy
./scripts/production-compose.sh status
./scripts/production-compose.sh smoke
./scripts/production-compose.sh rollback
./scripts/production-compose.sh rotate-certs
./scripts/production-compose.sh backup /bezpieczny/katalog
ALLOW_PRODUCTION_RESTORE=1 ./scripts/production-compose.sh restore /bezpieczny/katalog
```

`deploy` wykonuje kolejno: walidację, pobranie obrazów, start PostgreSQL, migracje,
uruchomienie całego profilu, smoke test i zapisanie zestawu digestów jako bieżącego
wydania. Blokada operacyjna zapobiega równoczesnemu deployowi, rollbackowi lub restore.

Rollback odtwarza poprzedni zestaw obrazów, ale celowo nie cofa migracji bazy. Każda migracja
musi więc być kompatybilna wstecz z poprzednim wydaniem aplikacji. Backup i restore
delegują istniejącym, wersjonowanym procedurom projektu; produkcyjny restore wymaga jawnego
potwierdzenia zmienną `ALLOW_PRODUCTION_RESTORE=1`.

## Awaria hosta i cele odtworzeniowe

Compose jest profilem pojedynczego hosta i nie zapewnia wysokiej dostępności po utracie
maszyny. Jednostka systemd odtwarza kontenery po zwykłym restarcie Docker Engine/hosta, ale
całkowita awaria wymaga przygotowanego hosta zastępczego i backupu poza maszyną.

Do czasu certyfikacji w Fazie 12 przyjmujemy robocze, niegwarantowane cele:

- restart nieuszkodzonego hosta: RTO do 15 minut;
- utrata hosta przy gotowej maszynie zastępczej i sprawnym off-host backupie: RTO do 4
  godzin;
- RPO do 15 minut dopiero po uruchomieniu ciągłej archiwizacji WAL pgBackRest oraz
  wersjonowania/replikacji Object Storage.

Cele nie są SLA. Faza 12 musi potwierdzić je pomiarem pełnego restore, restartem hosta,
rotacją certyfikatów i testem rollbacku. Bez przejścia tych testów profil pozostaje
kandydatem, a nie certyfikowanym wdrożeniem.

## Bramka kroku

Automatyczna polityka sprawdza, że wynikowy Compose:

- ma dokładnie dziewięć oczekiwanych usług;
- nie zawiera lokalnego `build`, bind mountów kodu, PgAdmin ani RustFS;
- używa wyłącznie obrazów przypiętych SHA-256;
- publikuje tylko HTTPS przez Nginx;
- nie przekazuje sekretów jako jawnych wartości ENV;
- ma wymagane limity, restart, init, rotację logów i hardening.

W repozytorium bramka działa również na dokumentacyjnych digestach:

```bash
pnpm check:production-compose
```

Procedura `production-compose.sh validate` jest celowo surowsza: wymaga istniejących
sekretów oraz rzeczywistych, niezerowych digestów.
