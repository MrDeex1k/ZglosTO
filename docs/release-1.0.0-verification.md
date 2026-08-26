# Weryfikacja kandydata źródłowego 1.0.0

Status wydania: `CERTIFIED SOURCE BASELINE`  
Zakres: 960 plików pierwszego commita nowej historii `main`  
Model Mobile: `SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED`

Ten dokument jest wersjonowanym dowodem przygotowania pierwszego wydania źródłowego.
Nie jest certyfikacją wdrożenia żadnego klienta. Zgodnie z poleceniem właściciela nie
wykonywano audytu bezpieczeństwa ani Trivy. Właściciel zatwierdził zastąpienie historii
`main` pojedynczym root commitem `chore(repo): release 1.0.0`; tag i GitHub Release są
osobnymi operacjami następującymi po publikacji tego commita.

## Aktualizacja Fazy A — 2026-08-26

Faza A rozstrzygnęła późniejszy wynik audytu zależności bez globalnego ignorowania
podatności. Lockfile zawiera `image-size@1.2.1`, nie `2.0.2`. Oba advisories dotyczą
lokalnego pipeline'u Metro w workspace `Mobile`; nie są osiągalne przez upload zdjęć
zgłoszeń ani runtime serwerowy. Dokładna, wygasająca decyzja oraz kontrole kompensujące są
opisane w [akceptacji ryzyka](security-risk-acceptance-image-size.md).

Dodano bramkę `pnpm audit:release`, kontrolę formatów i sygnatur assetów Mobile, zakaz
`image-size` w produkcyjnych obrazach Node.js, rozszerzony skan sekretów/PII, sumy SHA-256
oraz odtwarzalny test czystej kopii. Źródłowy CycloneDX utworzony podczas Fazy A został
później wycofany z zakresu wydania decyzją właściciela. Pierwszy test izolowany
wykrył zależność od lokalnych `dist` i wygenerowanego `expo-env.d.ts`; oba założenia
usunięto przed ponownym wynikiem PASS.

## Krok przejściowy A → B — 2026-08-26

Decyzję ADR-041 wdrożono w kodzie przed Fazą B. Produkcyjny build nie wymaga już binarki
Trivy, nie wykonuje skanu Trivy i nie tworzy źródłowych ani obrazowych SBOM-ów. Usunięto
konfigurację wyjątku Trivy, generator CycloneDX oraz polecenie `release:sbom`. Kontrakt
builda uruchamia zamiast tego istniejącą kontrolę publikowanego drzewa pod kątem sekretów,
danych prywatnych i niedozwolonych plików. Budżety i kontrakt obrazów pozostają aktywne.

## Finalny cleanup przed root commitem — 2026-08-26

- usunięto niewersjonowany `output/` i śledzone wcześniej screenshoty narzędziowe;
- usunięto nieużywany, niepełny duplikat schematu `db_code.sql`;
- zachowano `scripts/`, `tests/`, `database/migrations/` i `knip.json` jako wymagane
  elementy źródłowego wydania;
- migracje otrzymały jednoznaczną sekwencję `001`–`013` bez podwójnego numeru `008`;
- Knip nie traktuje już automatycznie każdego pliku w `scripts/` jako żywego entrypointu;
- lokalne skrypty certyfikacji per klient ponownie mają działające komendy PNPM, a
  nieistniejący historyczny handoff zdalny usunięto z aktywnych odwołań;
- poprawiono link Security Advisory do bieżącego repozytorium;
- po cleanupie przeszły Knip, format, kontrola Fazy 12, skan publicznego drzewa, kontrakt
  produkcyjnego builda i `git diff --check`. Pełnych buildów nie powtarzano, ponieważ ten
  etap nie zmienił kodu aplikacyjnego, zależności ani obrazów.

## Inwentaryzacja i ochrona pracy

- docelowa gałąź: `main`;
- historia docelowa: jeden root commit `chore(repo): release 1.0.0`;
- remote `origin`: `https://github.com/MrDeex1k/ZglosTO.git`;
- istniejące tagi: brak;
- kompletna lista śledzonych zmian, usunięć i plików nieśledzonych planowanych do
  pierwszego commita znajduje się w
  [manifeście plików](release-1.0.0-file-manifest.txt);
- nieśledzony katalog `Mobile/` został potraktowany jako część produktu, a nie artefakt;
- nie użyto `reset`, `checkout`, `clean` ani destrukcyjnego cofania cudzej pracy.

### Klasyfikacja elementów

| Kategoria                | Elementy i decyzja                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wymagane w wydaniu       | workspace PNPM/Turborepo, WEB, Mobile, backend, Authorization, `llm_gateway`, media worker, pakiety współdzielone, migracje, Docker/Compose, K8s/K3s, konfiguracja White-Label, testy, runbooki i dokumenty prawne              |
| Generowane i odtwarzalne | `node_modules`, `dist`, `.turbo`, `.expo`, `*.tsbuildinfo`, lokalny store PNPM, natywne katalogi Expo, logi i cache; nie są planowane do commita                                                                                |
| Historyczne              | dokumenty faz 0–11 i ADR-y; zachowane pod dotychczasowymi ścieżkami, jasno oznaczone w indeksie jako archiwum, ponieważ odwołują się do nich testy i dokumentacja                                                               |
| Jednoznacznie nieużywane | nieaktywna warstwa zgodności Nest, zdublowane testy kontraktowe oraz raporty/screenshoty narzędziowe bez wartości wydaniowej; usunięte po potwierdzeniu odwołań                                                                 |
| Operacyjne entrypointy   | healthchecki, migracje, backup/restore, release gate, shellowe testy integracyjne, generatory certyfikatów i konfiguracji, White-Label, Docker entrypointy i skrypty Mobile/E2E; zachowane i ręcznie uwzględnione w `knip.json` |

## Zmiany porządkowe

- usunięto martwy moduł `backend/nest/compatibility`, jego test oraz zdublowany test
  kontraktu HTTP; aktywne kontrolery Nest i testy kontraktowe pozostają;
- usunięto wygenerowane screenshoty `output/playwright`; wersjonowane, zanonimizowane
  materiały demonstracyjne Mobile pozostają;
- usunięto nieużywane eksporty, komponenty UI, typy i zależności wskazane przez Knip,
  każdorazowo po sprawdzeniu `rg`, manifestów i entrypointów operacyjnych;
- zachowano bezpośrednie `react-native-css-interop`, ponieważ transformacja Metro używa go
  w czasie eksportu mimo braku importu TypeScript;
- wszystkie workspace'y mają `private: true`, wersję `1.0.0`, deklarację licencji
  `SEE LICENSE IN LICENSE` oraz dokładnie przypięte zależności bezpośrednie;
- dokumentację podzielono w `docs/README.md` na źródła prawdy, instrukcje klienta,
  runbooki operacyjne i archiwum zakończonych faz;
- skrypt smoke klastra wiąże port-forward jawnie z `127.0.0.1`, dzięki czemu zajęty port
  nie może skierować testu do obcego procesu.
- dokładne tagi obrazów, klastry i katalogi tymczasowe utworzone przez tę weryfikację
  zostały usunięte; istniejące środowisko Compose `zglosto` pozostało uruchomione i
  nietknięte. Ignorowane katalogi build/cache obecne przed jednoznaczną inwentaryzacją
  pozostawiono, ponieważ ich pochodzenia nie dało się bezpiecznie przypisać tej pracy.

## Wyniki bramek

`PASS` oznacza wykonanie na tym kandydacie. `PER-CLIENT` oznacza kontrolę wymagającą
infrastruktury, sekretów lub decyzji konkretnego klienta. Czasy są czasami ściennymi.

| Bramka                              | Dokładna komenda                                                                                                                   | Wynik         |             Czas | Istotne uwagi                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Pełna kontrola monorepo             | `CI=true pnpm check`                                                                                                               | PASS          |          28,27 s | lint, format, typy, testy źródłowe, Knip, publikowalność, Compose matrix i White-Label                                                         |
| Martwy kod                          | `pnpm check:dead-code`                                                                                                             | PASS          | w ramach `check` | entrypointy nietypowane zweryfikowane ręcznie i zapisane w `knip.json`                                                                         |
| Peer dependencies                   | `pnpm peers check`                                                                                                                 | PASS          |           0,53 s | wyjątek ograniczony do przypiętego NestJS prerelease                                                                                           |
| Surowy graf zależności              | `pnpm audit --prod --json`                                                                                                         | EXPECTED FAIL |                — | dwa advisory `high` dla `image-size@1.2.1`, wyłącznie przez `Mobile` → Expo/React Native → Metro                                               |
| Polityka ryzyka zależności          | `pnpm audit:release`                                                                                                               | PASS          |                — | tylko `GHSA-w3rx-r6r6-pgpr` i `GHSA-5p2g-fcmc-qvqq`; wyjątek wygasa 2026-09-25                                                                 |
| Assety builda Mobile                | `node scripts/check-mobile-build-assets.ts`                                                                                        | PASS          |           <0,1 s | 7 wersjonowanych assetów; kontrola rozszerzeń i sygnatur ICNS/JXL/JP2/HEIF                                                                     |
| Testy jednostkowe i kontraktowe     | `pnpm test`                                                                                                                        | PASS          |           8,87 s | m.in. contracts 59, backend 107, frontend 70, Mobile 132                                                                                       |
| Integracja Compose                  | `DOCKER_CONTEXT=orbstack ./scripts/test-phase0-integration.sh`                                                                     | PASS          |         139,93 s | TLS/mTLS, PgBouncer, RabbitMQ, S3, migracje, API, retry/DLQ, backup/restore i shutdown; izolowany projekt usunięty                             |
| Compose matrix                      | `pnpm check:source`                                                                                                                | PASS          | w ramach `check` | 54 wspierane kombinacje konfiguracji                                                                                                           |
| White-Label                         | `./scripts/test-white-label-builds.sh`                                                                                             | PASS          | w ramach `check` | warianty Gdańsk i Wrocław                                                                                                                      |
| Expo Doctor                         | `pnpm --dir Mobile exec expo-doctor`                                                                                               | PASS          |           4,66 s | 21/21 kontroli                                                                                                                                 |
| React Doctor WEB                    | `npx -y react-doctor@latest frontend --verbose`                                                                                    | PASS          |           6,49 s | wynik 86; dwa fałszywe ostrzeżenia o `createObjectURL`, oba callback refs zwracają `revokeObjectURL`                                           |
| React Doctor Mobile                 | `npx -y react-doctor@latest Mobile --verbose`                                                                                      | PASS          |           5,80 s | wynik 92; plugin ATS jest warunkowo ładowany przez `app.config.ts`                                                                             |
| Eksport Mobile iOS + Android        | `pnpm --dir Mobile export:all`                                                                                                     | PASS          |          23,47 s | lokalny eksport źródłowy; signing i publikacja nie są częścią wydania                                                                          |
| Obrazy docelowe                     | `pnpm release:production:images:target`                                                                                            | PASS          |           2,47 s | 8/8 kontraktów użytkownika, healthchecku i budżetu rozmiaru; Authorization 191,9 MB po usunięciu opcjonalnego drzewa Expo z obrazu serwerowego |
| Profil Kubernetes/Kind              | `DOCKER_CONTEXT=orbstack CLUSTER_NAME=zglosto-release100-kubernetes-final PORT=28135 ./scripts/test-cluster-profile.sh kubernetes` | PASS          |         534,79 s | routing, auth boundary, PKI/KEDA, trwałość bazy, odtworzenie podów i rotacja TLS; klaster usunięty po teście                                   |
| Profil K3s                          | `./scripts/test-cluster-profile.sh k3s`                                                                                            | PER-CLIENT    |                — | brak `k3d` w środowisku; manifesty K3s przechodzą walidację statyczną                                                                          |
| Runtime/restore hosta produkcyjnego | `pnpm release:production:runtime`                                                                                                  | PER-CLIENT    |                — | wymaga hosta, DNS, sekretów, storage i polityki backupu klienta                                                                                |
| Trivy                               | —                                                                                                                                  | OUT OF SCOPE  |                — | porzucone decyzją właściciela 2026-08-26; nie jest bramką wydania ani obowiązkiem klienta                                                      |
| Skan sekretów/danych                | `node scripts/check-public-repository.ts`                                                                                          | PASS          |             <1 s | 960 istniejących plików kandydata; klucze prywatne, tokeny GitHub/cloud/model-provider/Google, prywatne maile i lokalne ścieżki                |
| Źródłowy SBOM                       | historyczne `pnpm release:sbom`                                                                                                    | OUT OF SCOPE  |                — | wcześniejszy artefakt Fazy A; SBOM został porzucony i nie wchodzi do wydania                                                                   |
| Runtime `image-size`                | izolowany `require.resolve('image-size')` w 4 lokalnych obrazach Node.js                                                           | PASS          |                — | brak w Authorization, backendzie, media workerze i `llm_gateway`; następny target build egzekwuje to kontraktem obrazów                        |
| Czysta kopia źródeł                 | `pnpm release:verify-source-copy`                                                                                                  | PRIOR PASS    |                — | pełna izolowana kontrola poprzedniego kandydata 961 plików; po finalnym, wyłącznie repozytoryjnym cleanupie nie powtarzano buildów             |
| Format i whitespace                 | `git diff --check`                                                                                                                 | PASS          |           <0,1 s | brak błędów whitespace; formatowanie całego repo przechodzi również w `pnpm check`                                                             |
| Finalna statyczna bramka wydania    | `npx -y -p pnpm@11.22.0 pnpm release:production:static`                                                                            | PASS          |          72,34 s | pełne `pnpm check` i negatywne testy polityki Compose; przypięte PNPM użyte po zewnętrznej aktualizacji Homebrew; bez Trivy                    |

## Ostrzeżenia i blokery

1. Surowy `pnpm audit --prod` nadal raportuje dwa `high` dla `image-size@1.2.1`.
   Ryzyko build-time zostało świadomie zaakceptowane wyłącznie do 2026-09-25 przez
   `pnpm audit:release`; każda zmiana advisories, wersji albo ścieżki ponownie blokuje
   wydanie. Nie zastosowano fikcyjnego override do nieopublikowanej poprawki.
2. Runtime, backup/restore, DNS, TLS, storage zewnętrzny, signing i ewentualna publikacja
   sklepowa muszą zostać zweryfikowane osobno dla każdej instancji klienta; są
   `PER-CLIENT`, a nie błędem wydania źródłowego.
3. Globalne PNPM zostało zewnętrznie zaktualizowane przez Homebrew do `11.24.0` w trakcie
   weryfikacji i z Node `26.5.0` zawieszało się przy starcie. Finalne bramki uruchomiono
   poprawnie przez przypięte w repo PNPM `11.22.0` z `npx`; instalacji systemowej nie
   zmieniano.
4. Trivy i SBOM nie są ostrzeżeniem ani otwartą bramką: właściciel świadomie usunął je z
   zakresu wydania, a krok przejściowy A → B usunął ich aktywne skrypty, kontrakt i
   artefakty. Wzmianki w dokumentach wcześniejszych faz mają wyłącznie charakter historyczny.

## Źródła prawdy

- `README.md` — produkt, model jednej instancji na jedno miasto i szybki start;
- `docs/current-architecture-audit.md` oraz `docs/architecture-decisions.md` — runtime i ADR;
- `docs/api-contracts-baseline.md` — kontrakty HTTP;
- `docs/roadmap-overview.md` — bieżący status roadmapy;
- `Mobile/CURRENT_STATE.md` i `Mobile/CLIENT_HANDOFF.md` — stan oraz przekazanie Mobile;
- `docs/release-1.0.0.md`, ten raport i `CHANGELOG.md` — wydanie;
- `docs/dependency-policy.md`, `SECURITY.md` oraz `LICENSE` — polityki zależności,
  zgłoszeń i PolyForm Internal Use License 1.0.0.

## Decyzja

**READY FOR THE 1.0.0 ROOT COMMIT.** Faza A, krok przejściowy A → B oraz końcowa
weryfikacja źródeł zostały zakończone. Właściciel jawnie zatwierdził przepisanie `main` i
publikację pojedynczego commita. Tag `v1.0.0` oraz GitHub Release wymagają osobnej operacji
po potwierdzeniu zdalnego commita.
