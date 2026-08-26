# Faza 12 — lokalny preflight 2026-07-26

Lokalny preflight automatyzacji zakończył się powodzeniem. Nie jest certyfikacją
produkcyjną: wykonano go na macOS `arm64` z OrbStack, a kontrakt wymaga natywnego Ubuntu
Server `amd64`.

2026-07-27 preflight rozszerzono o powtarzalny
[pomiar CPU i RAM](phase-12-local-resource-sizing.md). Zmierzone szczyty to `5,58` rdzenia
i `2,70 GiB` pamięci kontenerów dla profilu z lokalnym DMR, `1,24` rdzenia i `0,90 GiB`
dla profilu z lokalnym Redis oraz `0,74` rdzenia i `2,35 GiB` dla pełnego lokalnego stosu
observability bez prawdziwego DMR. Na tej podstawie powstały wstępne wymagania per
konfiguracja.

## Wyniki

| Bramka                              | Wynik | Najważniejszy pomiar                                                         |
| ----------------------------------- | ----- | ---------------------------------------------------------------------------- |
| profil `minimal`                    | PASS  | pełny kontrakt, TLS/mTLS, kolejki, obrazy i destrukcyjny restore             |
| profil `recommended`                | PASS  | dodatkowo awaria/powrót lokalnego Redisa i cache współdzielony               |
| realny DMR + Gemma 3 1B             | PASS  | 5 próbek, p95/max `2879 ms`, budżet `5000 ms`                                |
| public-read                         | PASS  | 1000 żądań, concurrency 100, p95 `22 ms`, 0 błędów                           |
| incident-write + media              | PASS  | 20/20 odpowiedzi `201`, concurrency 4, p95 `102 ms`, kolejka opróżniona      |
| lokalny observability diagnostic    | PASS  | 27 trace IDs w logach, 26 w Tempo, 22 skorelowane; awaria Collectora łagodna |
| reguły Prometheusa / dashboard JSON | PASS  | `promtool`: 12 poprawnych reguł                                              |

Testy integracyjne objęły PostgreSQL/pgBackRest, PgBouncera, RustFS przez neutralny S3,
RabbitMQ/outbox/retry/DLQ, `media_worker`/Sharp/WebP, Authorization/Better Auth, fallback
LLM, cache, role, OpenAPI, graceful shutdown, TLS 1.3 oraz mTLS. Backup został celowo
odtworzony po utracie rekordów bazy i obiektu.

Pierwszy test profilu Redis wykrył zanieczyszczenie 30-sekundowego microcache Nginx przez
samą sondę awarii. Sonda została przeniesiona na prywatną granicę backendu; profil po
poprawce przeszedł. Bramka load początkowo próbowała użyć nieistniejącego publicznego
endpointu klasyfikacji. Test usunięto, zachowując właściwą izolację: backend → gateway jest
pokryty zapisami zgłoszeń, a realny DMR ma osobną prywatną bramkę.

## Dowody prywatne

Raporty znajdują się w `.state/phase-12/` i nie są commitowane:

- `20260726T204256Z/integration-disabled.log`;
- `20260726T204920Z/integration-local.log`;
- `20260726T211119Z/integration-load.log` i raporty load;
- `20260726T210752Z/observability-local.json`;
- `20260726T211355Z/dmr.json`;
- `20260726T211021Z/host.json`.

## Co nadal blokuje zamknięcie

- walidacja odpowiedniego wariantu wymagań z
  [lokalnego sizingu](phase-12-local-resource-sizing.md) na pierwszym rzeczywistym hoście
  Ubuntu Server `amd64`; osobny host referencyjny nie jest obecnie dostępny;
- czysty tag Git, produkcyjne sekrety i osiem finalnych obrazów;
- prawdziwy DNS, publiczny certyfikat i HSTS;
- backup zaszyfrowany poza hostem oraz restore z tego miejsca;
- upgrade, uszkodzony kandydat, odzyskanie bieżącego tagu, restart hosta i rotacja PKI;
- godzinny soak, pomiar RPO/RTO i strojenie na hoście referencyjnym;
- podpis operatora;
- opcjonalnie K3s dopiero po podpisaniu Compose;
- profile external dopiero po dostarczeniu rzeczywistych usług.
