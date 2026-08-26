# Testy integracyjne Fazy 0

## Cel

Zestaw weryfikuje kontrakty biznesowe Fazy 0 przez publiczny Nginx, rzeczywisty backend,
authorization z Better Auth, PgBouncera, PostgreSQL oraz RustFS. Jedynym stubem jest
OpenAI-compatible API Docker Model Runner, ponieważ test musi deterministycznie wymusić
wszystkie klasyfikacje i awarie bez pobierania modelu.

## Uruchomienie

Wymagane są Docker z Docker Compose oraz Node.js 26:

```bash
pnpm test:integration
# albo
./scripts/test-phase0-integration.sh
```

Skrypt używa osobnego projektu Compose `zglosto-phase0`, publicznego portu `11335`, portu
bazy `16432` i diagnostycznego portu Authorization mTLS `19956`. Port Authorization jest
publikowany wyłącznie w izolowanym override testowym na `127.0.0.1`, aby sprawdzić wewnętrzny
kontrakt, którego Nginx celowo nie wystawia. Backend NestJS jest sprawdzany przez publiczny
Nginx po rzeczywistym cutoverze. Baza działa w `tmpfs`, a osobny wolumen RustFS jest
usuwany po teście. Zestaw nie czyta lokalnego `.env` i nie montuje zwykłych wolumenów.
Scenariusze oraz stub DMR są napisane w TypeScript, sprawdzane przez ścisły
`tests/integration/tsconfig.json` i uruchamiane natywnie przez Node 26.

Opcje diagnostyczne:

```bash
INTEGRATION_HTTP_PORT=21335 \
INTEGRATION_DATABASE_PORT=26432 \
INTEGRATION_AUTHORIZATION_MTLS_PORT=29956 \
INTEGRATION_KEEP_RUNNING=1 \
./scripts/test-phase0-integration.sh
```

## Pokryte scenariusze

1. prywatna lista mieszkańca zwraca `401` bez sesji, także przy próbie wyszukania po e-mailu;
2. anonimowe zgłoszenie normalizuje e-mail, zapisuje zdjęcie i nie ma `reporter_user_id`;
3. rejestracja tworzy konto mieszkańca i sesję Better Auth;
4. niezweryfikowane konto nie przejmuje anonimowej historii;
5. prawdziwy link Better Auth potwierdza e-mail i uruchamia idempotentne przypisanie historii;
6. logowanie i prywatna lista działają po sesji, a e-mail zalogowanego autora musi zgadzać się z sesją;
7. role `mieszkaniec`, `sluzby` i `admin` są odseparowane kodami `403`;
8. admin widzi listę/statystyki i przypisuje konto pracownika do służby;
9. pracownik widzi oraz modyfikuje tylko incydenty swojej służby;
10. statusy przyjmują wyłącznie `reported`, `in_progress`, `resolved`;
11. zdjęcia zgłoszenia i rozwiązania trafiają do Object Storage, listy zwracają metadane i
    URL API, prywatny odczyt wymaga właściwej sesji, a zdjęcie rozwiązanej sprawy jest publiczne;
12. kontrolowany, aktywny adapter DMR pokrywa `municipal`, `emergency`, `timeout`,
    `unavailable` i `invalid_response`; wariant `disabled` jest testowany w smoke teście
    bazowego Compose oraz w testach jednostkowych gatewaya;
13. fallback nigdy nie blokuje zapisu i zawsze zapisuje `unknown`, `source: fallback` oraz techniczny `reason`;
14. backend i authorization używają `DATABASE_URL` z hostem `pgbouncer`, nie otrzymują
    `DATABASE_DIRECT_URL`, mają wyłącznie Database CA, a rzeczywiste zapytanie potwierdza TLS
    1.3 przez pooler;
15. wszystkie migracje można zastosować ponownie bez błędu przez bezpośredni URL; schemat nie
    zawiera już kolumn zdjęć `bytea`, tabela `incident_images` istnieje, a połączenie używa
    TLS 1.3 z `verify-full`;
16. backend nie otrzymuje `RUSTFS_*`, inicjalizuje prywatny bucket przez neutralne `S3_*`, a
    `S3ObjectStorage` wykonuje rzeczywiste `put`, `head`, `get` i `delete`.
17. konfiguracja PgBouncera wymaga TLS 1.3 i `verify-full` upstream, a PostgreSQL i PgBouncer
    odrzucają próby połączenia bez TLS;
18. backup i restore przechodzą przez szyfrowany `DATABASE_DIRECT_URL`, po czym test sprawdza
    odtworzone rekordy oraz obiekt w storage.
19. Authorization odrzuca brak certyfikatu, obcą CA, wygasły certyfikat z poprawną tożsamością,
    niedozwolony workload, błędną nazwę serwera i plaintext;
20. klienci PostgreSQL i PgBouncera odrzucają obcą CA oraz niezgodny SAN przy `verify-full`.
21. wykonywalny kontrakt Fazy 6 wykonuje anonimowy probe wszystkich 20 tras aktywnego NestJS
    przez Nginx, waliduje strukturalne błędy `errorCode` i potwierdza kompletny
    `/api/openapi.json` bez tras diagnostycznych.
22. kontrolowany `SIGTERM` kończy NestJS kodem `0`, testy lifecycle sprawdzają zamknięcie
    zasobów, a ponowne uruchomienie potwierdza `404` dla usuniętego `/api/protected` i `200`
    dla `/api/openapi.json` bez jakiegokolwiek legacy runtime'u.
23. zatrzymany `media_worker` buduje backlog siedmiu komunikatów, po restarcie konsumuje je z
    `prefetch=1`; przebieg sprawdza WebP, retry, końcowy DLQ, idempotentny receipt i
    odzyskanie po niedostępności RabbitMQ.

Ten sam przebieg uruchamia również `tests/integration/authorization-contract.integration.ts`,
który zamroził kontrakt przed migracją i obecnie weryfikuje implementację Hono. Obejmuje
liveness/readiness, CORS, cookie, rejestrację, pobranie i weryfikację sesji, propagację roli
oraz unieważnienie sesji przy wylogowaniu na publicznej i wewnętrznej granicy Authorization.
Opcjonalny `INTEGRATION_AUTH_CONTRACT_RUN_ID` pozwala bezpiecznie powtórzyć sam scenariusz na
tej samej diagnostycznej bazie.

Przebieg uruchamia także `tests/integration/backend-http-contract.integration.ts`. Jego
typowany manifest znajduje się w `backend/contracts/http-contract.ts`, a test jednostkowy
chroni jego kompletność, unikalność i mapowanie Nginx. Skrypt wykonuje test aktywnego NestJS
przez Nginx i sprawdza także OpenAPI oraz zamknięty kontrakt błędów. Szczegóły opisuje
[kontrakt HTTP backendu Fazy 6](phase-6-backend-http-contract.md).

## Testowy e-mail i role

Przy `NODE_ENV=test` oraz `EMAIL_DELIVERY_MODE=test` authorization udostępnia pamięciowy outbox i bootstrap roli wyłącznie pod prefiksem `/api/auth/__test__`. Warunek jest sprawdzany także w kodzie serwera; endpointy zwracają `404` poza tym trybem. Adapter nie wysyła poczty i nie jest przeznaczony do developmentu ani produkcji.

Zestaw uruchamia także RabbitMQ z danymi w `tmpfs` i tymczasowym portem AMQPS. Sprawdza
TLS 1.3, poprawną i obcą CA, odrzucenie plaintext, obie wersjonowane topologie quorum,
publisher confirms oraz przejście outboxa przez `pending -> published`, `failed` podczas
awarii brokera i ponowne `published` po restarcie. Osobny `media_worker` jest sprawdzany jako
NestJS standalone bez HTTP i nadmiarowych sekretów. Test obejmuje rzeczywisty pipeline
Object Storage -> RabbitMQ -> Sharp -> WebP -> PostgreSQL, checksum i brak metadanych,
zachowanie oryginału, retry TTL, DLQ, manual ACK, idempotentny receipt oraz przejście
`ready -> unready -> ready` podczas restartu RabbitMQ.

Test bootstrapuje tylko pierwszego administratora. Dalsze przypisanie roli pracownika przechodzi przez rzeczywisty endpoint panelu admina.

## Granica

Zestaw nie zastępuje testów UI w przeglądarce ani testów produkcyjnego providera e-mail. Weryfikuje kontrakt HTTP, sesji, hook potwierdzenia e-maila, role, zapis danych i routing same-origin, czyli siatkę bezpieczeństwa potrzebną przed migracjami kolejnych faz.
