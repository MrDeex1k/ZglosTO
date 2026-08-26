# Backup, restore i lifecycle danych

## Zakres

Backup jednej instalacji jest jedną spójną parą:

- logiczny dump PostgreSQL wykonany przez `DATABASE_DIRECT_URL`;
- provider-neutralne archiwum wszystkich obiektów pod aktywnym `S3_OBJECT_PREFIX`;
- raport zgodności referencji bazy z bucketem;
- metadane formatu i sumy SHA-256 wszystkich artefaktów.

Archiwum Object Storage korzysta wyłącznie z API S3 przez `S3_*`. Ten sam kod obsługuje
lokalny RustFS, AWS S3, Cloudflare R2 i zgodnego providera. Nie kopiuje surowego wolumenu
RustFS i nie zapisuje poświadczeń w backupie.

Wszystkie operacje PostgreSQL wykonywane przez `DATABASE_DIRECT_URL` używają TLS 1.3,
`PGSSLMODE=verify-full` i Database CA. Omijanie PgBouncera nie oznacza omijania szyfrowania
ani weryfikacji DNS `database`.

## Tworzenie backupu

Pełny lokalny stack Compose:

```bash
./scripts/backup-compose.sh backups/$(date -u +%Y%m%dT%H%M%SZ)
```

Wariant NoRustFS z zewnętrznym bucketem:

```bash
./scripts/backup-compose.sh backups/manual \
  --env-file .env \
  --file docker-compose.no-rustfs.yml
```

Skrypt zatrzymuje publiczny Nginx na czas snapshotu, czeka na zakończenie jego bieżących
połączeń, audytuje bucket, wykonuje `pg_dump --format=custom` bez PgBouncera i archiwizuje
obiekty. Następnie uruchamia Nginx również wtedy, gdy backup się nie powiedzie.

Katalog backupu zawiera:

- `database.dump`;
- `object-storage.ndjson.gz`;
- `object-storage-audit.json`;
- `metadata.txt`;
- `SHA256SUMS`.

Kod wyjścia audytu `2` oznacza wykryte braki lub obiekty osierocone. Backup nadal powstaje,
aby nie utracić materiału diagnostycznego, ale wymaga sprawdzenia raportu.

W produkcyjnym profilu Compose ten sam kontrakt backupu musi działać przez automatyzację
hostową, zapisywać kopię poza failure domain hosta i nie zakładać dostępu operatora do
lokalnego katalogu repozytorium. Kubernetes/K3s realizują równoważny kontrakt przez
kontrolowany Job/CronJob i docelowy mechanizm snapshotów/PVC. Format logicznego dumpu,
archiwum S3, audytu i sum pozostaje identyczny we wszystkich trzech profilach.

## Odtwarzanie

Restore jest operacją utrzymaniową i zastępuje bieżący stan PostgreSQL stanem z dumpu:

```bash
./scripts/restore-compose.sh backups/manual
```

Skrypt przed zmianą danych sprawdza format oraz SHA-256. Następnie zatrzymuje Nginx, backend,
authorization i PgBouncer, odtwarza bazę przez bezpośredni URL, przywraca każdy obiekt przez
aktywny adapter S3, uruchamia usługi i wykonuje końcowy audyt.

Restore obiektów jest idempotentny i nadpisuje klucze obecne w archiwum, ale celowo nie usuwa
dodatkowych kluczy. Dzięki temu uszkodzone archiwum nie może skasować działającego bucketu.
Dla odtworzenia disaster recovery należy użyć pustego bucketu lub osobnego prefiksu. Końcowy
audyt zgłosi każdą nadmiarową albo brakującą zawartość.

## pgBackRest

pgBackRest jest drugą, fizyczną warstwą ochrony PostgreSQL:

- WAL jest wysyłany przez `archive_command`;
- przy pierwszym starcie powstaje stanza i pierwszy pełny backup;
- pełny backup jest wykonywany w niedzielę o 02:00;
- backup różnicowy jest wykonywany codziennie o 03:00;
- retencja wynosi cztery pełne i czternaście różnicowych backupów.

Repozytorium pgBackRest musi być przechowywane na trwałym nośniku innym niż podstawowy dysk
PostgreSQL w środowisku produkcyjnym. Automatyczny test projektu odtwarza przenośny dump
logiczny; procedurę PITR z pgBackRest należy dodatkowo ćwiczyć w docelowej infrastrukturze.
Faza 12 wymaga osobnego restore drill oraz pomiaru RTO/RPO dla Compose, Kubernetes i K3s.

## Lifecycle Object Storage

- aktywnego oryginału i WebP nie wolno usuwać, dopóki istnieje referencja w
  `incident_images`;
- aplikacja jedynie raportuje obiekty osierocone — nie usuwa ich automatycznie;
- usunięcie osieroconego obiektu wymaga osobnej, zatwierdzonej operacji po sprawdzeniu backupu;
- wersjonowanie, Object Lock i retencję kopii włącza się u aktywnego providera;
- rekomendowany punkt startowy to 30 dni backupów dziennych, 12 kopii miesięcznych i co
  najmniej jedna kopia w innym failure domain;
- skuteczność backupu potwierdza regularny restore drill, a nie samo istnienie pliku.

Ręczny audyt działającego stacku:

```bash
docker compose exec -T backend node dist/operations/object-storage-audit-cli.js
```

Kod `0` oznacza pełną zgodność, `2` — braki lub osierocone obiekty, a `1` — błąd techniczny.

## Automatyczna weryfikacja

`scripts/test-phase0-integration.sh` wykonuje pełny drill na izolowanych wolumenach:

1. tworzy zgłoszenia i obiekty;
2. wykonuje wspólny backup;
3. usuwa dane bazy i jeden obiekt;
4. odtwarza oba magazyny;
5. porównuje liczbę zgłoszeń, sprawdza odzyskany obiekt i uruchamia audyt spójności.
