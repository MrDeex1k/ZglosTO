# Ryzyka i decyzje

## Blockery

| ID   | Temat                            | Status            | Warunek zamknięcia                                      |
| ---- | -------------------------------- | ----------------- | ------------------------------------------------------- |
| B-01 | Better Auth Expo i cookie header | CLOSED            | sign-in/restart/sign-out/401 zweryfikowane w Fazach 3–7 |
| B-02 | Trusted origin/scheme/CORS       | CLOSED-FOR-SOURCE | kontrakt i testy lokalne gotowe; origin ustala klient   |
| B-03 | Prywatne obrazy                  | CLOSED            | renderowanie, zakres sesji i cleanup zweryfikowane      |
| B-04 | Presigned upload z URI           | CLOSED-FOR-SOURCE | picker/checksum/retry gotowe; sprzęt testuje klient     |
| B-05 | Deep link weryfikacji e-maila    | CLIENT-DEPLOYMENT | klient dostarcza domenę, AASA/assetlinks i fallback WEB |
| B-06 | Minimalne systemy i urządzenia   | CLOSED            | iOS/iPadOS 17+, Android 12+, iPhone 15 Pro              |
| B-07 | Mierzalny cel produktu           | CLIENT-DEPLOYMENT | klient przypisuje KPI bez obowiązkowej analityki        |
| B-08 | Właściciele                      | CLIENT-DEPLOYMENT | klient przypisuje role operacyjne przed wdrożeniem      |
| B-09 | Produkcyjny host/edge            | CLIENT-DEPLOYMENT | certyfikacja konkretnej instancji klienta               |

## Ryzyka

| ID   | Ryzyko                                                   | Wpływ     | Redukcja                                                           |
| ---- | -------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| R-01 | Webowe cookie nie działa identycznie w RN                | krytyczny | oficjalny plugin, SecureStore, integration tests                   |
| R-02 | `expo-image` cache prywatnych danych                     | wysoki    | header/blob spike, czyszczenie, polityka retencji                  |
| R-03 | Duży plik i SHA-256 blokują UI                           | wysoki    | pomiar JS thread, natywne API/streaming, limit                     |
| R-04 | Root-relative asset White-Label nie działa               | średni    | jeden resolver URL i test kontraktu                                |
| R-05 | Dialogi przeniesione 1:1 dają zły UX                     | wysoki    | route-first design i testy użytkowników                            |
| R-06 | Admin rozszerza MVP                                      | wysoki    | osobna faza i gate po resident/service                             |
| R-07 | Offline queue duplikuje zgłoszenia                       | krytyczny | poza MVP bez idempotency backendu                                  |
| R-08 | PII w crash/analytics                                    | krytyczny | allowlista eventów, scrubber i security review                     |
| R-09 | OTA niezgodny z native runtime                           | wysoki    | runtime version, kanały, rollout i rollback                        |
| R-10 | Monorepo/EAS rozjeżdża wersje                            | średni    | jeden lockfile, exact pins, build z `Mobile`                       |
| R-11 | Długie listy i obrazy powodują jank                      | średni    | FlatList, expo-image, pomiar przed FlashList                       |
| R-12 | Brak pełnego runtime baseline web                        | średni    | uruchomić środowisko integracyjne i zapisać dowody                 |
| R-13 | Store review wymaga zmian prawnych                       | wysoki    | privacy/data declarations przed beta                               |
| R-14 | Backend nie ma paginacji                                 | średni    | ograniczyć zakres danych lub dodać kontrakt przed skalą            |
| R-15 | Kontrakt URL/metadanych zdjęć ma otwartą decyzję ADR-008 | wysoki    | zamknąć parser i cache behavior przed private-image implementation |
| R-16 | NativeWind v5 nadal jest pre-release                     | średni    | rozpocząć od stabilnego v4; v5 dopuścić po stable i checkpointcie  |
| R-17 | Skopiowane React Native Reusables mogą dryfować          | średni    | dodawać tylko używane komponenty i przeglądać aktualizacje         |

## Decyzje zaakceptowane

| ID   | Decyzja                                            | Uzasadnienie                                                                                                    |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D-01 | Greenfield Expo w monorepo                         | brak hosta native; istnieją kontrakty współdzielone                                                             |
| D-02 | Expo Router                                        | natywne stacki i file-based routing                                                                             |
| D-03 | TanStack Query                                     | zgodność z web i wymagania cache/mutation                                                                       |
| D-04 | Better Auth pozostaje źródłem sesji                | repo ma gotowy docelowy kontrakt Expo                                                                           |
| D-05 | SecureStore tylko dla sekretów                     | cookie nie może trafić do zwykłego storage                                                                      |
| D-06 | NativeWind + lokalny UI z React Native Reusables   | utility-first i source-owned bez zależności od webowego DOM                                                     |
| D-07 | Contracts i i18n są współdzielone                  | stabilne runtime parsery i katalogi                                                                             |
| D-08 | Admin po resident/service                          | największa złożoność i mniejsza wartość checkpointu                                                             |
| D-09 | Brak pełnego offline submit w MVP                  | brak idempotency/retencji/conflict policy                                                                       |
| D-10 | Exact dependency pins                              | obowiązująca polityka repozytorium                                                                              |
| D-11 | Zakres v1: mieszkaniec i służby                    | admin pozostaje późniejszą, osobno bramkowaną fazą                                                              |
| D-12 | iOS/iPadOS 17+ i Android 12+                       | zaakceptowana minimalna macierz systemów                                                                        |
| D-13 | Buildy lokalne                                     | brak płatnych kont sklepowych; EAS Build nie jest wymagany                                                      |
| D-14 | iPhone 15 Pro jako urządzenie fizyczne             | dostępny sprzęt do testów iOS, aparatu i Keychain                                                               |
| D-15 | Analityka wyłączona                                | brak SDK do czasu decyzji o providerze i polityce danych                                                        |
| D-16 | Bieżące testy tylko iPhone Simulator i Android     | iPad i sprzęt fizyczny wyłącznie na jawne polecenie                                                             |
| D-17 | Prywatne obrazy przez kontrolowany plik lokalny    | jawna retencja i cleanup bez cookie w URL/cache obrazu                                                          |
| D-18 | Faza 3 zakończona jako lokalny checkpoint          | dowód usuwa ryzyka architektury; beta/release mają osobne bramki                                                |
| D-19 | App Links aktywowane dopiero z własną domeną       | Quick Tunnel nie zapewnia trwałej własności ani `.well-known`                                                   |
| D-20 | Maestro 2.8 jako lokalne E2E Mobile                | jeden czytelny scenariusz działa na iPhone i Android Emulator                                                   |
| D-21 | Faza 4 zamknięta jako lokalny checkpoint           | MVP mieszkańca przechodzi E2E; beta ma odrębne bramki                                                           |
| D-22 | Faza 5 zamknięta decyzją PASS / CONTINUE           | zakres służb przeszedł checkpoint na iOS i Androidzie                                                           |
| D-23 | Admin poza Mobile 1.0                              | widzi tylko komunikat o komputerze i wylogowanie, bez linku WEB                                                 |
| D-24 | Faza 6.0 zamknięta decyzją PASS / CONTINUE         | rozłączne granice ról przeszły E2E na aktywnej macierzy urządzeń                                                |
| D-25 | Jedno governance dla całego monorepo               | Mobile dziedziczy główne LICENSE, SECURITY, CONTRIBUTING, CLA i `.github/`; brak kopii ogranicza drift          |
| D-26 | Faza 7 kończy się jako Source Ready / Client-Built | gotowy kod nie wymaga centralnych kont sklepów ani wspólnych binariów                                           |
| D-27 | Agent-device uzupełnia, a nie usuwa Maestro        | agent-device służy eksploracji i diagnostyce, a wersjonowane YAML-e Maestro pozostają deterministyczną regresją |
| D-28 | Brak osobnego release'u Mobile                     | tag, changelog i GitHub Release powstaną wspólnie dla całego produktu po audycie codebase'u i historii Git      |
| D-29 | 7.5 i 7.7 są niewymagane                           | każdy klient buduje własny wariant i może utrzymywać własne CI oraz artefakty                                   |

## Decyzje otwarte

| ID   | Pytanie          | Opcje                            | Rekomendacja startowa                            |
| ---- | ---------------- | -------------------------------- | ------------------------------------------------ |
| O-03 | Dark mode        | v1 lub później                   | później, jeśli White-Label nie definiuje tokenów |
| O-04 | Paginacja        | backendowa lub ograniczone listy | backendowa przed dużym rolloutem służb           |
| O-07 | Mapa w aplikacji | link zewnętrzny/native map       | link zewnętrzny w v1                             |
| O-08 | Trwały draft     | brak/szyfrowany                  | brak w v1, dopóki nie ma polityki retencji       |
| O-09 | Push             | poza v1/w v1                     | poza v1 — brak kontraktu backendu                |
| O-10 | Formularz        | jeden ekran/kroki                | faithful jeden ekran, potem test użyteczności    |
