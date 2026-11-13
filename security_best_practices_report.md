# Audyt bezpieczeństwa ZgłosTO — 2026-11-13

## Wynik

Audyt objął pięć sektorów, każdy sprawdzony przez subagenta gpt-6.1-sol z reasoning HIGH.
Najpierw zaktualizowano zależności i obrazy. Następnie wdrożono naprawy kodu,
konfiguracji i provisioningu, z regresjami jednostkowymi oraz testami rzeczywistych
PostgreSQL/PgBouncer/RustFS/Redis. Zmiany są lokalne w repozytorium: nie wdrożono ich
na istniejącą produkcję, nie rotowano jej sekretów ani nie migrowano istniejących danych.

To audyt źródeł i izolowanego środowiska, nie certyfikacja OWASP ani zapewnienie braku
podatności. Klasyfikacje sektorów jawnie odnoszą się do OWASP Top 10:2021 i CWE.

## Najważniejsze naprawy

- **High — baza:** oddzielono konta auth/API/workera od administratora. Jawne granty,
  ograniczone role, osobne pliki sekretów, pooler bez wymuszania administratora,
  idempotentny provisioning i procedura kontrolowanej migracji.
- **High — storage:** oddzielono root RustFS, API, workera i operations; rzeczywisty
  provisioning IAM ogranicza operacje do bucketa/prefiksu. Runtime nie tworzy bucketów
  i nie otrzymuje root; backup/restore używa osobnego konta.
- **High — migracja i logi:** migracja 006 odmawia kasowania istniejących zgłoszeń.
  Logi edge nie utrwalają podpisanych query S3 ani tokenów callbacków.
- **Medium — sesje i dostęp:** usunięto prywatny stan/cache po logout i zmianie
  przypisanej służby, poprawiono cleanup po 403 i fragmentów SecureStore.
- **Medium — API:** mutacje wymagają JSON i odrzucają cross-site; logi wyjątków nie
  ujawniają dowolnych komunikatów, query ani stacków z danymi klienta.
- **Medium — obrazy:** endpoint wydaje tylko gotowy, oczyszczony WebP. Pending/failed
  i oryginały, które mogą zawierać EXIF/GPS lub niezweryfikowane bajty, są blokowane.
- **Medium/High warunkowe — auth/LLM:** cache nonce nie usuwa żywych wpisów przy
  nasyceniu; gateway ma współdzieloną atomową ochronę Redis i kwarantannę po utracie
  danych. Awaria limitera logowania odmawia prób; poprawiono parser proxy-IP.
  Deadline obejmuje body odpowiedzi modelu, zewnętrzny model wymaga HTTPS i odrzuca redirect.
- **Medium — backup:** prywatny nowy katalog 0700, walidacja właścicieli/rodziców,
  brak przyjmowania istniejących katalogów i symlinków jako celu kopii.
- **Supply chain:** poprawione zależności tranzytywne NPM, aktualizacja pakietów i
  stabilnych obrazów, usunięcie kompilatorów TS7 z runtime backendu, aktualizacja
  pakietów PgBouncera, przebudowa gosu aktualnym Go.

## Aktualizacje i zgodność

Bun1.4.4 z digestami builderów, DMR1.2.9; model Gemma zachował aktualny digest.
Pakiety rejestru aktualizowano przez projektowy SFW i kontrolę wieku publikacji.
`glob`, `minimatch`, `systeminformation` mają poprawione wersje wymuszone overrides.
Produkcyjny audyt NPM ma zero advisory. Mobile pozostaje na wspieranej macierzy
Expo58 (m.in. React19.3.0, RN0.88.1, AsyncStorage2.2.0), nie na niezgodnych
najnowszych majorach. TS6 dla Mobile i aliasu Astro oraz Babel7 zachowują zgodność
narzędzi; frontend/root korzystają z nowszych wersji zgodnie z manifestami.

## Dowody sektorowe

1. [Uwierzytelnianie, sesje, limity](docs/security-audit-2026-11-13-auth.md).
2. [Backend i API](docs/security-audit-2026-11-13-backend.md).
3. [Baza, storage, media i rollout ról DB](docs/security-audit-2026-11-13-data-media.md).
4. [Frontend, Mobile i dokumentacja](docs/security-audit-2026-11-13-clients.md).
5. [Docker, sieć, LLM, backup i IAM](docs/security-audit-2026-11-13-infrastructure.md).
6. [Pełny inwentarz CVE, wersji i digestów](docs/security-audit-2026-11-13-infrastructure-images.json).
7. [Migracja i provisioning kont storage](deploy/storage/README.md).

## Pozostałe ryzyka i granice

- Zewnętrzne obrazy nadal mają CVE. DMR zawiera m.in. podatne biblioteki user-space;
  tysiące rekordów dotyczą też nagłówków linux-libc-dev, a nie jądra uruchomionego
  kontenera. Nie wolno utożsamiać liczby rekordów z liczbą osiągalnych exploitów.
  CVE zlib, bibliotek Go i pluginów Grafany opisano z wersjami/fixami w inwentarzu.
  Nie przebudowano całych produktów upstream ani nie podmieniono zarządzanego DMR
  nieoficjalnym obrazem.
- Część połączeń wewnątrz zaufanej sieci jest plaintext (nginx→backend,
  lokalny storage/Redis/OTEL/DMR); publiczne i wybrane wewnętrzne granice mają TLS/mTLS.
  Dokładna macierz jest w raporcie infrastruktury. Nie sprawdzono CNI i polityk
  rzeczywistego klastra, host kernel, amd64 ani zewnętrznego providera.
- Redis replay wymaga noeviction, wspólnego primary i ochrony nonce przed
  administracyjnym usuwaniem. Współdzielone ACL z innymi workloadami nadal ograniczają
  ochronę wobec całkowicie przejętej aplikacji z prawem DEL; opisano ten model zaufania.
- Enumeracja zajętego e-maila rejestracji, produkcyjne dostarczanie poczty/reset
  hasła, moderacja PII w swobodnej treści publicznych zgłoszeń, paginacja i retencja
  mediów wymagają osobnych decyzji produktowych/operacyjnych. Nie maskowano tych braków
  kosmetyczną zmianą komunikatu ani arbitralnym usuwaniem danych.
- Backup wymaga szyfrowania i kopii poza hostem, a docelowe IAM/ACL i rotacja sekretów
  muszą być wdrożone zgodnie z procedurą. Źródłowa naprawa nie zmienia istniejących kont.
- Sprawdzono macierz Expo, testy i eksport Android/iOS na Node26. Nie testowano
  finalnych binariów na urządzeniu. Pełny Expo Doctor ma ograniczenie npm explain
  wobec składni overrides Bun; nie przedstawiono go jako pełny PASS.

## Końcowa walidacja

- Pełne `bun run check` na Node26.13.1 w PATH: **PASS** — dokumentacja, polityki
  źródeł i profili, dead-code, format/lint, typecheck, testy workspace, testy DB,
  warianty white-label, build web i eksport Android/iOS.
- `bun run test:integration` na odrębnym stosie OrbStack: **PASS**, kod wyjścia0.
  Obejmuje odzyskiwanie Redis i ochronę replay, TLS/mTLS i negatywne CA/SAN,
  role/API/logowanie, upload i oczyszczony WebP, retry/DLQ/outbox, awarię brokera,
  pełny backup/restore DB+S3 i ponowne granty po odtworzeniu oraz graceful shutdown.
- Faktyczne osiem obrazów: `check-image-contract --inspect --mode target`: **PASS**.
  Końcowy PgBouncer ma19.1MB przy budżecie20MB; zachowuje aktualny filesystem,
  bez zdublowanych starych warstw. Jego rzeczywiste loginy/uprawnienia potwierdzono
  ponownie przez10 testów bezpieczeństwa danych,92 asercje, wszystkie PASS.
- Rzeczywiste izolowane IAM S3 i archive roundtrip: **PASS**; szczegóły w raporcie infra.
- Gateway:26 testów PASS po regresji reconnect; Mobile153 i frontend85 testów PASS;
  kompletne workspace w `check` przechodzą. Nie dodawano wyników różnych przebiegów
  jako liczby niezależnych testów.
- Produkcyjny audyt NPM: **zero advisory**. CVE obrazów pozostają osobną kategorią.
- Zapisano JSON z image IDs, digestami, pakietami i CVE. Raport nie utożsamia
  czystego NPM ani pomyślnego buildu z brakiem podatności całej infrastruktury.

Weryfikacja nie wdraża zmian do istniejącej produkcji. Nowe instalacje używają
bezpieczniejszego provisioningu; istniejące wymagają kontrolowanego rollout/rotacji
według procedur DB i storage. Nie usunięto ani nie migrowano ich danych.
