# Bezpieczeństwo transportu między usługami i PostgreSQL

## Status decyzji

Kontrakt został zaakceptowany 2026-07-18 jako ADR-029. Kroki 6-10 Fazy 5 wdrożyły lokalną
hierarchię certyfikatów, jedyny listener Authorization mTLS na porcie `9956`, osobnych
klientów backendu i Nginx oraz healthcheck mTLS. Listener HTTP `9955` nie istnieje.
Kroki 11-14 wdrożyły TLS 1.3 na obu odcinkach PgBouncera, `verify-full` dla bezpośrednich
operacji bazodanowych, negatywne testy certyfikatów i pełną integrację. Produkcyjne zarządzanie
certyfikatami oraz powtórzenie testów w profilach Compose, Kubernetes i K3s pozostają
w Fazach 9 i 12.

## Decyzja

- Synchroniczna komunikacja domenowa pozostaje REST/JSON. Nie wprowadzamy teraz gRPC.
- Hono RPC może być użyte wyłącznie jako typowany klient HTTP, nie jako osobny protokół
  transportowy i nie jako zamiennik niezależnych kontraktów w `@zglosto/contracts`.
- Backend komunikuje się z authorization przez mTLS.
- Nginx również przedstawia własny certyfikat kliencki authorization, ponieważ przekazuje do
  niego publiczne `/api/auth/*` po zakończeniu zewnętrznego TLS użytkownika.
- Przeglądarka i aplikacja Expo nie otrzymują certyfikatów klienckich. Używają HTTPS i sesji
  Better Auth.
- Backend, authorization i `media_worker` łączą się z PostgreSQL wyłącznie przez PgBouncera z TLS oraz
  weryfikacją serwera. Uwierzytelnianie bazy pozostaje oparte na SCRAM-SHA-256, bez mTLS.
- PgBouncer łączy się z PostgreSQL drugim, niezależnym połączeniem TLS z weryfikacją serwera.
- Migracje, backup/restore i kontrolowana administracja omijają PgBouncera, ale również muszą
  używać TLS z pełną weryfikacją serwera.
- Komunikacja asynchroniczna używa RabbitMQ/AMQP wyłącznie przez AMQPS/TLS 1.3 i nie jest
  zastępowana przez REST ani RPC. RabbitMQ weryfikuje serwer przez Service CA; na tym etapie
  broker nie wymaga certyfikatu klienckiego, a aplikacja uwierzytelnia się osobnym loginem,
  hasłem i vhostem.

## Topologia

```text
Przeglądarka / Expo
        │ HTTPS + sesja Better Auth
        ▼
Nginx / Ingress
        ├── mTLS jako nginx-client ──────► authorization
        └── wewnętrzny transport ────────► backend
                                               │
                                               └── mTLS jako backend-client
                                                    ─────────► authorization

backend ──────────┐
authorization ────┼── PostgreSQL protocol + TLS + SCRAM ──► PgBouncer
media_worker ─────┘                                           │
                                                            └── PostgreSQL protocol
                                                                + TLS + SCRAM
                                                                ──► PostgreSQL

backend ───────────────► RabbitMQ ◄────────────── media_worker
                 AMQPS/TLS 1.3
```

Authorization nie wywołuje obecnie backendu. Jeżeli taki kierunek pojawi się później, backend
otrzyma osobny wewnętrzny listener mTLS. Nie wolno wymagać certyfikatu klienta na publicznym
API backendu, z którego korzystają przeglądarka i Expo.

## mTLS: backend i Nginx do authorization

### Tożsamości

Minimalny zestaw certyfikatów wystawianych przez wewnętrzne Service CA:

| Tożsamość                          | Zastosowanie                        | Wymagany SAN / identyfikator                                    |
| ---------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `authorization-server`             | serwer TLS authorization            | DNS `authorization`                                             |
| `backend-client`                   | klient mTLS dla weryfikacji sesji   | URI `spiffe://zglosto.local/workload/backend`                   |
| `nginx-client`                     | klient mTLS dla proxy `/api/auth/*` | URI `spiffe://zglosto.local/workload/nginx`                     |
| `authorization-healthcheck-client` | readiness Authorization             | URI `spiffe://zglosto.local/workload/authorization-healthcheck` |

Backend i Nginx nie współdzielą certyfikatu ani klucza. Authorization ufa wyłącznie Service CA
i odrzuca połączenia bez poprawnego certyfikatu klienta. Dopuszczone tożsamości są ograniczone
do wymaganych endpointów; sam certyfikat nie nadaje roli użytkownika.

mTLS uwierzytelnia usługę, ale nie zastępuje sesji. Backend nadal przekazuje pełny nagłówek
`Cookie`, authorization nadal waliduje sesję przez Better Auth, a role pochodzą z typowanego
kontraktu sesji.

Healthcheck Authorization używa dedykowanego certyfikatu klienta i tego samego portu `9956`;
tożsamość healthchecka ma dostęp wyłącznie do `/health`, `/health/live` i `/health/ready`.
Healthcheck Nginx wywołuje `/api/auth/get-session`, dzięki czemu sprawdza jego własny kanał
mTLS do Authorization. Nie istnieje lokalny listener HTTP omijający uwierzytelnienie.

## TLS: usługi, PgBouncer i PostgreSQL

PgBouncer kończy połączenie klienta i otwiera osobne połączenie upstream. TLS musi być
weryfikowany na obu odcinkach:

1. `backend` / `authorization` / `media_worker` -> `pgbouncer`;
2. `pgbouncer` -> `database`.

Wdrożone wymagania Compose:

- certyfikat PgBouncera zawiera DNS SAN `pgbouncer`;
- certyfikat PostgreSQL zawiera DNS SAN `database`;
- klienci używają odpowiedniej Database CA i pełnej weryfikacji nazwy hosta;
- połączenia bez TLS są odrzucane;
- SCRAM-SHA-256 pozostaje wymagane niezależnie od szyfrowania;
- backend, authorization i worker mają kontrolowane dane logowania; docelowe rozdzielenie
  ról brokera i bazy nastąpi w produkcyjnym provisioningu;
- `DATABASE_DIRECT_URL` używa TLS w migracjach, backupie i administracji;
- aplikacje nadal nie otrzymują `DATABASE_DIRECT_URL`.

Bieżąca konfiguracja PgBouncera odpowiada następującej polityce:

```ini
client_tls_sslmode = require
client_tls_protocols = tlsv1.3
client_tls_cert_file = /var/run/pgbouncer/tls/server.crt
client_tls_key_file = /var/run/pgbouncer/tls/server.key

server_tls_sslmode = verify-full
server_tls_protocols = tlsv1.3
server_tls_ca_file = /var/run/pgbouncer/tls/ca.crt
```

Po stronie aplikacji `require` nie jest wystarczającą polityką weryfikacji. Klient `pg` musi
ufać Database CA i zweryfikować DNS `pgbouncer`. PostgreSQL uruchamia `ssl=on`, używa
certyfikatu dla `database`, dopuszcza zdalne reguły `hostssl` z SCRAM i odrzuca odpowiedniki
`hostnossl`.

## REST, RPC i LLM

Backend -> authorization oraz backend -> przyszły `llm_gateway` pozostają REST/JSON z
kontraktami Zod. Koszt inference modelu dominuje koszt serializacji JSON, a Docker Model Runner
udostępnia API zgodne z OpenAI przez HTTP. gRPC można ponownie ocenić wyłącznie po pomiarach,
jeżeli pojawi się intensywny streaming, bardzo duża liczba małych wywołań albo wymagani będą
klienci wielojęzykowi.

Docker Model Runner nie może być publicznie dostępny. Dostęp otrzymuje tylko `llm_gateway`
przez prywatną sieć/NetworkPolicy. Połączenie TCP do model runnera używa TLS, jeśli runtime i
wybrane środowisko udostępniają taki tryb.

## Zarządzanie certyfikatami

- Prywatnych kluczy, certyfikatów środowiskowych ani haseł do kluczy nie zapisujemy w Git,
  White-Label YAML, obrazach ani ConfigMap.
- Lokalne certyfikaty developerskie powstają ze skryptu w katalogu `.certs/`, który przed
  wygenerowaniem plików musi zostać objęty `.gitignore`, i są montowane read-only. Nie są
  zaufane poza lokalnym środowiskiem.
- Produkcyjne Kubernetes/K3s używa cert-managera lub równoważnej automatyzacji oraz
  Kubernetes Secrets/CSI.
- Produkcyjny Compose używa automatyzacji hostowej ACME/PKI albo zewnętrznego menedżera
  certyfikatów. Montuje klucze read-only i wykonuje kontrolowany reload bez przebudowy
  obrazów.
- W żadnym profilu nie wdrażamy ręcznie długowiecznych certyfikatów.
- Service CA dla komunikacji workloadów jest oddzielone od Database CA dla PgBouncera i
  PostgreSQL, aby ograniczyć zakres zaufania.
- Certyfikaty mają krótki okres ważności, automatyczną rotację i jawnie sprawdzane SAN-y.
- Rotacja nie może wymagać przebudowy obrazu. Usługi muszą w kontrolowany sposób przeładować
  certyfikat albo wykonać bezpieczny rollout.
- Uprawnienia do kluczy prywatnych są ograniczone do użytkownika procesu; wolumeny z sekretami
  są read-only.

Lokalne certyfikaty tworzy `pnpm certs:dev`. Authorization waliduje przy starcie komplet
`AUTHORIZATION_MTLS_*`, rozdzielenie tożsamości backendu/Nginx i ścieżki montowane pod
`/run/secrets/service`. Backend waliduje komplet `AUTH_SERVICE_*`, używa wyłącznie HTTPS,
sprawdza Service CA i nazwę serwera oraz ma dostęp tylko do własnego klucza klienta. Katalog
`.certs/` jest ignorowany przez Git i Docker build context. Backend i Authorization wymagają
`DATABASE_TLS_CA_PATH`, a parametry `ssl*` w `DATABASE_URL` są odrzucane, aby URL nie mógł
nadpisać zarządzanej konfiguracji TLS klienta `pg`.

## Kolejność wdrożenia

1. Faza 5: po migracji authorization do Hono dodać wewnętrzny serwer mTLS, klientów
   backendu i Nginx, walidację certyfikatów oraz testy negatywne.
2. Faza 5: zachować publiczny HTTPS na Nginx/Ingress oraz potwierdzić, że przeglądarka i Expo
   nie potrzebują certyfikatu klienckiego.
3. Faza 5 lub bezpośrednio po niej: włączyć TLS aplikacje -> PgBouncer -> PostgreSQL oraz TLS
   dla `DATABASE_DIRECT_URL`.
4. Faza 9: kandydat Compose ma plikowe certyfikaty, izolowane sieci i procedurę ich
   rotacji. Kubernetes/K3s używają cert-managera, oddzielnych Service/Database CA,
   Stakater Reloader i default-deny NetworkPolicy. Domena i publiczny ClusterIssuer
   pozostają konfiguracją operatora.
5. Faza 12: powtórzyć testy negatywne osobno w Compose, Kubernetes i K3s oraz dodać test
   odwołania, rotacji certyfikatu i awarii pojedynczego odcinka TLS.

## Kryteria akceptacji

- Backend bez certyfikatu klienta nie połączy się z authorization.
- Backend z certyfikatem spoza Service CA lub z niedozwoloną tożsamością zostanie odrzucony.
- Nginx może obsługiwać publiczne Better Auth bez certyfikatu po stronie użytkownika, ale sam
  przedstawia własny certyfikat authorization.
- Niepoprawny SAN lub obca CA serwera authorization powoduje błąd po stronie backendu/Nginx.
- Backend, authorization i `media_worker` odrzucają PgBouncera z niepoprawnym certyfikatem albo SAN-em.
- Backend i `media_worker` odrzucają RabbitMQ bez TLS, z obcą CA albo błędnym SAN-em.
- PgBouncer odrzuca PostgreSQL z niepoprawnym certyfikatem albo SAN-em.
- PostgreSQL i PgBouncer odrzucają wymagane połączenia plaintext.
- SCRAM pozostaje wymagane; posiadanie dostępu sieciowego lub CA nie wystarcza do logowania.
- Migracje i backup przechodzą po TLS przez `DATABASE_DIRECT_URL`.
- Rotacja certyfikatów przechodzi bez utraty danych i bez konieczności przebudowy obrazów.
- Test integracyjny potwierdza cały przepływ Nginx -> authorization, backend -> authorization,
  backend/authorization/media_worker -> PgBouncer -> PostgreSQL oraz
  backend/media_worker -> RabbitMQ po AMQPS.

Lokalny test integracyjny automatycznie pokrywa brak certyfikatu, obcą CA klienta i serwera,
wygasły certyfikat z poprawnym URI SAN, zaufany lecz niedozwolony workload, niezgodną nazwę
serwera oraz plaintext. K8s/K3s mają już cert-manager i rollout Secretów przez Reloader;
odwołanie i bezprzerwowa rotacja na żywym klastrze pozostają końcową bramką
infrastrukturalną Fazy 12.

## Źródła techniczne

- [Hono RPC](https://hono.dev/docs/guides/rpc) — typowany klient nadal używa HTTP/fetch.
- [TLS PgBouncera](https://www.pgbouncer.org/config.html) — niezależne ustawienia klienta i
  połączenia upstream.
- [TLS PostgreSQL 18](https://www.postgresql.org/docs/18/libpq-ssl.html) — tryby weryfikacji
  certyfikatu i nazwy serwera.
- [API Docker Model Runner](https://docs.docker.com/ai/model-runner/api-reference/) — API
  zgodne z OpenAI przez HTTP.
