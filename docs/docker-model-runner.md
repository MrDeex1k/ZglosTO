# Docker Model Runner

## Kontrakt uruchomienia

Podstawowy `docker compose up` nie pobiera ani nie uruchamia modelu. `llm_gateway` działa
wtedy z `LLM_RUNTIME=disabled`, a backend zapisuje zgłoszenie z kontrolowanym fallbackiem.

Inferencję włącza osobny wariant:

```bash
docker compose -f docker-compose.yml -f docker-compose.llm.yml -f docker-compose.redis.local.yml up -d --build
```

Wymagany jest włączony [Docker Model Runner](https://docs.docker.com/ai/model-runner/) oraz
Docker Compose obsługujący top-level `models` (minimum 2.38).

W produkcyjnym selektorze odpowiada temu `LLM_MODE=local`. `LLM_MODE=external` nie
uruchamia DMR: dodaje adapter API zgodnego z OpenAI, izolowaną sieć egress i plik klucza
API montowany wyłącznie do gatewaya. `LLM_MODE=disabled` pozostaje domyślne.

## Przypięta konfiguracja

Domyślny lokalny klasyfikator to **Basal 2.0 Mini 1,5B Q5_K_M**, pakowany jako
`zglosto/basal-2.0-mini:q5_k_m`. Pobieramy oficjalny plik autora bez konwersji.
Rewizja Hugging Face: `9926cd8a62e7e65cba57aaab51d56c18b38f0a6b` z repozytorium
`Remek/basal-2.0-mini-GGUF`. Historia testów Q4 i aktualny pomiar Mini Q5:
[plan migracji i benchmark](basal-model-migration.md).

Przed pierwszym uruchomieniem profilu lokalnego przygotuj model:

```bash
./scripts/prepare-basal-dmr.sh
```

Skrypt wymaga Docker Model Runner, curl i narzędzia SHA-256. Pobiera przypięty
oficjalny GGUF, sprawdza sumę i rozmiar, a następnie pakuje go lokalnie. Nie wymaga
Pythona, wag BF16 ani konwertera. Plik zajmuje 1,17 GB; na pobranie i kopię w DMR
potrzeba około 2,4 GB wolnego miejsca. Cache jest w ignorowanym `.local-models/`.
Przygotowanie wykonuje się na każdym hoście DMR przed uruchomieniem Compose.
Skrypt nie publikuje modelu w rejestrze.

| Parametr                  | Wartość                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| Plik GGUF                 | `basal-2.0-mini-Q5_K_M.gguf`                                       |
| SHA-256 pliku             | `9865d535e7497f5195a17292808d50969757ab390a5e8fbda5e9c17a3361f0b5` |
| Rozmiar pliku             | `1 168 136 320` bajtów                                             |
| Kontekst                  | `4096` tokenów                                                     |
| Odpowiedź                 | jeden token, `logprobs=100`                                        |
| Timeout gateway → DMR     | `5000 ms`                                                          |
| Timeout backend → gateway | `7000 ms`                                                          |
| Pewność klasyfikatora     | `null` — bez kalibracji na danych docelowych                       |

Usunięto parametry `DOCKER_MODEL_RUNNER_TEMPERATURE` i
`DOCKER_MODEL_RUNNER_MAX_TOKENS`: protokół Basal ustala pojedynczy odczyt logitów,
bez filtrowania rozkładu próbkowaniem. Nie przenosimy dawnych flag cache KV Gemmy
na nowy model. Rozmiary i pomiary Gemmy w historycznych dokumentach Fazy 12 pozostają
archiwalnym baseline'em, nie dowodem wydajności Basal.

## Zachowanie gatewaya

Gateway używa `POST /v1/completions`, dokładnego szablonu Basal i prefillu odpowiedzi.
Wybiera klasę z logprobs A/B, ignorując wylosowany token. Obie skończone wartości są
wymagane; brak którejkolwiek kończy się `invalid_response`. Tokeny specjalne w opisie
mieszkańca są neutralizowane zgodnie z protokołem autora. Serwer dodaje BOS, więc
wysyłany tekst pomija pojedynczy początkowy BOS szablonu.

Readiness używa `GET /v1/models`, normalizuje opcjonalny prefiks `docker.io/` i zwraca
`200` tylko wtedy, gdy skonfigurowany model jest na liście. Niedostępność, timeout
lub błędna odpowiedź nie blokują zapisu zgłoszenia.

Compose wstrzykuje bazę OpenAI-compatible kończącą się `/v1/`. Obsługiwany jest też
jawny URL hosta, dla którego gateway buduje `/engines/llama.cpp/v1`.

Adapter zewnętrzny nadal używa `chat/completions` i ścisłego JSON-a, temperatury `0.1`
oraz dotychczasowego budżetu odpowiedzi. Jego readiness odpytuje `/models` z kluczem
Bearer z montowanego pliku. Nie przełącza się automatycznie na protokół Basal.

## Ochrona replay po audycie bezpieczeństwa

Aktywny lokalny lub zewnętrzny LLM wymaga profilu Redis; bez wspólnego magazynu
nonce gateway odmawia klasyfikacji i gotowości. Nowa generacja Redis wymaga
kwarantanny 61s, a healthcheck gatewaya daje na nią 75s okresu startowego.
LLM disabled pozostaje dostępny bez Redis. Lokalny Redis używa noeviction,
ponieważ usunięcie żywego nonce przez LRU pozwalałoby ponowić podpisane żądanie.
Test integracyjny używa aktywnego stubu modelu i domyślnie lokalnego Redis.
Przed uruchomieniem profilu lokalnego ustaw pliki ACL, URL Redis i klucza HMAC
zgodnie z dokumentacją profili; przykład polecenia nie generuje sekretów.
