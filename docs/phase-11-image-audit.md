# Faza 11 / krok 1 — audyt obrazów i kontekstów builda

## Status

Krok wykonano 2026-07-26. Audyt jest punktem odniesienia dla dalszych optymalizacji;
nie zmienił Dockerfile ani zachowania usług. Ustalone na jego podstawie budżety opisuje
[krok 2](phase-11-step-2-image-contract.md). Luki wykryte w audycie usunięto następnie
w [krokach 3–8](phase-11-steps-3-8-runtime-images.md), a produkcyjny build ze źródeł
wdrożono w [kroku 9](phase-11-step-9-source-build-plan.md), a lokalne obrazy podłączono
do [modułowego Compose w kroku 10](phase-11-step-10-production-compose-modules.md).
Faza 11 została następnie zakończona w `14/14`; aktualne dowody opisuje
[phase-11-completion.md](phase-11-completion.md).

## Zakres

Sprawdzono:

- wszystkie projektowe Dockerfile i używane obrazy bazowe;
- konteksty buildów Compose, reguły `.dockerignore` i układ warstw;
- zawartość oraz rozmiar lokalnie zbudowanych obrazów;
- użytkowników, entrypointy, healthchecki i metadane obrazów;
- istniejący hardening produkcyjnego Compose;
- obecny skrypt budowania i pokrycie supply chain w CI.

Testowy `tests/integration/Dockerfile.llm-stub` nie jest artefaktem produkcyjnym i nie
wchodzi do planu odchudzania obrazów wydania.

## Inwentaryzacja

| Artefakt        | Dockerfile / źródło          | Obraz bazowy                             | Kontekst builda |
| --------------- | ---------------------------- | ---------------------------------------- | --------------- |
| `authorization` | `authorization/Dockerfile`   | `node:26.8.1-alpine3.24`                 | katalog główny  |
| `backend`       | `backend/Dockerfile`         | `node:26.8.1-alpine3.24`                 | katalog główny  |
| `media_worker`  | wspólny `backend/Dockerfile` | `node:26.8.1-alpine3.24`                 | katalog główny  |
| `llm_gateway`   | `llm_gateway/Dockerfile`     | `node:26.8.1-alpine3.24`                 | katalog główny  |
| `frontend`      | `frontend/Dockerfile`        | builder Node + `nginx:1.31.3-alpine3.24` | katalog główny  |
| `database`      | `database/Dockerfile`        | `postgres:18.6-alpine3.24`               | katalog główny  |
| `pgbouncer`     | `pgbouncer/Dockerfile`       | `edoburu/pgbouncer:v1.25.2-p0`           | katalog główny  |
| `rabbitmq`      | `rabbitmq/Dockerfile`        | `rabbitmq:4.3.5-alpine`                  | katalog główny  |
| `nginx`         | `nginx/Dockerfile`           | `nginx:1.31.3-alpine3.24`                | `nginx/`        |

RustFS, Redis i lokalny stos obserwowalności używają bezpośrednio przypiętych obrazów
zewnętrznych. Nie mają projektowych Dockerfile.

Wszystkie aplikacyjne buildy są obecnie wykonywane tylko dla bieżącej architektury hosta.
Dockerfile nie definiują nazwanych targetów `development` i `production`.

## Baseline rozmiarów

Pomiary wykonano po pełnym buildzie Compose na `linux/arm64` w OrbStack. Są to lokalne
rozmiary obrazów raportowane przez engine, a nie skompresowany transfer z registry.

| Obraz                      |  Rozmiar | Obraz bazowy | Kontrolowalny narzut |
| -------------------------- | -------: | -----------: | -------------------: |
| `database`                 | 483,3 MB |     479,3 MB |               4,0 MB |
| `authorization`            | 332,0 MB |     174,7 MB |             157,3 MB |
| `backend` / `media_worker` | 297,9 MB |     174,7 MB |             123,2 MB |
| `llm_gateway`              | 236,3 MB |     174,7 MB |              61,5 MB |
| `rabbitmq`                 | 168,6 MB |     168,6 MB |            pomijalny |
| `frontend`                 |  62,9 MB |      61,8 MB |               1,2 MB |
| `nginx`                    |  61,8 MB |      61,8 MB |            pomijalny |
| `pgbouncer`                |  17,6 MB |      17,5 MB |               0,1 MB |

Największy możliwy do ograniczenia koszt występuje w trzech usługach Node. Duży obraz
PostgreSQL pochodzi niemal w całości z obrazu bazowego; projektowe rozszerzenia
`postgresql-18-cron` i `pgBackRest` dodają około 4 MB.

## Zawartość runtime

### Usługi Node

`pnpm deploy --prod` tworzy odseparowany katalog runtime, ale kopiuje do niego również
źródła workspace i większą część grafu zależności:

| Usługa          | `/app/node_modules` | Pliki TS/TSX wraz z zależnościami | Source maps |
| --------------- | ------------------: | --------------------------------: | ----------: |
| `authorization` |          ok. 214 MB |                             5 797 |       4 730 |
| `backend`       |          ok. 192 MB |                             8 053 |       4 848 |
| `llm_gateway`   |           ok. 89 MB |                             3 282 |       2 292 |

W obrazach pozostały między innymi kod źródłowy usługi, `tsconfig`, lockfile, README oraz
część paczek potrzebnych tylko podczas budowania. Przykładowo obraz `llm_gateway` zawiera
`@types/node`, mimo że jest to zależność developerska. Obraz Authorization zawiera między
innymi Prettier, binaria Rolldown i Lightning CSS. Backend zasadnie zawiera natywne
`sharp/libvips`, ale również `swagger-ui-dist`, którego obecność w produkcji trzeba
uzależnić od rzeczywistego udostępniania dokumentacji.

Finalny obraz frontendu jest prawidłowo odseparowany: zawiera około 1,2 MB statycznego
`dist`, bez źródeł TypeScript i source map.

### Sekrety

W finalnych obrazach nie znaleziono plików o nazwach wskazujących na prywatne klucze,
certyfikaty, `.env` lub sekrety. Sekrety są ładowane w runtime przez pliki `_FILE`.

Główny `.dockerignore` nie wyklucza jednak `secrets/`, ogólnych `*.key`, `*.pem`, `*.crt`
ani wszystkich wariantów `.env.*`. Przy zdalnym builderze takie pliki mogłyby zostać
przesłane w kontekście, nawet jeżeli żaden `COPY` nie umieści ich w warstwie. To luka
procesowa do usunięcia w następnym kroku bezpieczeństwa.

Kontekst główny ma obecnie tylko około 466 kB, więc jego rozmiar nie jest wąskim gardłem.
Pliki `.dockerignore` w katalogach `authorization`, `backend` i `frontend` nie wpływają na
buildy z kontekstem głównym; obowiązuje wyłącznie główny `.dockerignore`.

## Hardening i kontrakt uruchomieniowy

### Już osiągnięte

- Usługi Node i frontend używają buildów wieloetapowych.
- Finalny frontend kopiuje wyłącznie statyczny rezultat.
- Produkcyjny Compose nie buduje obrazów na hoście i wymaga obrazów przypiętych digestem.
- Produkcyjny Compose ma `no-new-privileges`, limity zasobów, rotację logów, polityki
  restartu, `tmpfs`, `cap_drop` i `read_only` tam, gdzie zostało to już przewidziane.
- Healthchecki/readiness/liveness istnieją na poziomie Compose i manifestów klastrowych.
- Backend HTTP i worker używają tego samego artefaktu, ale osobnych komend i procesów.
- EntryPoint loadera sekretów kończy się przez `exec`, więc sygnały trafiają do procesu
  aplikacyjnego.

### Luki

1. `authorization`, `backend` i `llm_gateway` nie deklarują `USER`; proces Node działa jako
   root. To najważniejsza luka runtime do usunięcia.
2. `pgbouncer` ma końcową konfigurację obrazu `USER root`. Wrapper obniża uprawnienia przez
   `su-exec postgres`, ale etap root powinien być minimalny i jawnie uzasadniony.
3. `database` ma rootowy proces nadzorujący własny entrypoint, podczas gdy proces Postgresa
   działa jako `postgres`. Trzeba zachować backup/restore i poprawną obsługę sygnałów przy
   ograniczaniu uprawnień.
4. Obrazy Nginx używają standardowego modelu root master + nieuprzywilejowane workery.
   Produkcyjny Compose dodaje tylko wymagane capabilities, ale docelowo należy ocenić obraz
   unprivileged i porty nieuprzywilejowane.
5. Produkcyjny `authorization` ma `cap_drop`, lecz jako jedyna usługa Node nie ma
   `read_only: true`.
6. Dockerfile nie zapisują własnego `HEALTHCHECK`. Platformowe probe są źródłem prawdy,
   ale samodzielnie uruchomiony obraz nie opisuje swojego health contractu.
7. Brakuje standardowych etykiet OCI: source, revision, version, created i licenses.

## Build i supply chain

Buildery instalują przypięty `pnpm@11.25.0` i korzystają z cache-friendly kopiowania
manifestów, ale:

- nie używają `pnpm fetch` ani BuildKit cache mounts;
- wykonują kilka osobnych buildów pakietów bez wspólnego targetu;
- lokalny `build-images.sh` buduje obrazy kolejno przez `docker build`;
- nie ma pipeline'u Buildx dla `linux/amd64` i `linux/arm64`;
- CI nie publikuje obrazów, SBOM, provenance ani podpisów;
- CI nie ma bramek skanu podatności, sekretów i konfiguracji obrazów;
- nie istnieje automatyczna promocja tego samego digestu między środowiskami.

Istniejące etykiety White-Label w `build-images.sh` są wartościowe, ale nie zastępują
standardowych metadanych OCI.

## Kolejność napraw po audycie

1. Ustalić mierzalne budżety i wspólny kontrakt obrazu.
2. Uszczelnić kontekst builda i ujednolicić wzorzec Node: cache, minimalny artefakt,
   nie-root, sygnały i health contract.
3. Zastosować wzorzec kolejno do Authorization, backendu/workera i LLM gateway.
4. Utwardzić frontend/Nginx oraz świadomie zachować wymagane rozszerzenia obrazów stanowych.
5. Dodać natywny produkcyjny build ze źródeł na hoście instalacji, lokalny SBOM i skany,
   bez wymagania registry oraz runnera GitHub-hosted.
6. Dopiąć produkcyjny Compose do lokalnie zweryfikowanych obrazów i wykonać testy startu,
   migracji, awarii, restartu oraz rollbacku.

Nie ustalono arbitralnego celu procentowego. Krok 2 Fazy 11 ma zdefiniować osobne budżety
dla usług na podstawie tego baseline'u oraz sprawdzić je automatycznie.

## Bramka kroku 1

- [x] zinwentaryzowano wszystkie obrazy i konteksty;
- [x] wszystkie bieżące obrazy zostały zbudowane;
- [x] zapisano rozmiary obrazów i głównych warstw;
- [x] sprawdzono użytkowników, entrypointy, healthchecki i zawartość runtime;
- [x] potwierdzono brak sekretów w finalnych obrazach;
- [x] sklasyfikowano luki i kolejność dalszych prac;
- [x] oddzielono problemy projektu od kosztu obrazów bazowych.

Audyt nie jest skanem CVE ani testem obciążeniowym. Te bramki należą do późniejszych
kroków Fazy 11 i końcowej certyfikacji Fazy 12.
