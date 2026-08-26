# Faza 11 / krok 9 — produkcyjny build ze źródeł

## Status

Krok **wdrożono 2026-07-26**. Po jego wdrożeniu Faza 11 była ukończona w `9/14`;
po wdrożeniu kroku 10. Faza 11 została następnie zakończona w `14/14`. Czysty,
oznaczony checkout
zbudował natywnie wszystkie osiem obrazów na `linux/arm64`, wygenerował SBOM-y i raporty
Trivy, przeszedł docelowy kontrakt obrazów oraz zapisał manifest kandydata bez publikacji
i deploymentu.

Maszynowym źródłem prawdy jest
[`deploy/production-source-build.json`](../deploy/production-source-build.json), a
wejściem operatora [`scripts/production-build.sh`](../scripts/production-build.sh).

## Zmiana względem poprzedniego planu

Na obecnym etapie projektu nie publikujemy własnych obrazów ZgłosTO do GHCR ani innego
centralnego registry i nie budujemy wieloarchitekturowych manifestów. Nie korzystamy też
z runnerów GitHub-hosted. Self-hosted runner może wrócić dopiero wtedy, gdy rzeczywiście
powstanie i będzie utrzymywany.

Operator pobiera oznaczone źródła, a host docelowy buduje obrazy natywnie dla swojej
architektury:

- serwer `amd64/x86_64` buduje obrazy `linux/amd64`;
- Raspberry Pi 5 lub inny host ARM64 buduje obrazy `linux/arm64`;
- nie wymagamy emulacji QEMU ani budowania obu architektur na jednym urządzeniu;
- Kubernetes pozostaje zamrożonym wariantem przyszłościowym;
- Docker Compose jest profilem głównym, a K3s profilem opcjonalnym rozwijanym po
  ustabilizowaniu Compose.

## Ustalony podział obrazów i kontenerów

Ze źródeł repozytorium budujemy osiem unikalnych obrazów:

1. `authorization`;
2. `backend`, używany przez dwa kontenery: `backend` i `media_worker`;
3. `llm_gateway`;
4. `frontend`;
5. `nginx`;
6. `database`;
7. `pgbouncer`;
8. `rabbitmq`.

RustFS, Redis, Docker Model Runner oraz elementy obserwowalności są przypiętymi
komponentami zewnętrznymi. Są pobierane, a nie budowane z kodu ZgłosTO.

Domyślna paczka Compose ma dziesięć kontenerów: dziewięć kontenerów korzystających
z ośmiu własnych obrazów oraz lokalny RustFS.

## Ustalona macierz modułów

Wybór modułów jest konfiguracją instalacji i uruchomienia, a nie osobnym buildem aplikacji.
Zmiana trybu Redis, obserwowalności, LLM albo Object Storage nie może wymagać ponownej
kompilacji kodu ZgłosTO.

| Obszar         | Wspierane tryby                                 | Domyślny tryb |
| -------------- | ----------------------------------------------- | ------------- |
| Object Storage | `local` — RustFS; `external` — S3/R2 bez RustFS | `local`       |
| Redis          | `disabled`, `local`, `external`                 | `disabled`    |
| Observability  | `disabled`, `local`, `external`                 | `disabled`    |
| LLM            | `disabled`, `local`, `external`                 | `disabled`    |

Tryb `both` nie istnieje. `Object Storage = external` nie oznacza pracy bez magazynu
obiektowego. Wymaga działającego bucketu zgodnego z S3, kompletu `S3_*` i pozytywnego
fail-fast/readiness. Kod aplikacyjny pozostaje provider-neutralny.

## Wdrożony zakres kroku 9

1. Dodano jeden skrypt lokalnego builda produkcyjnego dla wszystkich ośmiu artefaktów.
2. Wymagane są Docker Engine, Docker Compose v2, BuildKit i Trivy 0.72.0; preflight
   sprawdza architekturę, wolne
   miejsce i podstawowe wymagania hosta przed rozpoczęciem kosztownego builda.
3. Build używa wyłącznie natywnej platformy hosta przez Buildx `--load`, bez `push`,
   registry, QEMU i wspieranej flagi cross-build.
4. Obrazy otrzymują lokalne, niezmienne oznaczenie
   `wersja-architektura-revision`. Brudne drzewo oraz wersja, która nie jest dokładnym
   tagiem Git bieżącego commita, są odrzucane.
5. Maszynowy manifest zapisuje commit, wersję, architekturę, czas, ID/digest lokalnych
   obrazów, checksum White-Label oraz wersje pobranych komponentów zewnętrznych. Obrazy
   nie otrzymują obecnie etykiet; wrócą one dopiero razem z rzeczywistym CI/CD i publikacją.
6. Skrypt uruchamia istniejącą bramkę `pnpm check:images:target` z jawnymi referencjami
   wszystkich zbudowanych obrazów.
7. Trivy generuje CycloneDX dla każdego obrazu, skanuje źródła pod kątem sekretów oraz
   blokuje naprawialne podatności `CRITICAL`. Wyjątki muszą być ograniczone ścieżką,
   uzasadnione i wygasające. Bieżący wyjątek upstreamowego `gosu` z PostgreSQL 18.6 wygasa
   2026-08-26.
8. Powstają `candidate/manifest.json` oraz `candidate/images.env`, dzięki którym krok 10
   użyje
   dokładnie lokalnie zweryfikowanych obrazów, a nie nazw z publicznego registry.
9. Skrypt nie uruchamia wdrożenia ani migracji. Build jest oddzielony od
   operacji `backup -> migrate -> up -> smoke`.
10. Historyczny workflow GitHub-hosted został usunięty. Wszystkie bramki Fazy 9 pozostają
    wykonywalne lokalnie; konfigurację self-hosted dodamy dopiero razem z rzeczywistym
    runnerem.

## Granica między krokiem 9 i 10

Krok 9 kończy się zweryfikowanymi lokalnymi obrazami i manifestem artefaktów. Krok 10
[wdrożono 2026-07-26](phase-11-step-10-production-compose-modules.md):

- RustFS jest składnikiem domyślnego profilu produkcyjnego;
- wariant `external` jawnie usuwa RustFS i wymaga zewnętrznego S3/R2;
- Redis, observability i LLM mają niezależne tryby `disabled/local/external`;
- produkcyjny Compose korzysta z lokalnego `images.env` i nie wymaga registry.

`docker-compose.yml` i produkcyjny selektor mają teraz ten sam domyślny wybór RustFS,
przy zachowaniu odrębnego hardeningu i obsługi sekretów produkcyjnych.

## Ustalenia zamknięte

- Compose jest pierwszym i głównym profilem produkcyjnym.
- K3s jest opcjonalnym następnym profilem; rozbudowany Kubernetes nie blokuje wydania dla
  małych gmin i miast.
- Instalacja buduje kod ZgłosTO na serwerze klienta.
- Każda architektura buduje własne obrazy natywne.
- Nie używamy obecnie centralnego registry ani GitHub-hosted runners.
- RustFS jest domyślnym lokalnym Object Storage i dopiero jawny tryb `external` go usuwa.
- Redis i obserwowalność są opcjonalne, a ich domyślne tryby to `disabled`.
- LLM jest opcjonalny i domyślnie `disabled`.
- `backend` i `media_worker` pozostają dwoma procesami/kontenerami z jednego obrazu.
- Zewnętrzne komponenty są pobierane w przypiętych wersjach, nie budowane w repozytorium.
- Trivy jest lokalnym narzędziem do SBOM oraz skanowania obrazów, podatności i sekretów.
- W stanie ustalonym host przechowuje wyłącznie obrazy aktywnego wydania, bez poprzednich
  wersji. Podczas wdrożenia dotychczasowe obrazy mogą istnieć tymczasowo do chwili
  pozytywnego smoke testu i promocji nowej wersji, po czym są usuwane.
- Rollback po zakończonej promocji wymaga ponownego builda z oznaczonego źródła poprzedniej
  wersji. Migracje bazy pozostają jednokierunkowe i nie są automatycznie cofane.

## Decyzje pozostawione następnym krokom

- Krok 9 przyjmuje minimalny preflight `2 CPU`, `4 GiB RAM` i `15 GB` wolnego miejsca.
  Są to wymagania samego builda, nie gwarancja przepustowości runtime; finalne profile
  sprzętowe wyznaczą load testy.
- Interfejs operatora ma już komendy `validate` i `build`. Krok 10 dołączy wybór modułów,
  a dalsza automatyzacja doda `deploy`, `rollback`, `backup` i `restore`.
- Transport lokalnych obrazów do opcjonalnego K3s — OCI import albo prywatne registry
  instalacji — pozostaje późniejszą decyzją i nie blokuje produkcyjnego Compose.

## Kryteria ukończenia

Kryteria spełniono na czystym tagu testowym `linux/arm64`: osiem obrazów, osiem SBOM-ów,
osiem raportów podatności, raport sekretów repozytorium, docelowy kontrakt obrazów,
`manifest.json` i `images.env`. Build nie wymagał konta w registry, GitHub Actions ani
sekretów zewnętrznej usługi i nie wykonał deploymentu ani migracji.

Komendy operatora:

```bash
pnpm validate:production-build -- --version <dokładny-tag-git>
pnpm build:production -- --version <dokładny-tag-git>
```
