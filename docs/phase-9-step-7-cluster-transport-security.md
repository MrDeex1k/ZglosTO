# Faza 9 / krok 7 — TLS, mTLS i izolacja sieci K8s/K3s

## Status

Wdrożono 2026-07-24 dla profili Kubernetes i K3s. Kontrakt Compose pozostaje zgodny z
wcześniejszym mTLS/TLS i izolacją sieci; ten krok uzupełnia równoważne zabezpieczenia
klastrowe.

## PKI

cert-manager zarządza dwiema niezależnymi hierarchiami:

- Service CA wystawia serwer Authorization, klientów backend/Nginx/healthcheck oraz serwer
  RabbitMQ;
- Database CA wystawia serwery PostgreSQL i PgBouncer.

Backend, Nginx i healthcheck Authorization mają osobne URI SAN w formacie SPIFFE. Certyfikat
serwera zawiera DNS SAN odpowiadający nazwie Service. Certyfikaty leaf są ważne 30 dni,
odnawiane 7 dni przed końcem i używają `rotationPolicy: Always`, więc rotacja zmienia
również klucz prywatny.

Root CA ma `rotationPolicy: Never`: zmiana klucza root jest świadomą operacją utrzymaniową z
okresem zaufania obu CA, a nie automatycznym odnowieniem mogącym zerwać wszystkie
połączenia naraz. Workloady nie montują prywatnych kluczy CA. Otrzymują tylko `ca.crt` z
odpowiedniego sekretu leaf.

Stakater Reloader obserwuje sekrety certyfikatów i wykonuje kontrolowany rollout workloadu
po rotacji. Nie wymaga to przebudowy obrazu ani zmiany danych.

## Przepływy szyfrowane

- Nginx/backend -> Authorization: TLS 1.3 z wzajemnym uwierzytelnieniem;
- backend/Authorization/media-worker -> PgBouncer: TLS z weryfikacją Database CA i DNS SAN;
- PgBouncer -> PostgreSQL: osobna sesja TLS z weryfikacją Database CA i DNS SAN;
- backend/media-worker -> RabbitMQ: AMQPS i Service CA.

Publiczny Ingress kończy HTTPS certyfikatem `zglosto-public-tls`. Operator musi przed
wdrożeniem:

1. zainstalować cert-manager;
2. utworzyć `ClusterIssuer/zglosto-public-issuer` dla wybranego ACME lub PKI;
3. zastąpić `zglosto.example.invalid` prawdziwą domeną;
4. zainstalować Stakater Reloader;
5. użyć CNI egzekwującego Kubernetes NetworkPolicy.

`deploy.sh` zatrzymuje wdrożenie, jeśli brakuje kontrolerów/issuera albo pozostała domena
placeholder. Po zastosowaniu manifestów czeka na gotowość wszystkich wewnętrznych
certyfikatów.

## Izolacja sieci

Namespace ma `default-deny` dla ingress i egress. Osobna reguła zezwala na DNS, a kolejne
allowlisty opisują wyłącznie wymagane połączenia workload-to-workload. W szczególności:

- tylko backend, Authorization i media-worker mogą wejść do PgBouncera;
- wyłącznie PgBouncer oraz jawny pod operacyjny mogą wejść do PostgreSQL;
- tylko backend i media-worker mogą używać AMQPS;
- panel RabbitMQ nie jest dostępny między podami;
- ruch z Ingress controllera dociera wyłącznie do Nginx;
- wyjście do zewnętrznego S3/R2 i providera modelu jest ograniczone do właściwych workloadów
  i portów.

## Testy regresji i negatywne

`pnpm check:cluster-workloads-security` odrzuca również zmodyfikowane rendery symulujące:

- plaintext do Authorization;
- brak rotacji klucza leaf;
- błędny SPIFFE SAN;
- obcą Service CA;
- dostęp niedozwolonego frontendu do PgBouncera;
- usunięcie `default-deny`.

Są to deterministyczne testy polityki repozytorium. Próby połączeń na działającym klastrze,
rotacja na żywo i obserwacja braku utraty danych są obowiązkową częścią końcowej
certyfikacji Kubernetes/K3s w Fazie 12.
