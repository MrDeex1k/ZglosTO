# Faza 9 / krok 4 — konfiguracja i sekrety K8s/K3s

## Status

Wdrożono 2026-07-24 dla wspólnej bazy Kustomize i obu overlayów:
`k8s/overlays/kubernetes` oraz `k8s/overlays/k3s`.

## Publiczna konfiguracja

Źródłem prawdy miasta pozostaje `config/white-label/zglosto.yaml`. Skrypt
`pnpm config:k8s:sync` tworzy jego kontrolowaną kopię wdrożeniową
`k8s/base/config/generated/city.yaml`, a `pnpm check` odrzuca kopię nieaktualną.
Kustomize generuje z niej immutable `ConfigMap/zglosto-white-label-<hash>`. Hash w nazwie
powoduje automatyczną zmianę referencji Deploymentu i rollout po zmianie treści.

Authorization i backend montują ten sam klucz `city.yaml` tylko do odczytu pod
`/app/config/city.yaml`. Brak ConfigMap blokuje start poda. Nie istnieje alternatywna
konfiguracja miasta ani cichy fallback.

Publiczne ustawienia runtime znajdują się w `k8s/base/config/runtime.env`. Kustomize
generuje z nich immutable `ConfigMap/zglosto-config-<hash>`. Nazwy zmiennych są takie same
jak w Compose; profil klastrowy nie tworzy osobnego kontraktu aplikacji.

## Sekrety

Maszynowym kontraktem nazw zasobów, kluczy i odbiorców jest
`deploy/cluster-secret-contract.json`. Nie zawiera on wartości. Sekrety są provisionowane
przed rolloutem przez External Secrets Operator, Secrets Store CSI Driver, Sealed Secrets
albo inny zatwierdzony mechanizm zgodny z tym kontraktem.

Workloady nie pobierają wartości przez `secretKeyRef`, `envFrom`, argumenty procesu ani
ConfigMap. Sekrety są montowane jako pliki tylko do odczytu z trybem `0440`, a aplikacje
otrzymują wyłącznie wskaźniki `*_FILE`. Dotyczy to:

- poświadczeń PostgreSQL i URL-i DB;
- RabbitMQ;
- S3-compatible Object Storage;
- Better Auth;
- Database CA, Service CA oraz certyfikatów i kluczy TLS/mTLS.

Każdy wolumen Secret ma `optional: false`. Brak zasobu albo klucza pozostawia workload
w kontrolowanym stanie `Pending`/not-ready i nie uruchamia go z wartością domyślną.

Wartość `RABBITMQ_URL` w Kubernetes/K3s musi używać pełnego DNS
`rabbitmq.zglosto.svc.cluster.local`. Ten sam Secret odczytuje worker/backend oraz KEDA
działająca w innym namespace, dlatego skrócona nazwa `rabbitmq` nie jest wystarczającym
kontraktem klastrowym.

## Automatyczna bramka

`pnpm check:cluster-config`, wykonywane również przez `pnpm check`, renderuje oba overlaye i
sprawdza:

- immutable, hashowane ConfigMapy oraz zgodność White Label ze źródłem prawdy;
- `NODE_ENV=production` i wspólną ścieżkę `/app/config/city.yaml`;
- brak sekretów w ConfigMapach i brak renderowanego zasobu `Secret`;
- kompletność kontraktu zewnętrznych Secretów;
- wyłącznie plikowe, nieopcjonalne, read-only dostarczanie sekretów;
- obecność konfiguracji White Label w każdym aktualnym konsumencie.

Krok nie provisionuje rzeczywistych wartości ani certyfikatów. Automatyzacja operatora,
issuerów i rotacji materiału TLS należy do kroku 7 Fazy 9.
