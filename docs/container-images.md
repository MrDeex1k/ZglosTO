# Obrazy kontenerowe

## Aktualny baseline

Od 2026-08-18 projekt używa następujących przypiętych obrazów:

| Obszar                                          | Obraz                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| build Node.js                                   | `node:26.7.0-alpine3.24`                                          |
| minimalny runtime usług Node                    | `alpine:3.24.1` + binarny Node 26.7.0                             |
| publiczny Nginx i runtime statycznego frontendu | `nginx:1.31.3-alpine3.24-slim`                                    |
| opcjonalny model DMR                            | `ai/gemma3-qat:1B-Q4_K_M`                                         |
| baza własnego obrazu database                   | `postgres:18.6-alpine3.24`                                        |
| własny obraz poolera                            | `pgbouncer/Dockerfile` bazujący na `edoburu/pgbouncer:v1.25.2-p0` |
| trwały broker bez panelu management             | `rabbitmq:4.3.5-alpine`                                           |
| lokalny Object Storage zgodny z S3              | `rustfs/rustfs:1.0.0-rc.2`                                        |
| OpenTelemetry Collector                         | `otel/opentelemetry-collector-contrib:0.159.0`                    |
| Prometheus                                      | `prom/prometheus:v3.14.0`                                         |
| Loki                                            | `grafana/loki:3.7.6`                                              |
| Tempo                                           | `grafana/tempo:3.0.3`                                             |
| Alertmanager                                    | `prom/alertmanager:v0.34.0`                                       |
| Grafana                                         | `grafana/grafana:13.2.0`                                          |

Wersje są przypięte jawnie, aby kolejne buildy nie zmieniały runtime'u wyłącznie przez przesunięcie ruchomego tagu bazowego.

RustFS `1.0.0-rc.2` jest przypiętym obrazem wieloarchitekturowym. Działa jako użytkownik
`10001`, zapisuje do wolumenu `/data`, nie publikuje portów `9000/9001` na hoście i jest
sprawdzany przez `/health/ready`. Produkcyjny klaster oraz PVC pozostają zakresem Fazy 9.

PgBouncer `1.25.2` zawiera poprawki bezpieczeństwa dla linii 1.25. Obraz `-p0` został
opublikowany ponad 48 godzin przed wdrożeniem, obsługuje `linux/amd64` i `linux/arm64` oraz
zawiera `psql` używane przez healthcheck. Projektowy wrapper działa od początku jako
`postgres:postgres`, kopiuje montowany klucz do chronionego katalogu runtime i uruchamia
oryginalny entrypoint bez `su-exec`; dzięki temu
PgBouncer może zakończyć TLS 1.3 bez zapisywania klucza w obrazie. Nie korzystamy z ruchomego
`latest`.

RabbitMQ `4.3.5` jest aktualnym przypiętym obrazem. Projektowy obraz
kopiuje konfigurację TLS i healthcheck, wyłącza listener plaintext `5672`, nie uruchamia
pluginu ani listenera management i utrzymuje dane w osobnym wolumenie. Plugin Prometheus
pozostaje dostępny wyłącznie w sieci prywatnej.

PostgreSQL korzysta z wariantu Alpine. Etap pomocniczy instaluje pakiety `pg_cron` i
pgBackRest wraz z systemowym PostgreSQL wyłącznie na czas budowania. Do finalnego obrazu
trafiają tylko `pg_cron.so`, pliki kontrolne rozszerzenia, binarny pgBackRest oraz jego dwie
brakujące biblioteki runtime, więc obraz nie zawiera drugiej instalacji serwera.

Model DMR ma zweryfikowany digest
`sha256:9f84c113e1f1085bddaffad1acb07c90e59487f0c7e25028f1811e71efba9599` i jest
uruchamiany wyłącznie przez opcjonalny `docker-compose.llm.yml`. Nie jest obrazem
aplikacyjnym budowanym przez `build-images.sh`.

Node 26 nie dostarcza Corepack w obrazie bazowym. Buildery instalują więc jawnie `pnpm@11.22.0` przez dołączone npm, po czym wszystkie operacje workspace, instalacji i deploy nadal wykonuje PNPM. Wersja spełnia bieżącą 24-godzinną kwarantannę i nie jest oznaczona w rejestrze jako wycofana.

Backend HTTP i `media_worker` są budowane z tego samego, niezmiennego artefaktu
`backend/Dockerfile`, ale Compose uruchamia je jako dwa niezależne procesy i kontenery z
różnymi komendami, ENV, healthcheckami oraz limitami zasobów. Worker nie dziedziczy runtime'u
procesu backendu i nie otwiera portu `3000`; współdzielenie obrazu ogranicza wyłącznie
duplikowanie zależności i kodu infrastrukturalnego. Pipeline workera używa dokładnie
przypiętego `sharp@0.35.3`; natywne binaria libvips są instalowane przez PNPM dla platformy
obrazu podczas builda, a test obrazu wykonuje rzeczywiste kodowanie WebP.

## PostgreSQL 18

PostgreSQL 18 używa docelowego układu danych zgodnego z oficjalnym obrazem:

- wolumen jest montowany w `/var/lib/postgresql`;
- `PGDATA=/var/lib/postgresql/18/docker`;
- `pgBackRest` używa `pg1-path=/var/lib/postgresql/18/docker`;
- smoke test montuje `tmpfs` na `/var/lib/postgresql`.

Przy danych wymagających zachowania aktualizacja musi przebiegać przez sprawdzony backup i restore. Obecne środowisko nie jest produkcyjne, dlatego można również świadomie utworzyć czysty wolumen.

## Obrazy aplikacyjne w profilach produkcyjnych

Od Fazy 9 / kroku 1 manifesty nie używają już `latest`. Wspólna baza Kustomize ma techniczny
tag `phase9-baseline`, który pozwala deterministycznie renderować i walidować strukturę, ale
nie jest zatwierdzonym artefaktem produkcyjnym. `deploy.sh` nadal podmienia go na jawny tag
wydania.

Historyczny kandydat Compose z Fazy 9 / kroku 2 wymagał obrazów z registry przypiętych
digestem. Strategię tę zastąpiła Faza 11 / krok 9: host instalacji buduje natywnie osiem
obrazów ze źródeł dla własnej architektury, bez centralnego registry, GitHub-hosted runnera,
QEMU i `push`.

Build wymaga czystego checkoutu przy dokładnym tagu Git, nadaje lokalny tag
`wersja-architektura-revision`, zapisuje manifest oraz `images.env` i uruchamia
`pnpm check:images:target`. W stanie ustalonym pozostaje wyłącznie aktywne wydanie. Krok 10
podłączył manifest i `images.env` do produkcyjnego Compose, który nie pobiera własnych
obrazów i domyślnie dodaje RustFS. Trivy oraz SBOM występowały w pierwotnej realizacji
Fazy 11, ale od decyzji właściciela z 2026-08-26 nie są częścią bieżącego pipeline'u ani
bramki wydania.

Audyt otwierający Fazę 11 wraz z pomiarami rozmiarów, oceną zawartości runtime,
hardeningu i pipeline'u znajduje się w
[phase-11-image-audit.md](phase-11-image-audit.md). Krok 1 z 14 został wykonany
2026-07-26.

Krok 2 zapisał wspólny [kontrakt i budżety obrazów](phase-11-step-2-image-contract.md).
Maszynowym źródłem prawdy jest `deploy/image-production-contract.json`, a
`pnpm check:image-contract` blokuje niespójność kontraktu i snapshotu. Lokalny
`pnpm check:images:local` sprawdza rzeczywiste obrazy z bieżącym limitem regresji,
natomiast `pnpm check:images:target` jest końcową bramką odchudzenia i hardeningu.

Kroki 3–8 wdrożyły [docelowe obrazy runtime](phase-11-steps-3-8-runtime-images.md).
Wszystkie osiem artefaktów przechodzi `pnpm check:images:target`; usługi Node korzystają
z minimalnego Alpine z samym Node, frontend i edge Nginx działają bez root na portach
nieuprzywilejowanych, a PgBouncer stale jako UID 70.

Krok 9 wdrożył [produkcyjny build ze źródeł](phase-11-step-9-source-build-plan.md).
Docelowy kontrakt po porządku technicznym ma egzekwować natywną architekturę, domyślny
RustFS, brak registry, retencję tylko aktywnego wydania i kontrole obrazów bez Trivy/SBOM.

Krok 10 podłączył lokalne referencje z `images.env` do
[modułowego produkcyjnego Compose](phase-11-step-10-production-compose-modules.md).
Własne obrazy mają `pull_policy: never`; polecenie `pull` dotyczy wyłącznie przypiętych
komponentów zewnętrznych wybranych przez operatora.

Kroki 11–14 zakończyły Fazę 11. Zewnętrzne komponenty mają `pull_policy: missing`, więc
kontrolowany deploy pobiera wyłącznie brakujące przypięte wersje, a restart hosta nie
wymaga sieci. Po udanej promocji `production-compose.sh` usuwa nieaktywne lokalne tagi
ZgłosTO i pozostawia dokładnie zestaw z `current.images.env`. Nie usuwa aktywnego obrazu
ani danych wolumenów. Procedury i dowody opisują
[runbook Compose](production-compose-runbook.md) oraz
[podsumowanie Fazy 11](phase-11-completion.md).
