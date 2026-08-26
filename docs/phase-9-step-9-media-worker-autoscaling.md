# Faza 9 / krok 9 — autoskalowanie `media_worker`

## Wynik

Krok wdrożono 2026-07-24 dla profili Kubernetes i K3s. Profil Docker Compose pozostaje
statyczny i pozwala operatorowi zmienić liczbę workerów jawnie.

KEDA skaluje Deployment `media-worker` na podstawie liczby wiadomości gotowych w kolejce
RabbitMQ `zglosto.media.process.v1`:

| Backlog | Repliki |
| ------- | ------- |
| `0-3`   | `1`     |
| `4-7`   | `2`     |
| `8-11`  | `3`     |
| `12+`   | `4`     |

Dokładną funkcję `min(floor(backlog / 4) + 1, 4)` realizuje KEDA
`advanced.scalingModifiers`. Złożona metryka ma typ `Value` i cel `1`, dlatego jej wynik
jest żądaną liczbą replik, a nie celem przypadającym na aktualną replikę. Surowy trigger
RabbitMQ zachowuje `AverageValue`, aby awaryjny mechanizm KEDA mógł utrzymać jednego workera,
gdy broker lub metryka są chwilowo niedostępne.

## Bezpieczeństwo i odporność

- KEDA łączy się do RabbitMQ przez istniejący `amqps://`, Secret z URL-em brokera oraz
  certyfikat CA wystawiony przez cert-manager.
- Klastrowy URL używa `rabbitmq.zglosto.svc.cluster.local`, ponieważ operator KEDA działa
  poza namespace aplikacji; SAN certyfikatu obejmuje tę nazwę.
- NetworkPolicy wpuszcza do portu AMQPS `5671` kontrolery z wydzielonego namespace `keda`;
  plugin i listener administracyjny `15672` są wyłączone.
- Każda replika zachowuje `MEDIA_WORKER_PREFETCH=1` i
  `MEDIA_SHARP_CONCURRENCY=1`.
- Skalowanie w górę nie ma okna stabilizacji.
- Skalowanie w dół ma okno `180 s`; po trzech błędach pobrania metryki fallback utrzymuje
  jedną replikę.
- Worker kończy aktywną wiadomość przed wyłączeniem, a manual ACK, rejestr idempotencji,
  retry i DLQ pozostają źródłem bezpieczeństwa przetwarzania.

## Pliki i walidacja

- `k8s/base/autoscaling/media-worker-scaledobject.yaml`;
- `k8s/base/autoscaling/media-worker-trigger-authentication.yaml`;
- `deploy/cluster-autoscaling-contract.json`;
- `scripts/check-cluster-autoscaling.ts`;
- `pnpm check:cluster-autoscaling`.

Walidator renderuje wszystkie warianty Kubernetes/K3s, sprawdza TLS, kolejkę, limity,
stabilizację oraz wartości graniczne. Compose jest dodatkowo sprawdzany pod kątem braku
pozorowanej implementacji KEDA.

## Pozostała certyfikacja

Faza 12 wykonuje pomiary z realnym RabbitMQ, burstem zdjęć i utratą poda/węzła. Może
dostroić zasoby, lecz zmiana progów `0-3`, `4-7`, `8-11`, `12+` wymaga nowej decyzji
architektonicznej i aktualizacji testów kontraktu.
