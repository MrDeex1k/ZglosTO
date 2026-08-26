# Faza 12 — lokalny pomiar CPU i RAM

## Wynik

Pomiar wykonano 2026-07-27 na aktualnym kodzie i obrazach projektu. Jest to podstawa
wstępnego doboru hosta dla wdrożeń Docker Compose. Nie jest to certyfikacja wydajności
produkcyjnego Ubuntu Server.

| Mierzony zestaw                                                                |               Maksimum CPU |    Maksimum RAM kontenerów | Wynik scenariusza |
| ------------------------------------------------------------------------------ | -------------------------: | -------------------------: | ----------------- |
| `minimal`: RustFS local, Redis disabled, observability disabled, lokalny DMR   | `557,56%` = `5,58` rdzenia | `2765,86 MiB` = `2,70 GiB` | PASS              |
| `recommended`: RustFS local, Redis local, observability disabled, LLM disabled | `124,03%` = `1,24` rdzenia |  `921,02 MiB` = `0,90 GiB` | PASS              |
| diagnostyczny observability local, bez prawdziwego DMR                         |  `74,31%` = `0,74` rdzenia | `2404,98 MiB` = `2,35 GiB` | PASS              |

CPU powyżej `100%` jest prawidłowe: `100%` oznacza pełne użycie jednego logicznego
rdzenia, a wynik jest sumą kontenerów działających w tej samej próbce.

Największe zaobserwowane koszty pojedynczych komponentów:

| Komponent                        |               Maksimum CPU |  Maksimum RAM |
| -------------------------------- | -------------------------: | ------------: |
| Docker Model Runner + Gemma 3 1B | `548,08%` = `5,48` rdzenia | `1958,91 MiB` |
| backend                          |                   `56,43%` |  `254,50 MiB` |
| PostgreSQL                       |                   `25,22%` |  `224,50 MiB` |
| RabbitMQ                         |                  `118,06%` |  `196,20 MiB` |
| RustFS                           |                    `6,82%` |  `178,20 MiB` |
| Redis                            |                    `1,86%` |   `58,05 MiB` |
| Grafana                          |                   `44,63%` |  `479,80 MiB` |
| OTel Collector                   |                   `25,57%` |  `370,10 MiB` |
| Prometheus                       |                   `17,03%` |  `201,10 MiB` |
| Loki                             |                    `3,02%` |  `162,80 MiB` |
| Tempo                            |                    `2,36%` |  `123,40 MiB` |
| Alertmanager                     |                   `18,38%` |   `44,72 MiB` |

Maksima komponentów wystąpiły w różnych chwilach i nie wolno ich sumować jako zmierzonego
jednoczesnego szczytu. Wariant z lokalnym LLM i lokalną obserwowalnością nie został
uruchomiony jako jeden profil; jego wymagania są świadomie konserwatywną ekstrapolacją.

## Wstępne wymagania hostów

Poniższe wartości obejmują margines na system operacyjny, Docker Engine, cache systemu
plików, aktualizację, chwilowe skoki oraz lokalny build obrazów. Nie są limitami
pojedynczych kontenerów.

| Konfiguracja Docker Compose                            | Minimum do wspieranego uruchomienia | Zalecany host          |
| ------------------------------------------------------ | ----------------------------------- | ---------------------- |
| LLM disabled/external, observability disabled/external | `2` logiczne CPU, `4 GiB` RAM       | `4` CPU, `8 GiB` RAM   |
| profil `recommended`: jak wyżej + Redis local          | `2` CPU, `4 GiB` RAM                | `4` CPU, `8 GiB` RAM   |
| profil `minimal`: lokalny DMR, observability disabled  | `8` CPU, `8 GiB` RAM                | `12` CPU, `12 GiB` RAM |
| LLM disabled/external + observability local            | `4` CPU, `8 GiB` RAM                | `6` CPU, `12 GiB` RAM  |
| lokalny DMR + observability local                      | `12` CPU, `12 GiB` RAM              | `12` CPU, `16 GiB` RAM |

`external` usuwa koszt lokalnego serwera danej integracji, ale nie usuwa klienta ani
kosztu ruchu po stronie aplikacji. Zewnętrzny OTLP nadal pozostawia lokalny OTel Collector.
RustFS local jest domyślny. Zewnętrzne S3/R2 może zmniejszyć lokalny RAM o koszt procesu
RustFS, lecz nie obniżamy przez to bazowego minimum hosta.

Dla dysku pozostaje konserwatywny punkt startowy `100 GiB` minimum i `150 GiB` zalecane.
Nie wyprowadzamy pojemności ani IOPS z pomiaru CPU/RAM. RustFS, PostgreSQL, RabbitMQ,
backupy oraz lokalne Loki/Tempo/Prometheus wymagają osobnego budżetu zależnego od liczby
zdjęć, retencji i wzrostu danych.

## Metoda

Host pomiarowy:

- macOS `arm64`, OrbStack;
- Docker Engine widział `12` logicznych CPU i `11,74 GiB` RAM;
- próbki `docker stats` były pobierane co `250 ms`;
- testowy `model_runner_stub` był wykluczony, a profil `minimal` mierzył prawdziwy
  `docker-model-runner`.

Obciążenie profili aplikacyjnych:

- publiczny odczyt: `1000` żądań, concurrency `100`;
- zapis zgłoszeń: `20` żądań, concurrency `4`;
- opróżnienie kolejki mediów;
- dla `minimal`: prawdziwa inferencja Gemma 3 1B, p95/max `2814 ms`;
- dla observability: metryki, logi, trace, korelacja oraz awaria i powrót Collectora.

Wyniki wydajnościowe:

| Profil        | Publiczny odczyt p95 | Zapis zgłoszenia p95 | Błędy |
| ------------- | -------------------: | -------------------: | ----: |
| `minimal`     |              `21 ms` |              `68 ms` |   `0` |
| `recommended` |              `46 ms` |              `74 ms` |   `0` |

Surowe raporty są prywatnymi artefaktami roboczymi:

- `.state/phase-12/resources/20260727T191211Z-minimal/resources.json`;
- `.state/phase-12/resources/20260727T191932Z-recommended/resources.json`;
- `.state/phase-12/resources/20260727T192343Z-observability/resources.json`.

Nieudana pierwsza próba profilu `recommended` nie jest użyta w obliczeniach. Wykazała
aktywację rozproszonego rate limitera przez wcześniejsze testy kontraktowe. Izolowany
pomiar zasobów otrzymał własne wyższe limity, aby mierzyć przepustowość, a nie próg
ochrony endpointu.

## Ograniczenia i następna walidacja

- `docker stats` nie obejmuje demona Dockera, BuildKit, pamięci hosta ani pełnego cache
  systemu plików;
- próbkowanie może pominąć skok krótszy niż interwał;
- pomiar ARM64/OrbStack może różnić się od Ubuntu `amd64`;
- test nie był długim soakiem i nie wyznacza wzrostu pamięci ani przestrzeni dyskowej;
- profile external wymagają rzeczywistych providerów;
- pierwszy realny host każdego typu musi przejść load test i obserwację hosta przed
  podpisaniem wdrożenia.

Wymagania są więc oznaczone jako `local-measured-provisional`. Mogą zostać podniesione po
pierwszym wdrożeniu Ubuntu/x86, ale nie powinny być obniżane wyłącznie na podstawie krótkiego
lokalnego testu.
