# Docker Model Runner

## Kontrakt uruchomienia

Podstawowy `docker compose up` nie pobiera ani nie uruchamia modelu. `llm_gateway` działa
wtedy z `LLM_RUNTIME=disabled`, a backend zapisuje zgłoszenie z kontrolowanym fallbackiem.

Inferencję włącza osobny wariant:

```bash
docker compose -f docker-compose.yml -f docker-compose.llm.yml up -d --build
```

Wymagany jest włączony [Docker Model Runner](https://docs.docker.com/ai/model-runner/) oraz
Docker Compose obsługujący top-level `models` (minimum 2.38).

W produkcyjnym selektorze odpowiada temu `LLM_MODE=local`. `LLM_MODE=external` nie
uruchamia DMR: dodaje adapter API zgodnego z OpenAI, izolowaną sieć egress i plik klucza
API montowany wyłącznie do gatewaya. `LLM_MODE=disabled` pozostaje domyślne.

## Przypięta konfiguracja

| Parametr                        | Wartość                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| Model                           | `ai/gemma3-qat:1B-Q4_K_M`                                                 |
| Digest zweryfikowany 2026-07-21 | `sha256:9f84c113e1f1085bddaffad1acb07c90e59487f0c7e25028f1811e71efba9599` |
| Parametry                       | `999.89 M`                                                                |
| Rozmiar artefaktu               | `950.82 MiB`                                                              |
| Kontekst                        | `4096` tokenów                                                            |
| Cache KV K / V                  | `q4_0` / `q4_0`                                                           |
| Temperatura                     | `0.1`                                                                     |
| Maksymalna odpowiedź            | `64` tokeny                                                               |
| Timeout gateway -> DMR          | `5000 ms`                                                                 |
| Timeout backend -> gateway      | `7000 ms`                                                                 |

Wartości KV muszą pozostać osobnymi argumentami listy `runtime_flags`. Zapis
`--cache-type-k=q4_0` jest obecnie błędnie normalizowany przez DMR do `q4-0` i zatrzymuje
llama.cpp. Poprawna postać to `--cache-type-k`, `q4_0`, `--cache-type-v`, `q4_0`.

Compose wstrzykuje `DOCKER_MODEL_RUNNER_URL` jako bazę OpenAI-compatible kończącą się
`/v1/`. Gateway obsługuje tę postać oraz jawny bazowy URL hosta, w którym sam buduje ścieżkę
`/engines/llama.cpp/v1`.

## Zweryfikowany baseline

Test 2026-07-21 wykonano na ARM64 bez użytecznego GPU, z Docker Model Runner server `1.2.6`
i llama.cpp `72874f559`. Model uruchomił się na CPU z kontekstem `4096` i obiema flagami
cache `q4_0`. Po załadowaniu kontener DMR używał około `571 MiB` pamięci; jest to pomiar
orientacyjny, a nie limit produkcyjny.

Próby przez rzeczywisty `llm_gateway` zwróciły:

- zgłoszenie o dziurze w jezdni: `municipal`, około `392 ms`;
- osobę nieprzytomną i nieoddychającą: `emergency`, około `296 ms`.

Te wyniki potwierdzają budżet 5/7 sekund na hoście testowym, lecz nie zastępują końcowych
testów obciążeniowych na sprzęcie docelowym. DMR jest zarządzany przez Dockera poza limitem
zasobów kontenera gatewaya; twarde limity/akcelerację dobiera się na poziomie hosta lub
docelowej platformy wdrożeniowej.

## Zachowanie gatewaya

Gateway używa `POST /v1/chat/completions`, `temperature=0.1`, `stream=false` i prosi o
odpowiedź JSON. Gemma może opakować poprawny obiekt w samą ramkę Markdown `json`; parser
akceptuje wyłącznie surowy JSON albo taką ścisłą ramkę. Proza, brak wymaganych pól i wartości
spoza kontraktu kończą się fallbackiem `invalid_response`.

Readiness używa `GET /v1/models`, normalizuje opcjonalny prefiks `docker.io/` i zwraca `200`
tylko wtedy, gdy przypięty model znajduje się na liście DMR. Niedostępność, timeout lub błędna
odpowiedź modelu nie blokują zapisu zgłoszenia.

Adapter zewnętrzny zachowuje ten sam ścisły parser, temperaturę `0.1`, budżet odpowiedzi
i fallback. Jego readiness odpytuje `GET <LLM_EXTERNAL_URL>/models` z kluczem Bearer
odczytanym podczas startu z `LLM_EXTERNAL_API_KEY_FILE`.
