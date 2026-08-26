# Runbook Redis — cache, rate limiting i kontrolowana degradacja

## Zakres

Redis jest opcjonalnym magazynem odtwarzalnego stanu. Przechowuje współdzielone liczniki
rate limitingu, cache publicznej listy incydentów i krótkie dzierżawy chroniące przed
stampede. Nie przechowuje sesji Better Auth, danych domenowych ani zadań RabbitMQ i nie
jest objęty backupem danych biznesowych.

Obsługiwane są dokładnie trzy tryby:

| Tryb       | Zastosowanie                                                   |
| ---------- | -------------------------------------------------------------- |
| `disabled` | pojedynczy, mały Compose; lokalne limitery pozostają aktywne   |
| `local`    | prywatny Redis dostarczany razem ze ZgłosTO                    |
| `external` | zarządzany Redis wskazany przez zweryfikowane `rediss://` i CA |

Zmiana trybu jest zmianą deploymentu. Wymaga podmiany konfiguracji i kontrolowanego
restartu Authorization oraz backendu; nie wykonuje się jej dynamicznie w działającym
procesie.

## Wymagane sekrety

Tryby `local` i `external` wymagają:

- pełnego URL-a Redis z nazwą użytkownika i hasłem;
- niezależnego, losowego klucza HMAC o długości co najmniej 32 bajtów;
- w `external` także zaufanego CA dla `rediss://`.

Tryb `local` wymaga ACL ograniczającego użytkownika aplikacyjnego do
`<REDIS_KEY_PREFIX>:*` i potrzebnych kategorii komend. Użytkownik `default` musi być
wyłączony. Healthchecki Compose, Kubernetes i K3s uwierzytelniają się URL-em zamontowanym
jako plik Secret; hasło nie znajduje się w definicji probe ani w argumentach procesu
aplikacji.

Sekret URL-a i plik ACL muszą opisywać tę samą nazwę użytkownika oraz hasło. Nie należy
używać klucza HMAC jako hasła Redis.

## Uruchomienie i walidacja profilu

Docker Compose:

```bash
# bez Redisa
docker compose up -d

# lokalny Redis
docker compose \
  -f docker-compose.yml \
  -f docker-compose.redis.local.yml up -d

# Redis zewnętrzny
docker compose \
  -f docker-compose.yml \
  -f docker-compose.redis.external.yml up -d
```

Kubernetes lub K3s:

```bash
kubectl apply -k k8s/overlays/kubernetes-redis-local
kubectl apply -k k8s/overlays/kubernetes-redis-external
kubectl apply -k k8s/overlays/k3s-redis-local
kubectl apply -k k8s/overlays/k3s-redis-external
```

Przed wdrożeniem konfigurację sprawdzają:

```bash
pnpm check:redis
pnpm check:redis-resilience
```

## Readiness i interpretacja stanu

Backend udostępnia publicznie:

```bash
curl --fail http://localhost:1235/api/health/ready
```

Authorization udostępnia readiness wyłącznie przez mTLS. Standardowe probe platformy
korzystają z dedykowanej tożsamości healthchecka; nie należy tworzyć dodatkowego listenera
HTTP.

Pole `redis` przyjmuje:

- `disabled` — profil celowo nie używa Redisa;
- `up` — ostatnia sonda Redis zakończyła się powodzeniem;
- `down` — Redis jest niedostępny lub przekroczył timeout.

Awaria wyłącznie Redisa daje HTTP `200` i `status: degraded`. Pod pozostaje w routingu,
ponieważ:

- zawsze aktywny limiter lokalny nadal chroni endpoint;
- publiczna lista przechodzi do PostgreSQL;
- sesje nadal korzystają z PostgreSQL;
- zapis zgłoszenia nie zależy od dostępności cache’u.

HTTP `503` i `status: error` oznacza awarię obowiązkowej zależności, np. PostgreSQL albo
Object Storage backendu. Nie wolno traktować `degraded` i `error` jako równoważnych.

## Metryki, dashboard i alerty

Najważniejsze metryki:

- `zglosto_redis_dependency_up`;
- `zglosto_redis_operations`;
- `zglosto_redis_operation_duration_seconds`;
- metryki lokalnego i rozproszonego rate limitingu;
- metryki hit/miss/invalidacji cache’u publicznej listy.

Dashboard `ZgłosTO Overview` pokazuje stan Redis oraz p95 operacji. Reguły Prometheus:

| Alert                         | Znaczenie                                              |
| ----------------------------- | ------------------------------------------------------ |
| `ZglostoRedisUnavailable`     | Redis pozostaje niedostępny przez co najmniej 2 minuty |
| `ZglostoRedisOperationErrors` | występują błędy operacji Redis                         |
| `ZglostoRedisHighLatency`     | p95 przekracza `250 ms` przez 10 minut                 |

Etykiety ograniczają się do stabilnych wartości, takich jak usługa, tryb, operacja i
wynik. Adres Redis, klucze cache, IP, e-mail ani identyfikatory użytkowników nie mogą
trafić do metryk lub logów.

## Procedura przy awarii

1. Potwierdź, że readiness ma `status: degraded`, a obowiązkowe zależności są `up`.
2. Sprawdź alert, wykres opóźnienia i liczbę błędów osobno dla `authorization` i `backend`.
3. Dla `local` sprawdź stan kontenera/poda Redis, jego probe, limit pamięci i zdarzenia
   restartu. Dla `external` sprawdź DNS, trasę sieciową, termin ważności CA i dostępność
   dostawcy.
4. Nie restartuj PostgreSQL, RabbitMQ ani aplikacji tylko po to, by wyczyścić Redis.
5. Po usunięciu przyczyny oczekuj automatycznego przejścia obu usług do `redis: up` i
   `status: ok`. Klient odrzuca nieaktualne połączenie i zestawia nowe.
6. Jeśli jedna usługa nie odzyska połączenia, porównaj zamontowany Secret, tryb i politykę
   sieciową, a dopiero potem wykonaj kontrolowany restart tej usługi.

Utrata całej zawartości Redis jest dopuszczalna. Cache odbuduje się z PostgreSQL, a
liczniki rozpoczną nowe okna. Redis nie może być odtwarzany z backupu danych domenowych.

## Test awarii

Izolowany test Compose zatrzymuje Redisa, wymaga przejścia obu usług
`ok -> degraded`, potwierdza odczyt z PostgreSQL, uruchamia Redis ponownie i wymaga
powrotu `degraded -> ok`:

```bash
pnpm test:redis-failure
```

Test tworzy własny projekt Compose i usuwa go po zakończeniu. Nie należy uruchamiać tego
scenariusza przeciw współdzielonemu ani produkcyjnemu środowisku.

Pełne testy obciążeniowe, strojenie progów, timeoutów, p95 oraz zachowania przy wielu
replikach pozostają bramką Fazy 12.
