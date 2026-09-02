# Faza 11 / kroki 3–8 — obrazy runtime

## Status

Kroki 3–8 wykonano 2026-07-26, a 2026-07-28 odchudzono bazowe obrazy Nginx, PostgreSQL
i RabbitMQ oraz wprowadzono osobne allowlisty kontekstu. Po wdrożeniu lokalnego pipeline'u z kroku 9 oraz
modułowego produkcyjnego Compose z kroku 10. Faza 11 została następnie zakończona
w `14/14`; aktualne dowody opisuje [phase-11-completion.md](phase-11-completion.md).

Zakres obejmuje wspólny wzorzec obrazów Node, jego zastosowanie do usług aplikacyjnych,
utwardzenie statycznego frontendu oraz obrazów Nginx, PostgreSQL, PgBouncer i RabbitMQ.
Nie zmieniono kontraktów domenowych ani podziału odpowiedzialności usług.

## Wspólny wzorzec Node

`authorization`, `backend`/`media_worker` i `llm_gateway` używają teraz:

- nazwanych etapów `build`, `development` i `production`;
- `pnpm fetch` oraz współdzielonego cache BuildKit `/pnpm/store`;
- instalacji offline z przypiętego `pnpm-lock.yaml`;
- topologicznego builda zależności workspace;
- `pnpm deploy --prod` oraz usunięcia lockfile, deklaracji TypeScript i source map z
  artefaktu runtime;
- minimalnego runtime `alpine:3.24.1` z binarnym Node 26.8.1, CA i bibliotekami C++,
  bez npm, PNPM i toolchainu;
- użytkownika `node:node` o UID/GID `1000`;
- `STOPSIGNAL` oraz wbudowanego `HEALTHCHECK`;
- plikowych sekretów ładowanych dopiero w entrypoincie.

Każdy Dockerfile ma własną allowlistę `Dockerfile.dockerignore`. Kontekst builda zawiera
wyłącznie wymagane manifesty, źródła i konfigurację oraz wyklucza lokalne zależności,
cache, coverage, artefakty kompilacji, `.env`, sekrety, klucze i certyfikaty. Buildery
Node kopiują przed instalacją wyłącznie manifest bieżącej usługi i manifesty jej
rzeczywistych zależności `workspace:*`. Plik `tsconfig.base.json` oraz źródła trafiają
do buildera dopiero przez późniejsze `COPY . .`, którego zawartość ogranicza allowlista.
Zmiana manifestu niezależnej aplikacji nie unieważnia dzięki temu warstwy instalacji
pozostałych usług. Metadane wydania pozostają w manifeście lokalnego builda; etykiety
obrazu odroczono do czasu rzeczywistego CI/CD i publikacji obrazów.

## Zachowane kontrakty usług

- `authorization` zachowuje listener mTLS, healthcheck z osobną tożsamością klienta,
  Better Auth i konfigurację White‑Label;
- `backend` i `media_worker` nadal używają jednego niezmiennego artefaktu, ale osobnych
  komend, probe’ów, limitów i procesów;
- obraz backendu zawiera produkcyjny Sharp/libvips; rzeczywisty test zakodował obraz WebP;
- `llm_gateway` zachowuje adaptery `disabled`, lokalnego DMR i zewnętrznego providera;
  w trybie disabled liveness zwraca `200`, a readiness kontrolowane `503`;
- runtime nie zawiera katalogów źródłowych, testów, rootowego lockfile ani konfiguracji
  kompilatora.

## Frontend i Nginx

Statyczny frontend oraz publiczny reverse proxy działają jako `nginx:nginx` (UID/GID 101)
bez root mastera i bez Linux capabilities:

- frontend nasłuchuje na nieuprzywilejowanym porcie `8080`;
- deweloperski/klastrowy edge Nginx nasłuchuje na `1235`;
- produkcyjny edge Nginx kończy TLS na wewnętrznym porcie `8443`, mapowanym domyślnie na
  port hosta `443`;
- PID i pliki tymczasowe trafiają do `/tmp`, a cache proxy do jawnego zapisywalnego
  `/var/cache/nginx`;
- produkcyjny Compose i workloady klastrowe używają `read_only`, `cap_drop: ALL` i
  ograniczonych `tmpfs`/`emptyDir`;
- zachowano routing SPA, readiness White‑Label, cache strony głównej oraz mTLS do
  Authorization.

## Obrazy stanowe

- PostgreSQL zachowuje oficjalny root-init, przejście właściwego procesu na `postgres`,
  `pg_cron`, pgBackRest, TLS 1.3, WAL archive i kontrolowany shutdown.
- RabbitMQ zachowuje oficjalny root-init, przejście brokera na `rabbitmq`, trwały quorum
  queue, TLS-only listener i plugin Prometheus; panel oraz listener management są wyłączone.
- PgBouncer uruchamia się od początku jako `postgres:postgres` (UID/GID 70). Usunięto
  `su-exec`; certyfikaty są kopiowane do zapisywalnego runtime TLS już bez podnoszenia
  uprawnień.
- Namespace Kubernetes/K3s egzekwuje PSS `baseline` i ostrzega względem `restricted`.
  Stateless workloads oraz PgBouncer jawnie ustawiają `runAsNonRoot`,
  `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, seccomp i `drop: [ALL]`.
  Root-init bazy i brokera pozostaje udokumentowanym wyjątkiem stanowym.

## Wyniki na `linux/arm64`

Rozmiary po zmianach pochodzą z `docker image inspect .Size` w OrbStack:

| Artefakt                   | Baseline |    Wynik | Budżet |    Zmiana |
| -------------------------- | -------: | -------: | -----: | --------: |
| `authorization`            | 332,0 MB | 257,9 MB | 260 MB |  −74,1 MB |
| `backend` / `media_worker` | 297,9 MB | 223,1 MB | 275 MB |  −74,8 MB |
| `llm_gateway`              | 236,3 MB | 184,2 MB | 205 MB |  −52,1 MB |
| `frontend`                 |  62,9 MB |  14,2 MB |  65 MB |  −48,7 MB |
| `database`                 | 483,3 MB | 299,4 MB | 490 MB | −183,9 MB |
| `pgbouncer`                |  17,6 MB |  17,5 MB |  20 MB |   −0,1 MB |
| `rabbitmq`                 | 168,6 MB | 160,4 MB | 175 MB |   −8,2 MB |
| `nginx`                    |  61,8 MB |  13,2 MB |  65 MB |  −48,6 MB |

`pnpm check:images:target` sprawdza dla wszystkich ośmiu artefaktów rozmiary, użytkowników,
healthchecki, brak źródeł i brak ścieżek sekretów. Etykiety obrazów nie są obecnie częścią
kontraktu.

## Dowody funkcjonalne

Pełny `scripts/test-phase0-integration.sh` potwierdził po migracji:

- mTLS backend/Nginx → Authorization i odrzucanie obcych tożsamości;
- TLS 1.3 backend/Authorization → PgBouncer → PostgreSQL oraz odrzucanie plaintextu;
- RabbitMQ quorum/outbox, retry, DLQ i odtworzenie po awarii brokera;
- przetwarzanie Sharp/WebP i spójność Object Storage;
- 20 tras NestJS, role Better Auth i zachowanie LLM fallback;
- pgBackRest/WAL, backup/restore i graceful shutdown.

`pnpm check:source` potwierdził spójność Compose, Kubernetes i K3s. Kroki 9–14 pozostają
otwarte. Po zmianie strategii dostarczania następny jest
[produkcyjny build ze źródeł](phase-11-step-9-source-build-plan.md): natywny dla
architektury hosta, bez centralnego registry i GitHub-hosted runners.
