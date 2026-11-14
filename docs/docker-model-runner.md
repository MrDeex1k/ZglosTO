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

Domyślny lokalny klasyfikator to **Basal 2.0 4,5B Q4_K_M**, pakowany lokalnie jako
`zglosto/basal-2.0-4.5b:q4_k_m`. Jest to testowana konwersja własna, a nie oficjalny
artefakt Q4 autora Basal. Szczegóły pochodzenia i porównanie z Omni:
[plan migracji i benchmark](basal-model-migration.md).

Przed pierwszym uruchomieniem profilu lokalnego przygotuj model:

```bash
./scripts/prepare-basal-dmr.sh
```

Skrypt wymaga Pythona z zależnościami konwertera (torch, transformers, numpy,
sentencepiece, protobuf, safetensors), pobiera przypięte źródła i sprawdza SHA-256.
Na macOS arm64 pobiera również przypięty `llama-quantize`; na innych platformach
podaj `LLAMA_QUANTIZE` z llama.cpp `b11312`. Potrzeba około 30 GB wolnego miejsca
na konwersję. Wynik trafia do ignorowanego `.local-models/` i lokalnego magazynu DMR.
Nie publikujemy go automatycznie w rejestrze. Ten krok wykonuje się na każdym hoście
DMR przed uruchomieniem Compose; samo `docker compose up` nie buduje modelu.

| Parametr                  | Wartość                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| Plik GGUF                 | `basal-2.0-4.5B-Q4_K_M.gguf`                                       |
| SHA-256 pliku             | `b271979c29c71527f357b800fa82ec2e317ae8617f334fb4b96c86a03269465d` |
| Rozmiar pliku             | `2 878 886 368` bajtów                                             |
| Kontekst                  | `4096` tokenów                                                     |
| Odpowiedź                 | jeden token, `logprobs=20`                                         |
| Timeout gateway → DMR     | `5000 ms`                                                          |
| Timeout backend → gateway | `7000 ms`                                                          |
| Pewność Q4                | `null` — bez kalibracji na danych docelowych                       |

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
