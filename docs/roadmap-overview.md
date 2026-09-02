# Roadmapa projektu ZgłosTO — przegląd faz

## Historyczny stan na 2026-08-25

Fazy 0-10 są zakończone. Faza 10 zamknęła typowany kontrakt,
zawsze aktywny lokalny rate limiting Authorization i publicznego zapisu zgłoszenia oraz
provider-neutralny magazyn krótkotrwały z adapterem Redis. Atomowe liczniki chronią Better
Auth oraz publiczny zapis w trybach Redis bez przenoszenia sesji z PostgreSQL. Publiczna
lista rozwiązanych incydentów ma zwalidowany cache-aside Redis z TTL `900 s`, invalidacją
rewizji, ochroną przed stampede i fallbackiem do PostgreSQL.
Cache miss wspiera częściowy indeks PostgreSQL, a exact-match cache Nginx działa przez
`900 s` bez Redisa lub jako 30-sekundowy microcache w trybach Redis.
Profile `local` i `external` są gotowe dla Compose, Kubernetes oraz K3s; lokalny Redis
8.8.0 jest izolowany przez ACL i sieć, a zewnętrzny wymaga TLS i zweryfikowanego CA.
Awaria Redisa daje jawny stan `degraded`, ale nie usuwa podów z ruchu; metryki, alerty i
automatyczny test potwierdzają fallback do lokalnej ochrony i PostgreSQL oraz odzyskanie
połączenia. Runbook operatorski zamknął Fazę 10 dnia 2026-07-25.
Decyzję Redis zamiast `UNLOGGED TABLES` zaakceptowano 2026-07-25. Faza 11 została
zamknięta 2026-07-26 produkcyjnym Compose budowanym lokalnie ze źródeł, hardeningiem hosta,
automatyzacją wydania i lokalnymi bramkami. Publikacja źródłowego `1.0.0` wymaga końcowego
cleanupu i bramek repozytorium. Faza 12 jest certyfikacją wykonywaną osobno dla instancji
klienta, Faza 13 domyka produkcyjny baseline po stabilnym NestJS 12, a Faza 14 jest
późniejszym rozwojem produktu.

Równoległa roadmapa Mobile zakończyła Fazy 0–7. Kod Expo/React Native dla mieszkańców i
służb ma status `SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED`. Każdy licencjonowany
klient buduje aplikację dla własnej, jednomiejskiej instancji; repozytorium nie utrzymuje
wspólnych binariów App Store/Google Play ani centralnej usługi SaaS.

W tej dokumentacji „profil wdrożeniowy” oznacza techniczny sposób uruchomienia: Compose,
Kubernetes albo K3s. „Środowisko” oznacza etap cyklu życia, np. development, staging lub
production. Każdy profil produkcyjny ma osobną konfigurację i bramkę; lokalny Compose używany
do developmentu nie staje się produkcyjny samą zmianą `NODE_ENV`.

| Faza | Status     | Główny rezultat                                                             |
| ---- | ---------- | --------------------------------------------------------------------------- |
| 0    | zakończona | audyt, baseline, ADR-y, kontrakty oraz bramki jakości                       |
| 1    | zakończona | PNPM workspace, pełny TypeScript i współdzielone kontrakty                  |
| 2    | zakończona | wersjonowany kontrakt White-Label dla jednej instalacji i jednego miasta    |
| 3    | zakończona | PgBouncer, provider-neutralny Object Storage, RustFS i docelowy model zdjęć |
| 4    | zakończona | usunięcie pgAdmin i zastąpienie go kontrolowanymi procedurami operacyjnymi  |
| 5    | zakończona | Authorization na Hono, Better Auth, Node 26, TypeScript oraz mTLS/TLS       |
| 6    | zakończona | API NestJS, RabbitMQ, outbox, `media_worker` i Sharp                        |
| 7    | zakończona | `llm_gateway`, opcjonalny Docker Model Runner i bezpieczny fallback LLM     |
| 8    | zakończona | TanStack Start, Router, Query, Form + Zod, Base UI, mapa i komunikat 112    |
| 9    | zakończona | trzy profile, OTel, autoskalowanie i automatyczne testy deploymentu         |
| 10   | zakończona | Redis, lokalny i rozproszony rate limiting oraz cache publicznej listy      |
| 11   | zakończona | lokalny build źródłowy i utwardzony produkcyjny profil Compose              |
| 12   | per klient | certyfikacja jego Compose/K3s, DNS, SLO, restore i load testy               |
| 13   | planowana  | stabilne NestJS 12 i ostateczna bramka certyfikacji produkcyjnej            |
| 14   | po wydaniu | asynchroniczna kontrola właściwej służby przez LLM                          |

## Aktualizacja z 2026-09-02

Lokalny profil używa obecnie Redis `8.10.1`. Faza 13 została zakończona dla wspólnego kodu
źródłowego po migracji na oficjalny NestJS `12.0.1` oraz regresji zależności, kontraktów,
buildów i izolowanego runtime'u. Nie oznacza to certyfikacji produkcyjnej konkretnego hosta;
ta nadal jest wykonywana osobno dla każdego klienta w Fazie 12.

## Znaczenie poszczególnych faz

### Fazy 0-2 — fundament produktu

Najpierw ustalono źródła prawdy, kontrakty API i decyzje architektoniczne. Repozytorium
przeszło na PNPM oraz TypeScript bez `any` jako skrótu dla niezaufanych danych. Następnie
powstał wspólny, walidowany kontrakt White-Label obejmujący języki polski i angielski,
strefę `Europe/Warsaw`, miasto, branding, usługi i mapę.

### Fazy 3-4 — dane i operacje

Połączenia aplikacyjne prowadzą przez PgBouncer, a bezpośredni PostgreSQL pozostaje dla
migracji i procedur operacyjnych. Zdjęcia znajdują się w provider-neutralnym Object Storage,
lokalnie opcjonalnie w RustFS; PostgreSQL przechowuje metadane. PgAdmin został usunięty.

### Fazy 5-7 — usługi backendowe

Authorization działa na Hono z Better Auth. API domenowe działa na NestJS z
`@nestjs/platform-express`. RabbitMQ, outbox i osobny `media_worker` izolują obróbkę Sharp od
procesu HTTP. `llm_gateway` jest jedyną granicą do LLM, a niedostępny model nigdy nie blokuje
przyjęcia zgłoszenia.

### Faza 8 — aplikacja webowa

Frontend działa na TanStack Start w trybie SPA z TanStack Router i Query. Formularze używają
TanStack Form oraz Zod. shadcn `base-nova` na Base UI pozostaje za lokalnymi wrapperami.
White-Label steruje prezentacją, a formularz używa obowiązkowego adresu tekstowego bez mapy
i zawsze pokazuje nieblokującą informację o numerze 112. Administrator oraz służba mogą
otworzyć adres jako cel trasy w Google Maps. Faza kończy się pełną bramką jakości bez
ostrzeżeń OxLint.

### Faza 9 — platforma uruchomieniowa

Compose, Kubernetes i K3s stają się pierwszoklasowymi profilami produkcyjnymi. Powstaje
wspólna macierz parytetu, produkcyjny override Compose, baza K8s i overlay K3s, bezpieczne
sekrety, komplet workloadów, certyfikaty, izolacja sieciowa, storage oraz autoskalowanie
klastrowe. Kroki 1-11 są wdrożone: `media_worker` skaluje się przez KEDA dokładnie
`1-4`, a `llm_gateway` używa KEDA HTTP Add-on i skali `0-4`.
Fundament obserwowalności oferuje wzajemnie wyłączne tryby `disabled`, `external` i `local`
dla każdej platformy. Parytet
dotyczy produktu, bezpieczeństwa i danych; Compose pozostaje profilem pojedynczego hosta bez
automatycznego KEDA i odporności na utratę hosta. Równolegle wdrażany jest fundament logów,
metryk i śladów. Fazę zamyka wspólna bramka testowa Compose, Kind/Kubernetes i K3d/K3s,
walidująca 12 overlayów, polityki workloadów, CRD oraz podstawowe scenariusze odtworzeniowe.
Szczegółowy plan znajduje się w [planie wykonawczym Fazy 9](phase-9-execution-plan.md).

### Faza 10 — stan krótkotrwały

Wybrano Redis zamiast `UNLOGGED TABLES`. Lokalny limiter działa zawsze, również w małym
Compose z `REDIS_MODE=disabled`; `local` i `external` dodają wspólny limiter wielu replik
oraz cache Redis. Neutralny pakiet `@zglosto/transient-store` zapewnia atomowe liczniki,
TTL, dzierżawy, timeouty i TLS bez wiązania domeny z Redisem. Better Auth używa
dedykowanego `rateLimit.customStorage`, dlatego do Redis trafiają wyłącznie krótkotrwałe
liczniki, nie sesje. Publiczny zapis ma rozproszone limity globalny, IP i użytkownika,
a identyfikatory są zabezpieczone HMAC. Publiczna lista rozwiązanych incydentów ma wdrożony
cache Redis TTL `900 s` z walidacją kontraktu, rewizją invalidacji, single-flight,
rozproszoną dzierżawą i fallbackiem do PostgreSQL. Częściowy indeks przyspiesza cache miss.
Nginx ma ograniczony exact-match cache i wybiera przez nagłówek backendu 30-sekundowy
microcache w trybach Redis albo `900 s` dla pojedynczego Compose bez Redisa. RabbitMQ
pozostaje brokerem zadań. Readiness zachowuje kod `200` przy awarii wyłącznie Redisa i
raportuje `degraded`; metryki, alerty i test awarii obejmują przejście do fallbacku oraz
ponowne połączenie. Faza jest zakończona; procedury wdrożenia i reakcji na awarię opisuje
[runbook Redis](redis-operations.md).
Szczegóły zawiera [plan Fazy 10](phase-10-redis-cache-rate-limiting.md).

### Faza 11 — optymalizacja dostarczania

Po stabilizacji usług wykonano odchudzenie i utwardzenie obrazów oraz dostarczono
produkcyjnego Compose budowanego bezpośrednio ze źródeł na serwerze instalacji: secrets,
limits, HTTPS, automatyzacja hostowa, backup, update i rollback. Nie wymagamy własnego
registry ani runnera GitHub-hosted. Faza nie zmieniła kontraktów domenowych. Jest
zakończona 14/14: kroki 1–10 dostarczyły [audyt obrazów](phase-11-image-audit.md),
[kontrakt i budżety](phase-11-step-2-image-contract.md) oraz
[migrację obrazów runtime](phase-11-steps-3-8-runtime-images.md) oraz
[natywny build źródłowy](phase-11-step-9-source-build-plan.md) oraz
[modułowy produkcyjny Compose](phase-11-step-10-production-compose-modules.md). Wszystkie
osiem artefaktów przechodzi docelową bramkę obrazów. Historyczne skany Trivy i SBOM zostały
porzucone decyzją właściciela 2026-08-26 i nie należą do bieżącego procesu. Compose używa obrazów bez
registry, domyślnie uruchamia RustFS i waliduje 54 kombinacje Object Storage, Redis,
observability oraz LLM. Kroki 11–14 dodały hardening opcjonalnych kontenerów i hosta,
transakcyjny workflow wdrożenia, bramki wydania, runbook Compose i handoff do K3s.
Dowody zbiera [podsumowanie Fazy 11](phase-11-completion.md).

### Faza 12 — gotowość produkcyjna instancji klienta

Najpierw certyfikuje Compose przez instalację, upgrade, rollback, backup/restore, rotację
certyfikatów, awarie i load testy. K3s jest opcjonalnym drugim profilem po przejściu
Compose; rozbudowany Kubernetes pozostaje zamrożony. Faza obejmuje DNS, sekrety, retencję,
dashboardy, SLI/SLO i bezpieczeństwo transportu. Dopiero tutaj finalnie stroimy PgBouncera,
autoskalowanie, limity zasobów i timeouty LLM na podstawie pomiarów. Automatyzacja i lokalny
preflight i pakiet certyfikacyjny są zakończone. Wynik końcowy powstaje jednak osobno dla
każdego klienta, ponieważ wymaga jego hosta, DNS, sekretów, retencji, RPO/RTO i podpisu
operatora. Uzgodniono host Ubuntu `amd64`, profil `minimal` z lokalnym LLM oraz
`recommended` z lokalnym Redis. Lokalny pomiar CPU/RAM daje wymagania wstępne, które klient
potwierdza podczas własnego wdrożenia.

### Faza 13 — bramka wspólnego baseline'u źródłowego

Zakończona 2026-09-02 dla wspólnego kodu źródłowego. Cały backend i `media_worker` używają
oficjalnego NestJS `12.0.1`. Usunięto obejścia prerelease, włączono wykrywanie konfliktów i
shadowingu tras oraz wykonano regresję zależności, kontraktów, buildów i runtime'u.
Certyfikacja produkcyjna konkretnej instancji klienta nie jest częścią tego statusu i nadal
odbywa się osobno w Fazie 12.

### Faza 14 — rozwój po stabilnym NestJS 12

LLM asynchronicznie ocenia, czy mieszkaniec wybrał właściwą służbę. Wynik jest tylko
sugestią do ręcznej weryfikacji, nie zmienia automatycznie routingu i nie wpływa na
przyjęcie zgłoszenia.
