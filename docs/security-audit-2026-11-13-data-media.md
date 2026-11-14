# Audyt bezpieczeństwa danych i mediów — 2026-11-13

Raport zachowuje historyczne ustalenia i ścieżki plików z dnia audytu. Przed pierwszym
wdrożeniem usunięto katalog migracji oraz jego test legacy. Bieżący schemat i granty
powstają od zera zgodnie z [dokumentacją bazy](../database/README_DATABASE.md).

## Wynik

Naprawiono dwie potwierdzone ścieżki: wydawanie niezweryfikowanych oryginałów zdjęć oraz
bezwarunkowe kasowanie danych przy historycznej migracji. Rozdzielenie ról DB (DM-03) zostało następnie zaimplementowane i sprawdzone w izolowanym
PostgreSQL/PgBouncerze. DM-04 dotyczące IAM RustFS jest również naprawione; dowody i rollout opisuje raport infrastruktury.
Nie potwierdzono, że występują również w rzeczywistym środowisku produkcyjnym.

Klasyfikacja OWASP poniżej odnosi się do OWASP Top 10:2021. Nie wykonywano ataków na
zewnętrzne systemy, odczytu sekretów ani modyfikacji istniejących danych. Zachowano zmiany
parenta; bez commitów, branchy i zmian manifestów/lockfile. W pierwszym etapie Compose/k8s wyłącznie czytano; podczas implementacji DM-03 rozszerzono
zakres o ich fragmenty DB oraz kontrakty sekretów i narzędzia operacyjne.

## Pokrycie i metoda

- `database/`: wszystkie skrypty inicjalizacji, migracje 001–016, pg_hba, pgBackRest,
  skrypty startu i backupu oraz dokumentacja.
- `pgbouncer/`: skrypt uruchomienia i odczyt konfiguracji TLS/poolingu w Compose/k8s;
  Dockerfile nie był edytowany.
- `backend/nest/modules/media/`: odczyt zdjęć, inicjowanie uploadów, autoryzacja zasobu,
  testy HTTP i kontraktów uploadu.
- `backend/nest/media-worker/`: dekoder, limity, stan zadań, cleanup, kolejki, retry,
  idempotencja, health/runtime i testy.
- `backend/storage/`: adapter S3, podpisywanie PUT, normalizacja kluczy, metadane,
  odczyt/zapis/usuwanie/listowanie oraz probe integracyjny. `backend/media/` nie istnieje.
- Odczyt zależności poza sektorem: `backend/lib/incident-images.ts`, polityka dostępu do
  zdjęć, konfiguracja DB/TLS, backup/restore i audyt spójności obiektów, szablony wdrożenia.
- Skill: `skills/security-best-practices/SKILL.md` oraz
  `references/javascript-express-web-server-security.md`. Brak osobnego reference NestJS/SQL.

## Naprawione znaleziska

### DM-01 — Medium — oryginał omija walidację obrazu i usuwanie EXIF

**OWASP:** A04 Insecure Design. **CWE:** CWE-200, CWE-434.

**Lokalizacja:** [incident-media.service.ts:76](../backend/nest/modules/media/incident-media.service.ts:76),
[incident-media.service.ts:103](../backend/nest/modules/media/incident-media.service.ts:103).

**Dowód i warunki:** dotychczasowy SQL wybierał `COALESCE(processed_object_key,
original_object_key)` i analogicznie MIME/checksum bez sprawdzania statusu przetworzenia.
Autoryzowany odbiorca mógł pobrać oryginał przed zakończeniem pracy workera lub po jej
niepowodzeniu. Zdjęcie rozwiązania przy incydencie `resolved` ma odczyt publiczny:
odwiedzający znający URL otrzymywał także oryginalny EXIF/GPS, a walidacja sygnatury,
wymiarów i formatu w Sharp nie była warunkiem publikacji. Użytkownik kontrolujący upload
mógł dostarczyć błędne bajty pod dozwolonym MIME. Nie wykazano XSS ani obejścia polityki
uprawnień do samego incydentu.

**Naprawa:** usunięto fallback do oryginału. Dostępna jest wyłącznie reprezentacja `ready`
z MIME `image/webp` i metadanymi wyniku. Pozostałe stany zwracają 404 przed pobraniem
obiektu i przed obsługą warunkowego 304. Autoryzacja nadal jest wykonywana jako pierwsza.

**Test:** `media-http.test.ts`: pending/processing/failed z pasującym If-None-Match dają
404 bez pobierania obiektu; brak metadanych WebP blokuje odczyt. Pozostały test publicznego
WebP, prywatnego odczytu przez administratora, odmowy anonimowi i poprawnego 304.
Dodatkowe testy Sharp wykazują odrzucenie SVG, fałszywego MIME i błędnych bajtów mimo
spójnych deklaracji klienta; istniejące testy sprawdzają usuwanie EXIF/ICC/XMP i limit pikseli.

**Wpływ na kontrakt:** klienci muszą czekać na `ready`; nie dostaną PNG/original w stanie
pending. Parent aktualizuje testy integracyjne starego kontraktu — nie cofać zabezpieczenia.

### DM-02 — High — historyczna migracja usuwa zgłoszenia i zależności

**OWASP:** A04 Insecure Design. **CWE:** CWE-664 (niewłaściwa kontrola cyklu życia zasobu).

**Lokalizacja:** [006-object-storage-images.sql:7](../database/migrations/006-object-storage-images.sql:7).

**Dowód i warunki:** wystarcza uruchomienie migracji 006 na bazie z danymi oraz jedną ze
starych kolumn `zdjecie_incydentu_*`. Wcześniej wykonywano `TRUNCATE TABLE incydenty
CASCADE`, zanim usunięto kolumny bytea. Operator aktualizujący taką instalację tracił całą
tabelę incydentów i zależne dane. To zagrożenie dostępności/integralności podczas aktualizacji,
nie zdalny endpoint pozwalający anonimowi kasować dane.

**Naprawa:** migracja blokuje tabelę `ACCESS EXCLUSIVE`, sprawdza, czy jest pusta,
i przerywa transakcję z jawnym komunikatem o potrzebie migracji danych. Nie kasuje rekordów.
Pusta baza historyczna i ponowienie są obsługiwane. Aktualizacja istniejącej bazy po
wykonanej już migracji 006 nie wymaga nowego SQL; poprawka zabezpiecza przyszłe uruchomienia.

**Test:** [legacy-image-migration.test.ts:62](../database/tests/legacy-image-migration.test.ts:62)
na odrębnym PostgreSQL 18.7: odmowa dla wypełnionej tabeli, zachowanie rekordu i kolumny
ze zdjęciem, sukces dla pustej tabeli i idempotentne ponowienie. Kontener bez sieci,
portów i trwałych wolumenów; usuwany po teście. 1 test / 7 asercji PASS.

## Potwierdzone problemy konfiguracji — przekazane parentowi/infra

### DM-03 — High — runtime DB używał bootstrapowego superusera — NAPRAWIONE W ŹRÓDŁACH

**OWASP:** A05 Security Misconfiguration. **CWE:** CWE-250, CWE-269.

**Poprzednia ścieżka:** przykład wdrożenia używał tej samej roli dla `POSTGRES_USER`,
połączenia aplikacyjnego i bezpośredniego. PgBouncer wymuszał administratora upstream.
Przejęcie procesu/poświadczeń aplikacji dawało pełny dostęp do danych auth, DDL i potencjalnie
`COPY TO PROGRAM`. Warunkiem było wdrożenie według dostarczonej wspólnej konfiguracji.

**Implementacja:** [016-runtime-role-grants.sql:4](../database/migrations/016-runtime-role-grants.sql:4),
[06-runtime-roles.sh:4](../database/init-scripts/06-runtime-roles.sh:4),
[start-pgbouncer.sh:13](../pgbouncer/start-pgbouncer.sh:13).

- Trzy odrębne konta `zglosto_auth`, `zglosto_backend`, `zglosto_media_worker`:
  `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION NOINHERIT`.
- Jawne granty do konkretnych tabel/kolumn; backend bez account/session/verification i bez
  pełnego SELECT user, worker bez user/zgłoszeń/outboxa. Brak DDL, TEMP i dostępu do cron.
- PUBLIC nie otrzymuje dostępu do public schema/tabel/funkcji ani CONNECT/TEMP bazy;
  runtime otrzymuje tylko CONNECT i USAGE. Granty kolumnowe i odziedziczone członkostwa
  są usuwane przy reaplikacji. Role będące właścicielami obiektów powodują odmowę migracji.
- Trigger provisioningu jest SECURITY DEFINER z ustalonym search_path i wpisuje wyłącznie
  stałą rolę mieszkańca; bezpośrednie EXECUTE jest odebrane. Konta i uprawnienia powstają
  atomowo. CRUD auth, role aplikacyjne i przypisanie zgłaszającego zachowują wymagane granty.
- Admin pozostaje wyłącznie w database/operacjach `DATABASE_DIRECT_URL`; osobne hasła
  runtime i URL pochodzą z plików. PgBouncer generuje userlist trzech kont i nie zawiera
  `user=` ani hasła w wpisie upstream. Klient zachowuje swoją tożsamość w PostgreSQL.
- Zmieniono wszystkie bazowe/produkcyjne profile Compose oraz Kubernetes/K3s, selektywne
  mounty Secret, kontrakty sekretów i fixtures. Żaden runtime nie montuje hasła admina ani
  innych kont. Backend i auth potrafią czytać `DATABASE_URL_FILE` także bez shellowego loadera.
- Fresh init jest automatyczny i idempotentny. Istniejąca baza wymaga jawnego
  [apply-runtime-roles.sh](../database/apply-runtime-roles.sh) z flagą
  `--apply-runtime-role-separation`; hostowy wrapper zatrzymuje writerów/PgBouncera i zostawia
  je zatrzymane do wdrożenia nowych klientów. Nie uruchomiono go na istniejących danych.
- Kontrolowany wrapper deploy zatrzymuje writerów przed migracjami i nakłada hasła/granty
  po migracjach. Restore `--no-privileges` nakłada je ponownie przed uruchomieniem aplikacji.

**Testy:** [runtime-roles.test.ts](../database/tests/runtime-roles.test.ts),
[database-role-policy.test.ts](../scripts/database-role-policy.test.ts),
[env.database.test.ts](../authorization/src/env.database.test.ts),
[env.test.ts](../backend/config/env.test.ts).

Test tworzy wyłącznie osobne PG18.7/PgBouncer, prywatną sieć i efemeryczne certyfikaty,
bez trwałych wolumenów; PgBouncer publikuje wyłącznie losowy port localhost na potrzeby
rzeczywistego testu aplikacji auth. Sprawdza trzy poprawne loginy SCRAM przez
PgBouncera z `current_user`, odmowę złych haseł oraz logowania admina do poolera, CRUD
kont/sesji/weryfikacji, provisioning mieszkańca, CRUD zgłoszeń i tabel workera. Rzeczywisty moduł `authorization/src/auth.ts` przechodzi
rejestrację, logowanie hasłem, odczyt sesji z rolą mieszkańca i wylogowanie przez PgBouncera. Testy negatywne
obejmują `COPY PROGRAM`, CREATE/DROP/TEMP/CREATE ROLE, `pg_authid`, SUPERUSER/SET ROLE,
uprzywilejowaną funkcję i cudze tabele auth. Sprawdzane są reaplikacja, usuwanie niebezpiecznych
członkostw, odmowa dla właściciela obiektu oraz jawny wrapper istniejącej instalacji.
Polityka renderowanego Compose odrzuca wspólny URL i mounty administratora, a polityki
klastra wymagają osobnych kluczy Secret. Wyniki pełnej integracji podano w końcowej sekcji.

**Rollout i ograniczenie:** zmiana źródeł nie odbiera uprawnień już działającym kontenerom.
Właściciel instalacji musi przeprowadzić opisany kontrolowany rollout i zweryfikować konta
w swoim środowisku; nie użyto produkcyjnych sekretów ani nie zmieniano istniejącej bazy.
Szczegółowa procedura i zestaw grantów: [README_DATABASE](../database/README_DATABASE.md).

### DM-04 — High — aplikacja otrzymuje root credentials lokalnego RustFS

**OWASP:** A05 Security Misconfiguration. **CWE:** CWE-250, CWE-269.

**Lokalizacja:** [docker-compose.rustfs.yml:7](../docker-compose.rustfs.yml:7),
[k8s RustFS:45](../k8s/components/rustfs/statefulset.yaml:45).

**Dowód i warunki:** bootstrapowe `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` pochodzą z tych
samych danych `S3_*`, których używają klienci aplikacji. Kradzież poświadczeń procesu daje
uprawnienia administracyjne RustFS, zamiast wyłącznie operacji na prefiksie zdjęć.
Warunkiem jest użycie dostarczonego profilu RustFS; nie dowiedziono takiego stanu w zewnętrznym S3.

**Naprawa do wykonania przez infra/parenta:** osobne sekrety administratora i workloadów;
provisioning kont/polityk ograniczonych do bucketu/prefiksu. API potrzebuje staging PUT
(podpisy), odczytu wyników i operacji używanych w obsłudze zastąpienia obrazów; worker
potrzebuje odczytu staging oraz zapisu wyników i cleanup. `CreateBucket` tylko bootstrap,
a listowanie/backup oddzielną rolą operacyjną, po rozdzieleniu obecnego wspólnego adaptera.

**Weryfikacja:** statycznie potwierdzono wspólne źródło kluczy. Test odbiorczy po zmianie:
workload nie może wywołać admin API, zmienić bucket policy ani czytać innego prefiksu,
a upload/przetworzenie/GET nadal działają. Nie testowano zewnętrznego storage ani admin API.

## Warning RustFS KMS — warunki, bez potwierdzonego exploita tej instalacji

W `/tmp/zglosto-integration.log` wystąpił warning o wyłączonym
`RUSTFS_KMS_ENFORCE_SSE_KEY_POLICY`. Zgodnie z
[kodem RustFS](https://docs.rs/rustfs-config/latest/src/rustfs_config/constants/app.rs.html)
flaga dodaje kontrolę `kms:GenerateDataKey` przy SSE-KMS write i `kms:Decrypt` przy read,
a domyślnie jest wyłączona. Nie dotyczy SSE-S3 ani SSE-C.

Warunki wykorzystania: aktywne SSE-KMS i klucze, tożsamość z prawami S3 do danego obiektu,
lecz bez praw KMS do jego klucza, oraz poleganie na separacji tych kluczy jako granicy dostępu.
Wtedy sam dostęp S3 wystarcza do encrypt/decrypt. To nie omija braku praw S3 ani nie dowodzi
anonimowego dostępu do prywatnego bucketu. W przejrzanych manifestach nie ma włączenia KMS,
adapter nie wysyła żądań SSE-KMS; nie odczytywano rzeczywistej konfiguracji bucketu.
Nie klasyfikuję samego warningu jako potwierdzonej podatności tej instalacji.

Przed uruchomieniem SSE-KMS należy nadać workloadom granty do konkretnych kluczy, włączyć
flagę i sprawdzić negatywny test dostępu do obiektu pod cudzym kluczem. Root credentials
DM-04 nie zapewniają takiej separacji. Zmiana flagi bez konfiguracji grantów może zablokować
odczyt/zapis; nie wprowadzono ślepej zmiany. Parent potwierdził i naprawił niezależny błąd
regionu RustFS/S3 powodujący nieudany CreateBucket; nie był to błąd autoryzacji KMS.

## Zweryfikowane zabezpieczenia

- Zapytania runtime w sektorze przekazują dane przez parametry `$n`; dynamiczny identyfikator
  w migracji 004 używa `format('%I', ...)`. Nie potwierdzono SQL injection.
- Zdjęcie jest autoryzowane przed ETag/304 i pobraniem; report prywatny, resolution publiczne
  wyłącznie dla resolved. Nie potwierdzono IDOR w sprawdzanych endpointach.
- Upload resolution sprawdza `incidentId + serviceKey`; klucz staging generuje serwer UUID,
  rozszerzenie wynika z allowlisty MIME. Nie ma sterowanego nazwą pliku odczytu systemu plików.
- Podpis PUT wiąże klucz, długość, Content-Type, metadane checksum i czas ważności.
  SHA w metadanych S3 jest deklaracją klienta, nie dowodem zgodności bajtów; worker ponownie
  oblicza SHA-256 przed dekodowaniem. Po DM-01 jest to warunek publikacji.
- Sharp: allowlista dekodowanych formatów, porównanie MIME, brak SVG na wyjściu, odrzucanie
  animacji, limit 5 MiB/32 mln pikseli/8192 px na bok, WebP do 2000 px, bez EXIF/ICC/XMP.
  Limit kanałów, prefetch domyślnie 1 i concurrency 1 ograniczają obciążenie.
- Wiadomości mają limit 64 KiB, walidowany envelope/properties, ograniczone retry i DLQ;
  repozytorium sprawdza job/image/revision/source key, używa transakcji i ledgeru konsumenta.
- PostgreSQL TCP wymaga TLS i SCRAM, odrzuca plaintext IPv4/IPv6; PgBouncer wymaga TLS
  klienta i verify-full upstream. Klient DB ustawia CA, TLS 1.3 i rejectUnauthorized.
  Lokalny socket trust jest ograniczony do kontenera DB — nie jest anonimowym TCP.
- Backup SECURITY DEFINER ma stałe polecenie, search_path=pg_catalog i REVOKE PUBLIC.
  Skrypty nie interpolują dowolnego typu backupu do shella (allowlista full/diff).
- pgBackRest ma WAL i retencję; logiczny backup paruje DB/S3, zatrzymuje writerów,
  używa prywatnego katalogu/umask 077 i SHA-256; restore weryfikuje artefakty przed odtworzeniem.

## Testy, ograniczenia i pozostałe ryzyka

Wykonano z Bun 1.4.4:

- `cd backend && bun run --bun vitest run nest/modules/media/media-http.test.ts nest/modules/media/image-upload.service.test.ts nest/media-worker` — **26 PASS**, 5 plików.
- `bun test database/tests/legacy-image-migration.test.ts` — **1 PASS**, 7 asercji.
- `cd backend && bun run --bun tsc -p tsconfig.json --noEmit` — **PASS**.
- Oxfmt i Oxlint dla zmienionych plików TS; wyłącznie lokalne zmiany w swoim sektorze.

Dodatkowa weryfikacja implementacji DM-03:

- `bun test database/tests/runtime-roles.test.ts` — **7 PASS, 73 asercje**; PostgreSQL
  `18.7-alpine3.24`, PgBouncer `v1.26.1-p0`, SCRAM i TLS 1.3/verify-full. Obejmuje rzeczywisty
  signup/login/session/logout Better Auth, odmowy administracyjne i kontrolowaną migrację.
- `bun test scripts/database-role-policy.test.ts` — **2 PASS, 12 asercji**, w tym negatywne
  fixtures wspólnego URL, podmontowania hasła/URL admina i wymuszenia admina upstream.
- Backend env/DB/media — **50 PASS**; auth env/auth/security — **9 PASS**.
- `bun scripts/test-auth-provisioning.ts` — **PASS** (backfill, zachowanie ról, atomiczność,
  retry/rollback, cascade i fresh install).
- `bun test ./scripts/test-infrastructure.ts --timeout 30000` — **17 PASS**.
- Produkcyjna macierz Compose — **54 kombinacje PASS**, z nową polityką izolacji DB.
  Negatywne testy produkcyjnej polityki Compose — **PASS**.
- Kubernetes/K3s: cluster-configuration, cluster-stateful-services i workloads-security — **PASS**.
- Backend/auth typecheck, Oxlint zmienionych TS oraz docs-site check — **PASS**.
- `bun run test:bun-deployment-policy` — **3 PASS** (wraz z typecheckiem skryptów wdrożenia).
- Faktyczne obrazy database/PgBouncer uruchomione osobno w projekcie `security-db-roles`
  (`up --build --no-deps --wait database pgbouncer`) — **healthy/PASS**. Potwierdzono
  trzy tożsamości przez pooler, odmowę `perform_full_backup()` dla każdej roli runtime
  i udany administracyjny `perform_differential_backup()` z pgBackRest. Stos usunięto
  przez trap po próbie; dowód lokalny: `/tmp/security-db-roles-database-stack.log`.
  Healthcheck poolera jawnie ładuje sekrety plikowe; test ten wykrył i zabezpieczył różnicę
  między środowiskiem entrypointu a `docker exec`/healthcheck.
- Fixture hasła backendu zawiera apostrof, cudzysłów i backslash. Logowanie bezpośrednie
  i przez PgBouncera przechodzi; URL używa percent-encoding, a userlist podwajania
  cudzysłowów według [formatu auth_file PgBouncera](https://www.pgbouncer.org/config#authentication-file-format).

Uruchomiono pełną integrację na odrębnym projekcie `security-db-roles` i portach
24335/26432/29956/25671, bez ingerencji w istniejącą instalację. Build obrazów przeszedł,
ale start został zatrzymany przez mount serwisu S3 `storage_provision`:
`invalid mount path: 'nosuid' mount path must be absolute`. Stos testowy został posprzątany.
Nie jest to PASS pełnej integracji/restore. Parent prowadzący S3 otrzymał błąd do poprawy.
Pełne `check:source` zatrzymało się na niezaktualizowanej liście serwisów S3 w
`check-deployment-baseline` (nowy `storage_provision`); samodzielne polityki DB przechodzą.
Obie przeszkody są poza implementacją DM-03, bez cofania nowych grantów.

W `test-phase0-integration.sh` zmieniono wyłącznie asercje DB: dokładne mapowanie kont,
sondy TLS z hasłem backendu i testy CA/SAN poolera na roli faktycznie dozwolonej przez SCRAM.
Zachowano równoległe poprawki parenta dotyczące Redis, backupu i mediów. Narzędzia
`docker exec` do DB/PgBouncera jawnie uruchamiają loader sekretów, ponieważ taki proces
nie dziedziczy eksportów entrypointu; jawny wrapper migracji również obsługuje admin URL z pliku.
Nie wykonywano produkcyjnego restore/PITR, odczytu rzeczywistych ACL/IAM/bucket policy,
testów na produkcyjnych certyfikatach ani fuzzingu dekoderów. Istniejących danych nie migrowano.

RLS nie jest skonfigurowane. Samo to nie dowodzi IDOR: kontrola per użytkownik jest w API,
a role usługowe DB nie niosą tożsamości końcowego użytkownika. Proste włączenie RLS z jedną
wspólną rolą (zwłaszcza superuserem) nie daje skutecznej izolacji; rozdzielenie ról DM-03 jest już wdrożone w źródłach; dalsza izolacja per użytkownik wymaga
projektu kontekstu transakcyjnego użytkownika.

Retencja danych wymaga polityki właściciela: cleanup usuwa oryginały `ready` i wygasłe pending,
lecz zachowuje oryginały `failed`. Podpisany PUT może być ponownie użyty do upływu ważności,
także po usunięciu oryginału; odtworzony staging może pozostać osierocony. Nie ma publicznego
odczytu tych obiektów po DM-01; audyt obiektów raportuje osierocenia, bez automatycznego
usuwania. Lifecycle staging powinien uwzględniać aktywne zadania i maksymalny czas ważności
URL — nie dodawano arbitralnej retencji ani masowego kasowania istniejących danych.

Adapter odczytuje cały obiekt do pamięci przed sprawdzeniem limitów workera. Signed PUT
ogranicza rozmiar normalnego uploadu; przejęty writer S3/provider może podać obiekt większy.
Oddzielne IAM DM-04 i streaming z twardym limitem są dalszym zabezpieczeniem tej granicy.

Konfiguracja repo nie potwierdza szyfrowania backupów at rest, oddzielnego failure domain,
Object Lock ani polityki kasowania PII/tokenów auth. Backup zawiera te same wrażliwe dane
co DB/obiekty; umask i TLS nie zastępują szyfrowania nośnika/kopii poza hostem. Weryfikacja
należy do docelowego wdrożenia, nie została przedstawiona jako potwierdzony wyciek.

## Końcowy odbiór parenta

Przeszkody łączenia sektorów opisane wcześniej są usunięte. Pełna integracja
z rozdzielonymi rolami DB, IAM RustFS, operations backupem i ponownymi grantami
po restore zakończyła się kodem0. Pełny check: PASS. Nie wykonywano migracji
istniejących instalacji; obowiązuje opisana procedura kontrolowanego rollout.
