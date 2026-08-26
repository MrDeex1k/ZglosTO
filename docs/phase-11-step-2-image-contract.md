# Faza 11 / krok 2 — kontrakt i budżety obrazów

## Status

Krok wykonano 2026-07-26. Po wdrożeniu obrazów z kroków 3–8 oraz produkcyjnego builda
ze źródeł z kroku 9 i modułowego Compose z kroku 10. Faza 11 została następnie
zakończona w `14/14`; podsumowanie znajduje się w
[phase-11-completion.md](phase-11-completion.md).

Źródłem prawdy jest maszynowy
[`deploy/image-production-contract.json`](../deploy/image-production-contract.json).
Snapshot pomiarów z kroku 1 znajduje się w
[`deploy/image-audit-baseline.json`](../deploy/image-audit-baseline.json), a walidację
wykonuje [`scripts/check-image-contract.ts`](../scripts/check-image-contract.ts).

## Cel

Kontrakt oddziela:

- bieżącą bramkę antyregresyjną, która może działać jeszcze przed optymalizacją;
- docelową bramkę produkcyjną wymaganą do zamknięcia Fazy 11;
- pomiary zależne od platformy, takie jak czas budowania;
- wspólne wymagania bezpieczeństwa niezależne od wybranego profilu wdrożeniowego.

Docker Compose, Kubernetes i K3s mają używać tych samych artefaktów i digestów. Kontrakt
został dlatego podłączony do wspólnego `deploy/deployment-baseline.json`.

## Budżety rozmiaru

Rozmiar jest wartością `Size` zwracaną przez `docker image inspect`, w bajtach. Baseline
pochodzi z lokalnego builda `linux/arm64` w OrbStack.

| Artefakt                   | Baseline | Bramka baseline | Cel produkcyjny |
| -------------------------- | -------: | --------------: | --------------: |
| `authorization`            | 332,0 MB |        348,6 MB |          260 MB |
| `backend` / `media_worker` | 297,9 MB |        312,8 MB |          275 MB |
| `llm_gateway`              | 236,3 MB |        248,1 MB |          205 MB |
| `frontend`                 |  62,9 MB |         66,1 MB |           65 MB |
| `database`                 | 483,3 MB |        507,5 MB |          490 MB |
| `pgbouncer`                |  17,6 MB |         18,5 MB |           20 MB |
| `rabbitmq`                 | 168,6 MB |        177,0 MB |          175 MB |
| `nginx`                    |  61,8 MB |         64,9 MB |           65 MB |

Bramka baseline dopuszcza maksymalnie 5% narzutu względem audytu. Nie jest celem
optymalizacyjnym — ma od razu blokować niekontrolowane powiększanie obrazów. Cele
produkcyjne są osobne:

- obrazy Node muszą faktycznie zmaleć;
- frontend i infrastruktura dostają mały margines na poprawki bezpieczeństwa;
- PostgreSQL nie jest sztucznie odchudzany kosztem `pgBackRest` lub wymaganych rozszerzeń.

Backend i `media_worker` są jednym artefaktem, dlatego mają jeden budżet. Osobne budżety
mogłyby sugerować nieistniejące rozdzielenie obrazów.

## Budżety czasu builda

Czas jest czasem ściennym. Porównywalna bramka CI używa referencyjnego runnera:

- 4 vCPU;
- 8 GiB RAM;
- lokalny SSD;
- BuildKit;
- osobny pomiar bez cache i z rozgrzanym cache.

| Artefakt                   | Cold build | Warm build |
| -------------------------- | ---------: | ---------: |
| `authorization`            |      360 s |       90 s |
| `backend` / `media_worker` |      420 s |      120 s |
| `llm_gateway`              |      300 s |       90 s |
| `frontend`                 |      360 s |       90 s |
| `database`                 |      240 s |       60 s |
| `pgbouncer`                |      120 s |       30 s |
| `rabbitmq`                 |      120 s |       30 s |
| `nginx`                    |      120 s |       30 s |

Przy równoległym buildzie całego zestawu obowiązuje maksymalnie:

- 900 sekund bez cache;
- 240 sekund z rozgrzanym cache.

Definicje są walidowane maszynowo. Krok 9 egzekwuje konserwatywne budżety cold-build dla
każdego artefaktu i 900 sekund dla całego zestawu na hoście spełniającym minimalny
preflight. Budżety warm-build pozostają pomiarem diagnostycznym, ponieważ automatyczne
rozróżnienie stanu cache na obcym hoście nie jest wiarygodne. Finalne profile sprzętowe
potwierdzą testy wydajności.

## Kontrakt zawartości runtime

### Wymagane do zamknięcia Fazy 11

- procesy `authorization`, `backend`, `media_worker` i `llm_gateway` działają jako
  jawnie skonfigurowany użytkownik nie-root;
- frontend i publiczny Nginx przechodzą na wariant unprivileged, jeżeli testy routingu
  i zapisu plików tymczasowych to potwierdzą;
- root w obrazach stanowych jest dopuszczalny wyłącznie dla minimalnego initu, po którym
  właściwy proces działa jako `postgres` albo `rabbitmq`;
- sekrety, klucze prywatne, `.env` i katalogi `secret*` nie występują w warstwach;
- własny runtime Node nie zawiera `src/`, testów, Dockerfile, README, lockfile, `tsconfig`,
  plików `.ts`, `.tsx` ani source map;
- produkcyjna referencja ma lokalny format
  `zglosto/repository:wersja-architektura-revision`;
- manifest zapisuje natywną platformę `linux/amd64` albo `linux/arm64`;
- metadane wydania (`created`, `revision`, `source`, `version`) zapisuje manifest lokalnego
  builda; etykiety obrazów wrócą dopiero razem z rzeczywistym CI/CD i publikacją;
- graceful shutdown oraz platformowy healthcheck są obowiązkowe;
- root filesystem jest read-only wszędzie, gdzie charakter usługi na to pozwala.

Zależności w `node_modules` są oddzielone od audytu własnego artefaktu. Biblioteka może
legalnie publikować własne typy lub source mapy; bramka zabrania ich w kodzie aplikacji,
ale nie usuwa automatycznie plików z paczek zewnętrznych.

### Healthcheck

Readiness/liveness w Compose i manifestach klastrowych pozostają źródłem prawdy, ponieważ:

- wymagają zamontowanych certyfikatów i sprawdzają rzeczywiste zależności;
- jeden obraz backendu uruchamia dwie różne komendy: API i worker;
- profile `disabled`, `local` i `external` mają różne zależności.

Dockerfile może dostać bezpieczny lokalny `HEALTHCHECK`, jeżeli nie dubluje błędnie logiki
platformowej. Nie zastępuje on sond Compose/Kubernetes/K3s.

## Dwa tryby egzekwowania

### `baseline`

Aktywny od kroku 2 i podłączony do `pnpm check:source`:

- waliduje kompletność oraz spójność kontraktu i snapshotu;
- blokuje zmianę rozmiaru większą niż 5%;
- blokuje wykryte ścieżki sekretów;
- nie udaje, że obecne obrazy spełniają już wymagania końcowe.

### `target`

Jest bramką końcową uruchamianą na rzeczywistych obrazach:

- egzekwuje docelowy rozmiar;
- wymaga użytkownika nie-root dla aplikacji;
- odrzuca własne źródła i artefakty buildowe;
- odrzuca ścieżki mogące zawierać sekrety.

Po modernizacji kroków 3–8 bramka przechodzi dla wszystkich lokalnych obrazów. Krok 9
dołącza ją do produkcyjnego builda wykonywanego ze źródeł na hoście docelowym, aby
sprawdzać dokładnie obrazy używane przez daną instalację. Bieżąca strategia nie wymaga
publikacji do registry ani runnera GitHub-hosted.

## Komendy

Walidacja kontraktu bez wymaganego Dockera:

```bash
pnpm check:image-contract
```

Sprawdzenie lokalnie zbudowanych obrazów względem baseline:

```bash
pnpm check:images:local
```

Sprawdzenie gotowości docelowej:

```bash
pnpm check:images:target
```

Inny kontekst Docker albo referencję obrazu można podać bez zmiany kontraktu:

```bash
node scripts/check-image-contract.ts \
  --inspect \
  --mode baseline \
  --context orbstack \
  --image authorization=zglosto/authorization:v1.0.0-arm64-0123456789ab
```

## Bramka kroku 2

- [x] zapisano baseline w formacie maszynowym;
- [x] ustalono budżety rozmiaru dla każdego unikalnego artefaktu;
- [x] ustalono cold/warm build budgets i referencyjne środowisko pomiaru;
- [x] zdefiniowano kontrakt użytkownika, zawartości runtime, sekretów i platform;
- [x] oddzielono bieżącą ochronę przed regresją od docelowej bramki produkcyjnej;
- [x] dodano walidator kontraktu i rzeczywistych lokalnych obrazów;
- [x] podłączono statyczną bramkę do `pnpm check:source`;
- [x] powiązano kontrakt ze wspólnym baseline'em Compose/Kubernetes/K3s.

Realizację wspólnego wzorca oraz wyniki zawiera dokument
[kroki 3–8 — obrazy runtime](phase-11-steps-3-8-runtime-images.md).
