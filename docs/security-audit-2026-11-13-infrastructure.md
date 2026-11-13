# Audyt bezpieczeństwa — infrastruktura — 2026-11-13

## Podsumowanie i granice

Sektor 5: Dockerfile, Compose, k8s, deploy, nginx, rabbitmq, scripts (bez dependencies.ts/check-bun-workspaces.ts), llm_gateway, packages/observability. Zachowano niezacommitowane zmiany parenta; bez branchy/commitów, zatrzymywania jego stosu i modyfikacji danych. Naprawy opisane poniżej są zmianami źródeł, wymagają przebudowy/wdrożenia. Skanowano także aktualne lokalne obrazy. Nie ma podstaw do stwierdzenia „obrazy bez podatności”.

Zastosowano security-best-practices i reference javascript-express-web-server-security (zasady HTTP/Node, nie twierdzenie, że Hono jest Express). Ocena oparta na konkretnych przepływach, kodzie i renderowaniu manifestów. Brak pełnego uruchomienia klastra Kubernetes, testu sieci CNI, zewnętrznych usług i produkcyjnego restore. Integracja parenta jest oddzielnym dowodem; nie zastąpiono jej statycznymi testami.

## Potwierdzone znaleziska i naprawy

### INF-01 — High — ujawnianie podpisanych URL w logach edge — naprawione

OWASP A09 / CWE-532. `nginx/nginx-main.conf:15`: dawny `$request` zawierał query podpisanego PUT S3 i kod callbacku logowania, a Referer mógł powielać te dane. Dostęp do logów pozwalał użyć krótkotrwałego podpisu przed jego wygaśnięciem (warunki metody/obiektu podpisu nadal obowiązują). Zmieniono format na metodę, `$uri`, protokół, status i rozmiar, usunięto Referer. Nie ujawniono sekretów podczas audytu. Historycznych logów nie zmieniano — wymagają retencji/usunięcia przez operatora.

Test: `edge access logs omit signed-upload and auth-callback query credentials` w `scripts/test-infrastructure.ts`; kontroluje rzeczywisty format i wyklucza zmienne zawierające query. Test statyczny, bez dowodu runtime redakcji logów działającego starego obrazu. Pozostają adres IP i ścieżka, wymagające właściwej retencji.

### INF-02 — Medium — timeout LLM nie obejmował body — naprawione

OWASP A04 / CWE-400. `llm_gateway/src/runtime.ts:31`: timer był kasowany po `fetch`, przed `response.json()`. Dostawca/proxy, który wysłał nagłówki i zatrzymał body, mógł utrzymać wszystkie cztery sloty klasyfikacji bezterminowo. Timer obejmuje teraz odczyt JSON; awaria kończy się fallbackiem, zwalniając slot w finally aplikacji.

Test regresyjny `keeps the upstream deadline active while consuming the response body` emuluje zakończenie fetch i zawieszenie body do przerwania AbortSignal. Nie jest testem złośliwego zewnętrznego dostawcy. Nadal należy ograniczać wielkość odpowiedzi na poziomie dostawcy/proxy; timeout nie stanowi limitu bajtów.

### INF-03 — High warunkowe — zewnętrzny LLM dopuszczał HTTP i przekierowania — naprawione

OWASP A02/A10 / CWE-319, CWE-918. `llm_gateway/src/environment.ts:31`, `runtime.ts:40`. Operator mógł skonfigurować HTTP i wysyłać klucz Bearer oraz opis mieszkańca jawnym tekstem. Domyślne podążanie za 307/308 pozwalało dostawcy/proxy przekierować opis na inną usługę. Nie stwierdzono bezpośredniej kontroli URL przez mieszkańca; nie jest to anonimowy SSRF. Naprawa: zewnętrzny URL wymaga HTTPS, bez userinfo/query/fragment; fetch odrzuca przekierowania. Nie twierdzimy, że cross-origin redirect zawsze przekazywał Authorization: potwierdzony przepływ dotyczy body.

Testy: cztery odrzucane URL-e w environment.test.ts, opcja redirect:error i brak osobnych pól address/city w payloadzie w runtime.test.ts. Opis może sam zawierać PII; nie wprowadzono pozornej anonimizacji. Włączenie zewnętrznego runtime nadal wymaga uzgodnionego przetwarzania danych i retencji dostawcy.

### INF-04 — High — lokalny cache nonce przy KEDA 0–4 — naprawione z warunkami wdrożenia

OWASP A07 / CWE-294. `k8s/base/autoscaling/llm-gateway-scaledobject.yaml:12` potwierdza 0–4 repliki; `llm_gateway/src/server.ts` wcześniej tworzył wyłącznie cache w pamięci. Podpisane żądanie przechwycone przez uprawniony workload/proxy można było wysłać do innej repliki lub po restarcie w oknie ±30 s. mTLS nadal ogranicza, kto może taki request dostarczyć.

Dodano `llm_gateway/src/replay-store.ts`: po weryfikacji HMAC, przed inferencją, atomowy Redis SET NX PX przez istniejący transient-store. Klucz nonce jest hashem identyfikatora klucza i nonce, TTL = 2*skew+1 sekund. Brak Redis lub błąd oznacza 503; powtórka 401. Brak generacji Redis wymusza kwarantannę przez pełne okno podpisów, także po utracie danych; sprawdzenie generacji po zajęciu nonce wykrywa restart w trakcie operacji. Lokalny Redis zmieniono z allkeys-lru na noeviction: usunięcie żywego nonce przez eviction odtwarzałoby podatność. Brak pamięci skutkuje odmową, nie osłabieniem kontroli. Tryb disabled LLM zachowuje dotychczasowy fallback bez inferencji; lokalna ochrona HMAC nadal obowiązuje.

Compose i komponenty K8s Redis lokalnego/zewnętrznego przekazują gateway URL/CA i zezwalają na właściwy ruch. Zależność workspace transient-store dodano po zgłoszeniu parentowi. **bun.lock pozostawiono nietknięty: parent musi zsynchronizować lock przed frozen buildem.** Aktywny LLM bez profilu Redis zwraca 503; jest to zamierzona odmowa przy braku współdzielonej ochrony. Pierwsze żądania nowej generacji Redis również zwracają 503 przez domyślne 61 s.

Wymóg zewnętrznego Redis: noeviction, zakaz FLUSH/DEL nonce dla użytkowników aplikacji, wspólny primary bez odczytów z opóźnionych replik. Polityki dostawcy nie sprawdzano; dowolne administracyjne usuwanie pojedynczych nonce przy zachowaniu klucza generacji nadal osłabia kontrolę. To warunek wdrożenia, nie bezwarunkowa gwarancja.

Testy: dwie niezależne instancje konsumenta współdzielące atomowy model store, restart procesu, utrata całego store, kwarantanna i odmowa bez store; testy HMAC aplikacji; typecheck. Model store nie zastępuje testu z prawdziwym Redis i kill/restart, który pozostaje wymagany przed certyfikacją produkcji.

### INF-05 — Medium — nieprywatny katalog backupu — naprawione

OWASP A01/A02 / CWE-377, CWE-732. `scripts/backup-compose.sh:18–42` przyjmował istniejący pusty katalog bez sprawdzenia właściciela/trybu. Lokalny użytkownik mający zapis mógł wstawić symlink pod nazwą pliku kopii, odczytać backup lub przekierować zapis. Teraz skrypt kanonizuje rodzica, weryfikuje właścicieli i uprawnienia całej ścieżki, tworzy atomowo NOWY katalog 0700; odrzuca istniejący katalog i symlink przed wywołaniem Docker. Sticky root /tmp dopuszczalne wyłącznie ponad prywatnym rodzicem.

Test: atrapa Docker, istniejący katalog, symlink, współdzielony rodzic i pozytywna kopia 0700. Wszystkie dotychczasowe testy backup/restore zachowane. Wywołujący musi przekazać nieistniejący podkatalog prywatnego katalogu roboczego; parent dostosował test integracyjny. Backup nadal wymaga szyfrowanego off-host storage; SHA256 nie zapewnia autentyczności wobec napastnika, który może podmienić cały backup.

### INF-06 — podatne składniki obrazów — częściowo naprawione

OWASP A06 / CWE-1104. `pgbouncer/Dockerfile:10`: świeży upstream PgBouncer nadal miał Alpine 3.24.2, libpq18.6, starsze musl/zlib. Dodano apk upgrade --no-cache podczas budowy obrazu aplikacyjnego. Oddzielny build `zglosto-infra-audit-pgbouncer:patched` i ponowny Trivy: **108 wpisów → 0 wpisów**; nie zmieniano upstream ani działającego kontenera. Nie każda CVE przypisana libpq oznacza osiągalny atak na PgBouncer — część opisów dotyczy kodu serwera PostgreSQL. Zero dotyczy wyłącznie tego skanu/bazy/platformy.

`backend/Dockerfile:38`: usuwanie katalogu typescript pozostawiało `@typescript/typescript-linux-arm64/lib/tsc` (TypeScript 7 w Go) z 27 wpisami CVE. Rozszerzono usuwanie build-time compiler peers na platformowe paczki @typescript/typescript-*. `verify-production-install` nadal weryfikuje importy runtime. Oddzielny build backendu i ponowny Trivy: **28 → 1 MEDIUM zlib**. Nie zmieniano package.json backendu ani locka. Statyczny test potwierdza zachowanie reguły usuwania.

Pozostałe obrazy i CVE opisano niżej; brak automatycznego dopisania skanera do pipeline. Surowy wynik skanera jest inwentarzem składników, a nie dowodem exploita wszystkich ścieżek.

## Pokrycie i zweryfikowane zabezpieczenia

- Produkcyjny Compose: aplikacje UID nie-root, no-new-privileges, cap_drop ALL, read-only root, ograniczone tmpfs, PID/CPU/RAM, rotacja logów; DB/RabbitMQ wymagają zapisu danych i bootstrapu, więc nie mają identycznej izolacji. Dockerfiles aplikacji mają allowlisty kontekstu wykluczające .env/secrets/klucze/certyfikaty oraz wieloetapowe buildy. Nie odczytywano rzeczywistych sekretów.
- Produkcyjny edge publikuje 443/8443; database ports są resetowane. Lokalne/integracyjne profile mają inne porty i jawnie słabsze granice. Grafana lokalnie bind 127.0.0.1; telemetry backendy nie mają publicznych portów Compose.
- Publiczny Compose TLS1.3; nginx→auth i backend→auth/LLM mTLS, weryfikacja CA i workload URI; gateway dopuszcza ścieżki zależnie od klienta i wymaga HMAC treści. RabbitMQ używa TLS1.3 z hasłem (verify_none dotyczy certyfikatu klienta — nie jest to mTLS). PgBouncer/DB TLS + SCRAM; nie stwierdzono anonimowego dostępu TCP do DB.
- K8s ma default-deny Ingress/Egress, selektory konkretnych aplikacji, ograniczone porty i DNS. Cert-manager generuje/rotuje certyfikaty leaf; rotacja CA jest operacją konserwacyjną. Pozytywne i negatywne testy polityki klastra przeszły; nie dowodzi to egzekwowania CNI w rzeczywistym klastrze.
- Gateway wysyła tylko opis do modelu, bez osobnych pól miasta/adresu; wynik jest parsowany do zamkniętego kontraktu, serviceKey wymuszony null. Model nie dostaje narzędzi/URL fetch/SQL. Prompt injection może zmienić klasyfikację municipal/emergency — JSON i system prompt nie gwarantują poprawności semantycznej. Nie potwierdzono z tego kodu wykonania komend/SSRF przez prompt. LLM domyślnie disabled.
- Backup zatrzymuje piszące usługi, kontroluje SIGKILL, wznawia tylko wcześniej uruchomione repliki; restore weryfikuje sumy i audyt spójności przed wznowieniem ruchu. Testy używały atrap, bez zmiany istniejących danych. Backup K3s wymaga prywatnej ścieżki i spójnego tokenu/snapshotu.
- Deploy wymaga zweryfikowanych lokalnych obrazów, rozdziela migracje i backup, kontroluje pliki sekretów. Brak testu rzeczywistej instalacji nftables/systemd, failover K3s, PITR, host hardeningu i podpisów obrazów dostawców.

## Pozostałe granice transportu i egress

| Połączenie                                     | Stan konfiguracji             | Ryzyko/ograniczenie                                                            |
| ---------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Internet→edge Compose                          | TLS1.3                        | certyfikat/klucz operatora; nie testowano produkcyjnego certyfikatu            |
| Ingress→nginx K8s                              | HTTP1235                      | TLS kończy się na ingress; wymaga zaufanej sieci klastra                       |
| nginx→backend/frontend                         | HTTP3000/8080                 | PII/sesje na backend hop nie są szyfrowane; wymaga izolacji hosta/CNI          |
| nginx/backend→auth, backend/KEDA→gateway       | TLS/mTLS                      | CA i URI oraz HMAC dla klasyfikacji                                            |
| aplikacja→PgBouncer→Postgres                   | TLS                           | nie ogranicza nadmiernych praw roli DB                                         |
| backend/worker→RabbitMQ                        | TLS z hasłem                  | brak certyfikatu klienta, więc nie mTLS                                        |
| backend/worker/nginx→RustFS lokalny            | HTTP9000                      | treści mediów i podpisy na zaufanej sieci; nie pełne szyfrowanie end-to-end    |
| aplikacja→lokalny Redis                        | TCP6379 z ACL                 | brak TLS, klucze i dane transient widoczne w sieci hosta/klastra               |
| aplikacje→OTEL i lokalne Loki/Tempo/Prometheus | HTTP                          | brak mTLS; możliwość podsłuchu/fałszowania przez przejęty dopuszczony workload |
| gateway→DMR lokalny                            | HTTP12434                     | opis mieszkańca opuszcza proces gateway, zaufana lokalna sieć/model runner     |
| gateway→zewnętrzny LLM                         | HTTPS po naprawie             | nie weryfikowano retencji, dostawcy ani zakresu PII w opisie                   |
| egress backend/worker/gateway K8s              | szeroki 443; gateway też12434 | allowlista portów, nie domen; brak gwarancji blokady RFC1918/metadata          |

Nie przedstawiono tych jawnych granic jako zdalnego anonimowego exploita. Pełne TLS każdego hopu wymaga zmian listenerów backendu/frontendu/storage/telemetrii, certyfikatów i klientów poza sektorem oraz testów całego klastra; nie wprowadzono jednostronnego proxy_pass https bez listenera. nftables INPUT nie zastępuje kontroli Docker FORWARD; poprawność ochrony publikowanych portów zależy od braku dodatkowych mappings i konfiguracji hosta.

## DM-03 — przekazane rozdzielenie DB; DM-04 — późniejsza implementacja poniżej

Przejęto potwierdzenie z raportu data-media. Poniższy opis DB dotyczy stanu przekazanego agentowi3; jego późniejsze wdrożenie ról ocenia parent. DM-04 został następnie zaimplementowany i przetestowany, zgodnie z sekcją „Implementacja DM-04” poniżej. OWASP A05, CWE-250/269.

DB: `docker-compose.no-rustfs.yml:12` i obecne źródła sekretów łączą bootstrap POSTGRES_USER z runtime. Compose/K8s/PgBouncer współdzielą DATABASE_URL. Sama zmiana hasła/nazwy roli nie ogranicza grantów. Bezpieczny rollout wymaga: utworzyć osobne konta auth/API/worker NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; nadać jawne prawa tabel/sekwencji oraz triggerów provisioningu; zachować oddzielną rolę migracji/backup; ustawić ALTER DEFAULT PRIVILEGES dla rzeczywistego właściciela migracji; przygotować auth_user/auth_query PgBouncera i trzy mapowania klientów; dopiero po testach przełączyć osobne sekrety. Nie obniżać istniejącego POSTGRES_USER w ciemno ani nie zmieniać właścicieli tabel bez inwentarza.

Konkretna blokada: przydzielony sektor nie obejmuje modeli dostępu backend/auth i poleceń operacyjnych używających tego samego klienta, a instrukcja zabrania zmiany istniejących danych/stosu. Init-script uruchamia się wyłącznie dla pustego PGDATA i nie migruje istniejącej instalacji. Nie wykonano rotacji ani provisioningu istniejących kont; nie dodano niezweryfikowanego SQL, który pozorowałby kompletną migrację. Potrzebny osobny izolowany test z kontami docelowymi: logowanie/session/provisioning, incydenty, worker, migracje nowej tabeli, backup/restore oraz negatywne próby DDL, COPY PROGRAM, pg_authid i niepotrzebnych tabel auth. Zmiana może zostać zamknięta dopiero po tym teście.

Dawna blokada DM-04 została usunięta po rozszerzeniu zakresu o konfigurację backendu i komendy operacyjne. Obowiązuje implementacja i dowody poniżej.

## Testy wykonane

- `bun test ./scripts/test-infrastructure.ts`: 13 pass po końcowym rozszerzeniu profili Redis.
- `bun run --cwd llm_gateway test`: 25 pass, 5 plików; typecheck PASS.
- `bun run --cwd packages/observability test`: 8 pass.
- `bun scripts/check-cluster-workloads-security.ts`: PASS, pozytywne/negatywne manifesty.
- `bun scripts/check-redis-profiles.ts`: PASS; `bun scripts/check-production-compose.ts`: PASS dla wszystkich 54 kombinacji (render/policy, nie runtime aktywnego LLM bez Redis).
- Oddzielne `docker build` backend/PgBouncer pod nowymi tagami i Trivy patched: PASS. Nie przepięto kontenerów parenta na te tagi.
- Pełny test integracyjny, DB/IAM provisioning i multi-pod replay z prawdziwym Redis: poza tym przebiegiem; nie oznaczono jako PASS.

## Audyt CVE obrazów

Oficjalny Trivy **0.76.2**, pobrany z wydania aquasecurity/trivy do `/tmp/zglosto-infra-audit`, suma SHA256 archiwum zgodna z plikiem wydania: `ae7ea358326960406b703c77b2ac490190797d80b306b5b50c2a27221da0a5b8`. To kontrola integralności wydania, nie niezależna weryfikacja podpisu. Metadane oficjalnego wydania: https://github.com/aquasecurity/trivy/releases/tag/v0.76.2 . Baza Trivy UpdatedAt `2026-11-13T12:56:33Z`, pobrana `2026-11-13T19:22:37Z`. Skan lokalnych obrazów arm64 przez `trivy image --image-src docker --scanners vuln --format json`; bez uruchamiania skanowanych obrazów, bez eksportu env/sekretów do raportu.

Dowody zawierające image IDs/digests i wszystkie wykryte CVE/pakiety/wersje/fixy/targets zapisano w `docs/security-audit-2026-11-13-infrastructure-images.json`. Pełne wyniki i logi skanera pozostają w `/tmp/zglosto-infra-audit`. C/H/M/L/U to liczba wpisów pakiet–CVE, z możliwymi powtórzeniami między binariami, a nie liczba niezależnych exploitów.

| Obraz                                        |   C |   H |    M |    L |   U |
| -------------------------------------------- | --: | --: | ---: | ---: | --: |
| alpine:3.24.4                                |   0 |   0 |    1 |    0 |   0 |
| zglosto-infra-audit-backend:patched          |   0 |   0 |    1 |    0 |   0 |
| edoburu/pgbouncer:v1.26.1-p0                 |   0 |  79 |   25 |    4 |   0 |
| grafana/grafana:13.2.6                       |   0 |  19 |   26 |    1 |  19 |
| grafana/loki:3.7.10                          |   0 |   0 |    0 |    0 |   1 |
| grafana/tempo:3.1.1                          |   0 |   2 |    3 |    0 |   5 |
| nginx:1.31.8-alpine3.24-slim                 |   0 |   0 |    1 |    0 |   0 |
| otel/opentelemetry-collector-contrib:0.165.0 |   0 |   0 |    0 |    0 |   2 |
| oven/bun:1.4.4-alpine                        |   0 |   0 |    1 |    0 |   0 |
| zglosto-infra-audit-pgbouncer:patched        |   0 |   0 |    0 |    0 |   0 |
| postgres:18.7-alpine3.24                     |   1 |  25 |   31 |    3 |   2 |
| prom/alertmanager:v0.35.0                    |   0 |   2 |    2 |    0 |   4 |
| prom/prometheus:v3.16.0                      |   0 |   2 |    2 |    0 |   4 |
| rabbitmq:4.4.0-alpine                        |   0 |   0 |    1 |    0 |   0 |
| rancher/k3s:v1.37.2-k3s1                     |   0 |   6 |   13 |    3 |   5 |
| redis:8.10.3-alpine3.23                      |   0 |   0 |    1 |    0 |   0 |
| rustfs/rustfs:1.0.5                          |   0 |   0 |    0 |    0 |   0 |
| zglosto-security-audit-authorization:latest  |   0 |   0 |    1 |    0 |   0 |
| zglosto-security-audit-backend:latest        |   0 |  15 |   11 |    1 |   1 |
| zglosto-security-audit-database:latest       |   1 |  25 |   31 |    3 |   2 |
| zglosto-security-audit-frontend:latest       |   0 |   0 |    1 |    0 |   0 |
| zglosto-security-audit-llm_gateway:latest    |   0 |   0 |    1 |    0 |   0 |
| zglosto-security-audit-nginx:latest          |   0 |   0 |    1 |    0 |   0 |
| zglosto-security-audit-pgbouncer:latest      |   0 |  79 |   25 |    4 |   0 |
| zglosto-security-audit-rabbitmq:latest       |   0 |   0 |    1 |    0 |   0 |
| docker/model-runner:latest                   |  30 | 542 | 2697 | 1097 |   4 |

### Pozostałe CVE i ocena osiągalności

- PostgreSQL18.7 i własny database zawierają 62 wpisy w `/usr/local/bin/gosu`, w tym CRITICAL CVE-2025-68121 (Go crypto/tls session resumption) i 25 HIGH stdlib. Gosu jest lokalnym pomocnikiem zmiany UID, nie serwerem/klientem TLS; obecność biblioteki nie dowodzi osiągalnego obejścia TLS w PostgreSQL. To **pozostawiony składnik z CVE**, nie potwierdzony critical exploit usługi. Wymaga przebudowy/podmiany gosu z aktualnym Go i testów entrypointa/backup; nie usunięto narzędzia potrzebnego inicjalizacji DB.
- Alpine/Bun/NGINX/RabbitMQ/Redis/backend patched: pozostały MEDIUM **CVE-2026-4738 zlib**, skaner podaje fix1.4-r0. Nie wymuszono pakietu z innej gałęzi Alpine ani nie uznano latest za dowód bezpieczeństwa; możliwa osiągalność zależy od faktycznie użytych ścieżek kompresji i danych. Wersje i targets znajdują się w dowodach JSON.
- Prometheus3.16 i Alertmanager0.35: **CVE-2026-78661 golang.org/x/net** (fix0.62.0) w binariach usług oraz narzędzi. Tempo3.1.1: ta sama CVE i **CVE-2026-116587 go-jose/v4** (fix4.1.6). Lokalne backendy nie są publicznie publikowane; osiągalność ataku zależy od użytej funkcji/protokołu. Nie przebudowano upstreamowych binariów i nie wyłączono funkcji w ciemno.
- Grafana13.2.6: 19 HIGH rozłożonych w bundled datasource plugins, głównie x/net CVE-2026-78661, dodatkowo plugin mysql ze starszym Go stdlib i plugin tempo z CVE-2026-21728/CVE-2026-28377. Nie dowiedziono, że projekt uruchamia podatne serwerowe funkcje Tempo wewnątrz pluginu. Grafana wymaga auth i ma port loopback w Compose; nadal istnieje ryzyko dla uprawnionego użytkownika konfigurującego źródła danych. Nie usuwano potrzebnych pluginów bez testu dashboardów.
- K3s1.37.2: HIGH **CVE-2026-41567**, **CVE-2026-42306** github.com/docker/docker bez FixedVersion w bazie, **CVE-2026-56854 x/crypto** (fix0.55.0), **CVE-2026-78661 x/net** (fix0.62.0); starsze biblioteki w k3s/runc/containerd-shim. Obraz nie był uruchamiany jako klaster w tym audycie. Brak dowodu użycia odpowiadających im funkcji Docker w K3s; otwarty komponent supply-chain wymaga triage/upstream.
- OTEL/Loki mają wpisy UNKNOWN, których nie zignorowano: komplet w JSON. RustFS1.0.5 nie otrzymał wpisów w tej bazie, co nie zastępuje oceny IAM/konfiguracji lub bezpieczeństwa kodu.

Skan nie obejmuje host kernel, hypervisora OrbStack/Docker Desktop, obrazów amd64, podatności bez rekordów w bazie ani dowodu weryfikacji podpisów każdego obrazu. Obrazy build stage i runtime nie są tożsame. Nie przesyłano sekretów do usług skanowania.

### Dodatkowa weryfikacja ochrony replay

Na osobnym Redis8.10.3 uruchomionym z noeviction, bez persystencji i na losowym porcie loopback potwierdzono kwarantannę nowej generacji oraz dokładnie jedno skuteczne zajęcie nonce przez dwa niezależne klienty RedisTransientStore. Kontener testowy usunięto po teście; stos parenta pozostawiono bez zmian. Test utraty całego store/restartu procesu jest dodatkowo w regresjach modelowych. Nie testowano failover Redis ani zewnętrznego managed Redis. ACL dostarczonego profilu współdzieli użytkownika z auth/backend: ich przejęcie z uprawnieniem DEL do `zglosto:*` umożliwia usunięcie nonce; pełna izolacja od przejętych workloadów wymaga osobnego użytkownika/namespace ACL gateway i kontroli Redis administracyjnej. mTLS i HMAC nadal ograniczają dostarczenie replay. Tego ograniczenia nie ukryto pod samym SET NX.

### Docker Model Runner — wynik po powtórzeniu skanu

Pierwsza próba przekroczyła timeout podczas pobierania bazy analizy Java (~953MiB); po ukończeniu pobrania powtórzono skan z obiema aktualnymi bazami lokalnymi i zakończył się poprawnie. Nie pominięto CVE DMR. Wynik: 30 CRITICAL, 542 HIGH, 2697 MEDIUM, 1097 LOW, 4 UNKNOWN (wpisy pakiet–CVE). **Wszystkie 30 CRITICAL i 511 HIGH dotyczą linux-libc-dev, czyli nagłówków, a nie uruchomionego jądra.** Nie wolno z tego wyciągać wniosku, że kontener uruchamia podatny kernel; jądro zapewnia host i nie było skanowane. 642 wpisy warstwy OS nie mają FixedVersion.

Pozostałe OS HIGH dotyczą apt/libapt, curl/libcurl, brotli oraz OpenSSL; Go HIGH w `/app/model-runner` dotyczy containerd/v2, a w `/usr/bin/pebble` starszego stdlib/x/net (22 HIGH). Pełne identyfikatory i poprawione wersje są w dowodach JSON. Obrazu Docker Desktop DMR nie przebudowywano ani nie podmieniano poza kontrolą zarządzającego go Dockera; nie ma jego Dockerfile w projekcie. Wymaga aktualizacji upstream/warstw systemowych i ponownego skanu. Skaner nie dowodzi, że wszystkie zawarte funkcje containerd/pebble są osiągalne przez endpoint klasyfikacji. Nadal otwarty komponent supply-chain, bez deklaracji „DMR bezpieczny”.

Gateway inicjalizuje generację nonce już przy starcie; endpoint `/health/ready` zwraca503 w kwarantannie/braku store. Liveness pozostaje niezależne od upstream. Dzięki temu readiness klastra odzwierciedla dostępność ochrony replay, zamiast zwracać gotowość przy wymuszonej odmowie klasyfikacji.

### Uzupełnienie parenta: gosu i konfiguracja Redis

Parent przebudował gosu1.19 z tym samym kodem upstream, używając
Go1.27.3 z obrazu buildera przypiętego digestem; do runtime DB trafia tylko binarka.
`gosu --version` potwierdza nowy toolchain. Skan obrazu
`zglosto-security-database:patched` z tą samą bazą Trivy: 0 CRITICAL, 0 HIGH,
1 MEDIUM(zlib), 2 UNKNOWN. Nie oznacza to usunięcia zlib ani pozostałych CVE
zewnętrznych komponentów. Wynik dopisano do inwentarza JSON. Pełne testy
startu DB i backupu są wymagane po przebudowie końcowego obrazu.

Naprawiono również błędne nazwy env gatewaya w profilach Redis Compose
(`REDIS_MODE` i `REDIS_TLS_CA_PATH`). Nowy test renderuje oba profile i porównuje
rzeczywiste zmienne gatewaya; 14 testów infrastruktury PASS po tej zmianie.

## Implementacja DM-04 — scoped IAM RustFS — 2026-11-13

**Status: naprawione w źródłach i potwierdzone na odizolowanym RustFS1.0.5.** Nie rotowano sekretów ani nie zmieniono danych/kontenerów istniejących instalacji. Ten wynik zastępuje wcześniejszą otwartą blokadę DM-04 w raportach infra/data-media; nie jest deklaracją zastosowania migracji do już działającej produkcji. Severity pierwotne **High**, OWASP A05, CWE-250/CWE-269: przejęcie runtime ujawniało root credentials całego lokalnego storage.

### Naprawa i lokalizacje

- `scripts/provision-storage-iam.sh:11` i `scripts/provision-storage-iam.sh:40`: oficjalny `rustfs/rc:v0.1.37@sha256:7e93fd410a8fe51514f89373e093392c92095b98dc6140335fcfe956810c4c80`, tworzenie bucketu `--ignore-existing`, idempotentne tworzenie/aktualizacja użytkowników i polityk. Konfiguracja RC i wyjście komend z potencjalnymi metadanymi credentials tylko w prywatnym tmpfs; na stdout wyłącznie komunikat statusu. Zakaz wspólnych root/runtime tożsamości i sekretów. Użytkownik z obcymi politykami/grupami powoduje odmowę, nie ciche zachowanie uprawnień admin. Nazwa polityki zawiera hash bucketu/prefiksu, więc osobne wdrożenia nie nadpisują sobie polityk.
- `docker-compose.rustfs.yml:7` i `docker-compose.storage.local.yml:9`: root tylko serwer/one-shot `storage_provision`; backend i worker czekają na powodzenie bootstrapu. RC UID10001, read-only root, cap_drop ALL, no-new-privileges i prywatne tmpfs. `docker-compose.no-rustfs.yml`/`docker-compose.production.yml`: worker ma osobne credentials, root nie jest montowany w backendzie ani workerze.
- `k8s/components/rustfs/provision-job.yaml` i `provision-network-policy.yaml`: Job z kontami dostarczanymi plikami, bez tokenu ServiceAccount; egress wyłącznie RustFS9000 plus istniejące reguły DNS. Root serwera w osobnym Secret/zglosto-rustfs-root. Worker korzysta z Secret/zglosto-object-storage-worker-credentials. Mirrored skrypt bootstrapu sprawdzany bajtowo względem kanonicznego. Job wymaga oczekiwania na completion; przy rotacji/provisioningu należy odtworzyć ukończony Job, bez kasowania PVC.
- `docker-compose.storage.operations.yml:1`, `scripts/backup-compose.sh:13`, `scripts/restore-compose.sh:13`: trzecie konto storage operations jest montowane tylko w jednorazowych komendach audit/archive; normalne start/stop/resume zachowują credentials runtime. `backend/operations/object-storage-archive-cli.ts` i `object-storage-audit-cli.ts` walidują konfigurację storage zamiast całego backendu; archive nie wymaga DB/auth/brokera. Audit nadal używa DB do kontroli spójności. `k8s/examples/storage-operations-job.yaml` to zawieszony wzorzec storage archive z osobnym kontem/PVC, wymagający wyboru sprawdzonego obrazu i jawnego uruchomienia przez operatora.
- `backend/config/env.ts:304`: runtime odrzuca `S3_AUTO_CREATE_BUCKET=true`; lokalne, zewnętrzne, produkcyjne i integracyjne manifesty mają false. Tylko provisioning tworzy bucket.
- `deploy/cluster-secret-contract.json`, `deploy/compose/required-secret-files.txt`, `deploy/production-source-build.json`, `deploy/production-compose-modules.json`, env examples: osobne root/API/worker/operations; RC jako dodatkowy **pobierany komponent**, nadal osiem budowanych obrazów aplikacji. Zewnętrzne S3 nie otrzymuje RustFS root ani RC bootstrapu; trzy konta/polityki dostarcza IAM danego providera.

### Minimalne prawa i świadomy kompromis

Każde z trzech oddzielnych kont otrzymuje ListBucket/GetBucketLocation dla dokładnie jednego bucketu, GetObject/PutObject/DeleteObject wyłącznie dla `S3_OBJECT_PREFIX/*`. Nonempty prefix bez wildcard/quotes/parent segments. Brak s3:_, admin:_, CreateBucket, PutBucketPolicy oraz innych bucketów/prefiksów. Listing bucketu obejmuje nazwy obiektów również poza prefiksem: świadomy kompromis dla HeadBucket/readiness i obecnego adaptera. Nie daje dostępu do ich treści. Backend potrzebuje delete dla zastępowania obrazów; worker potrzebuje get/put/delete do transformacji i cleanup; operacje używają osobnej tożsamości mimo podobnego zakresu dla backup/restore. Konta można niezależnie rotować i odwoływać.

Idempotentny provisioning nie usuwa danych/bucketów. Zmiana zakresu na istniejącym koncie wymaga jawnego odpięcia starej polityki — skrypt nie usuwa cudzych grantów w ciemno. Dla dotychczasowego wdrożenia należy zachować stare root values w nowych root-secret files, wygenerować nowe konta runtime/operations, wykonać bootstrap, a dopiero potem przełączyć workloady. Szczegółowy rollout i wymagania uprawnień plików opisano w `deploy/storage/README.md`. Nie wolno po prostu skopiować starego root key do czterech zestawów plików.

### Dowody i testy

Reprodukcja: `scripts/test-storage-iam.sh`. Własny projekt **security-storage-iam**, nowy wolumen, RustFS1.0.5, losowy port127.0.0.1, przypięty oficjalny RC; brak dostępu do istniejącego stosu parenta. Skrypt odmawia użycia istniejącego fixture i usuwa tylko własny projekt po zakończeniu.

Potwierdzono rzeczywiście, nie na mockach:

1. Bootstrap działa jako UID10001, z plikami sekretów, read-only root i bez capabilities; drugie wykonanie kończy się sukcesem i zachowuje wcześniej zapisany obiekt.
2. Backend, worker, operations: pozytywny PUT/GET/DELETE pod właściwym prefiksem; treść odczytana zgodna.
3. Każde konto: HTTP403 przy GET/PUT obcego bucketu, GET obiektu poza prefiksem, CreateBucket i PutBucketPolicy.
4. Każde konto: oficjalny RC odrzuca admin user listing z błędem uprawnień (nie uznano błędu sieci za dowód odmowy).
5. Konto operations: pełny roundtrip rzeczywistych writeObjectStorageArchive/restoreObjectStorageArchive oraz CLI backup/restore, bez credentials DB/auth/RabbitMQ; obiekt po restore zgodny.

Regresje: `backend/storage/storage-iam.integration.test.ts` (3 testy opt-in na izolowanym loopback), runtime env guard, renderowane rozdzielenie sekretów K8s, użycie konta operations w backup/restore, identyczność skryptu bootstrapu, odmowa wspólnego root identity bez wywołania RC. Kontrakty54 kombinacji Compose, osiem obrazów i K8s przechodzą; schema rendering i testy modeli nie zastępują testu rzeczywistego klastra. Root/admin API nie testowano na zewnętrznych usługach.

Dodatkowy Trivy oficjalnego RC v0.1.37: **0 CRITICAL, 0 HIGH, 1 MEDIUM CVE-2026-4738 zlib**, fix1.4-r0 według bazy. Pełny identyfikator obrazu i rekord w infrastructure-images.json; nie nazwano obrazu wolnym od CVE. Root credentials są ograniczone do krótkiego bootstrapu i serwera, a nie runtime aplikacji. HTTP wewnątrz lokalnej sieci, uprawnienia operatora hosta i istniejące bucket policies pozostają osobnymi granicami; sam IAM nie szyfruje transportu. Nie uruchamiano rzeczywistego klastra K8s ani zewnętrznego IAM providera.

Końcowe sprawdzenia kontynuacji IAM: 17 testów infrastruktury PASS, 26 testów env/audit backendu PASS, 3 rzeczywiste testy SDK/archiwum/CLI PASS; backend build/typecheck i lint PASS, public-repository guard PASS. Rzeczywisty dev profil RustFS/RC ze sztucznym zależnym kontenerem potwierdził service_completed_successfully; bez uruchamiania aplikacji/DB i bez portów parenta. Wzorzec K8s operations wymaga ustawienia aktualnej hashowanej nazwy ConfigMap, zweryfikowanego obrazu oraz PVC przed odwieszeniem.

## Domknięcie parenta: role DB, sondy i skany końcowych obrazów

DM-03 został zaimplementowany i przetestowany; aktualny opis ról, grantów,
sekretów, poolera i kontrolowanej migracji jest w raporcie data-media. Wcześniejszy
opis blokady DB jest historycznym punktem przekazania, nie bieżącym statusem źródeł.

Sondę gotowości gatewaya rozdzielono od liveness argumentem `--ready`.
Compose i readiness Kubernetes sprawdzają ochronę replay i dostępność modelu;
liveness nie restartuje procesu w trakcie kwarantanny. Testowy model udostępnia
teraz tę samą ścieżkę listy modeli co adapter DMR; integracja sprawdza rzeczywistą
gotowość także po utracie danych Redis.

Ponowny skan końcowych obrazów arm64 (ta sama baza Trivy):
PgBouncer: zero wpisów; backend:1 MEDIUM; database:1 MEDIUM i2 UNKNOWN;
official RCv0.1.37:1 MEDIUM. Zero CRITICAL/HIGH w tych czterech artefaktach.
Wyniki z image IDs dopisano do inwentarza JSON. Pozostałe obrazy zewnętrzne
i ich opisane CVE nie zostały uznane za naprawione.

### Regresja odzyskiwania Redis w pełnej integracji

Test zatrzymania Redis wykrył wyczerpanie ograniczonych prób reconnect w gatewayu.
`sharedNonceConsumer` łączy się ponownie przed sprawdzeniem generacji, współdzieląc
jedną próbę pomiędzy równoległymi żądaniami. Błąd połączenia nadal daje odmowę;
po odzyskaniu danych obowiązuje kwarantanna. Dodany test awaria→odmowa→odzyskanie
przechodzi; suite gateway ma 26 testów PASS. Integracyjny stub ma okno skew1s
(kwarantanna3s) dla szybszego testu tej samej maszyny stanów. Domyślny produkcyjny
skew30s/kwarantanna61s pozostaje bez zmiany i jest sprawdzany w testach modelowych.

## Końcowy odbiór integracyjny parenta

Pełne `bun run check`: PASS. Pełna integracja OrbStack po połączeniu zmian wszystkich
sektorów: PASS, exit0, z backup/restore DB+S3 i odtworzeniem grantów ról runtime.
Faktyczny kontrakt target wszystkich8 obrazów: PASS. PgBouncer po apk upgrade
przekraczał budżet przez stare zastąpione warstwy; końcowy etap scratch kopiuje cały
aktualny filesystem (z metadanymi APK/OS) do jednej warstwy, zachowując upstream
entrypoint i UID. Wynik19.1MB mieści się w20MB; ponowiono10 testów DB/poolera.
Zmiany nie zostały wdrożone na istniejącą produkcję. Raport zbiorczy jest w
`../security_best_practices_report.md`.
