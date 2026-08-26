# Faza 11 / krok 10 — lokalne obrazy i moduły produkcyjnego Compose

## Status

Krok **wdrożono 2026-07-26**. Faza 11 została później zakończona w `14/14`. Produkcyjny Compose
korzysta wyłącznie z ośmiu lokalnych obrazów zweryfikowanych w kroku 9, domyślnie
uruchamia RustFS i składa dokładnie jeden wariant każdego opcjonalnego modułu.

Maszynowym źródłem prawdy jest
[`deploy/production-compose-modules.json`](../deploy/production-compose-modules.json).
Walidator renderuje wszystkie `2 × 3 × 3 × 3 = 54` wspierane kombinacje.

## Źródło obrazów

`pnpm build:production` zapisuje:

- `.state/production-build/candidate/images.env` — osiem niezmiennych lokalnych
  referencji `wersja-architektura-revision`;
- `.state/production-build/candidate/manifest.json` — odpowiadające im ID obrazów,
  commit, platformę i raporty supply chain.

`scripts/production-compose.sh` przekazuje publiczny plik konfiguracji jako pierwszy
`--env-file`, a wygenerowany `images.env` jako drugi. Zmienne obrazów odziedziczone
z powłoki są usuwane przed wywołaniem Compose, więc nie mogą podmienić zweryfikowanego
zestawu. Walidacja porównuje `images.env` z manifestem oraz ID rzeczywistych lokalnych
obrazów. Usługi ZgłosTO mają `pull_policy: never`; nie wymagają registry i nie mogą zostać
niejawnie pobrane z Internetu.

## Selektor modułów

| Obszar         | Zmienna               | Tryby                           | Domyślny   |
| -------------- | --------------------- | ------------------------------- | ---------- |
| Object Storage | `OBJECT_STORAGE_MODE` | `local`, `external`             | `local`    |
| Redis          | `REDIS_MODE`          | `disabled`, `local`, `external` | `disabled` |
| Observability  | `OBSERVABILITY_MODE`  | `disabled`, `local`, `external` | `disabled` |
| LLM            | `LLM_MODE`            | `disabled`, `local`, `external` | `disabled` |

Tryb `both` nie istnieje. Wybór modułu zmienia wyłącznie zestaw nakładek Compose; nie
uruchamia ponownego builda aplikacji.

### Object Storage

- `local` dodaje przypięty RustFS, trwały wolumen `rustfs-data`, wewnętrzny endpoint
  `http://rustfs:9000` i oczekiwanie backendu/workera na readiness;
- RustFS korzysta z natywnych `RUSTFS_ACCESS_KEY_FILE` i
  `RUSTFS_SECRET_KEY_FILE`, więc poświadczenia nie są wartościami ENV;
- `external` nie uruchamia RustFS, zachowuje provider-neutralne `S3_*` i dodaje
  backendowi oraz workerowi dedykowaną sieć egress do S3/R2.

Object Storage nigdy nie ma trybu `disabled`, ponieważ zapis i przetwarzanie zdjęć
wymagają działającego bucketu.

### Redis i obserwowalność

Istniejące nakładki Fazy 9/10 zostały włączone do selektora. `external` Redis daje egress
wyłącznie Authorization i backendowi. Zewnętrzna obserwowalność kieruje aplikacje do
lokalnego Collectora, a tylko Collector otrzymuje sieć egress oraz plik autoryzacji.
`disabled` wyłącza Redis, ale nie wyłącza lokalnego rate limitingu.

### LLM

- `disabled` zachowuje bezpieczny fallback gatewaya;
- `local` włącza Docker Model Runner z Gemma 3 1B i ustalonymi parametrami;
- `external` uruchamia nowy adapter `openai-compatible`. URL i model są publiczną
  konfiguracją, a klucz API jest montowany wyłącznie do `llm_gateway` jako plik.

Backend nadal zna tylko `llm_gateway`; nie zna DMR ani zewnętrznego providera.
Niedostępność obu providerów zachowuje dotychczasowy nieblokujący fallback.

## Obsługa operatora

Domyślna walidacja po buildzie:

```bash
pnpm build:production -- --version <dokładny-tag-git>
cp .env.production.example /etc/zglosto/production.env
PRODUCTION_ENV_FILE=/etc/zglosto/production.env \
  ./scripts/production-compose.sh validate
```

Domyślna ścieżka `images.env` to kandydat z kroku 9. Można ją wskazać jawnie przez
`PRODUCTION_IMAGES_ENV_FILE`, a manifest przez `PRODUCTION_BUILD_MANIFEST_FILE`.
Po udanym deployu publiczna konfiguracja, `images.env` i manifest są kopiowane do katalogu
stanu jako bieżące wydanie. Poprzednie obrazy nie są utrzymywane: rollback wymaga builda
dokładnego wcześniejszego tagu Git i ponownego deployu, bez automatycznego cofania migracji.

Polecenie `pull` pobiera wyłącznie włączone komponenty zewnętrzne, na przykład RustFS,
Redis lub lokalny stos observability. Nigdy nie próbuje pobierać obrazów ZgłosTO.

## Walidacja

`pnpm check:production-compose` sprawdza wszystkie 54 kombinacje, w tym:

- dokładny zestaw usług i nakładek;
- zgodność lokalnych obrazów z `images.env`;
- `pull_policy: never` i brak sekcji `build` dla usług ZgłosTO;
- obecność RustFS w domyślnej paczce i jego brak w `external`;
- izolowane sieci egress dla zewnętrznego S3, Redis, OTLP i LLM;
- brak sekretów jako jawnych wartości środowiskowych;
- prawidłowy runtime LLM i plik klucza zewnętrznego providera;
- dotychczasowe limity i hardening rdzenia produkcyjnego.

Kroki 11–14 domknęły hardening opcjonalnych kontenerów i hosta, procedurę
`build -> validate -> backup -> migrate -> wait -> smoke -> promote`, lokalne bramki,
[runbook Compose](production-compose-runbook.md) oraz
[handoff do K3s](k3s-local-images-handoff.md).
