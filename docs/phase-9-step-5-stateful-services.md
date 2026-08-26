# Faza 9 / krok 5 — usługi stanowe i storage

## Status

Wdrożono 2026-07-24 dla Kubernetes i K3s. Maszynowym źródłem prawdy jest
`deploy/cluster-stateful-contract.json`, a bramką `pnpm check:cluster-stateful`.

## PostgreSQL i pgBackRest

PostgreSQL działa jako jednoinstancyjny `StatefulSet/database` ze stabilnym headless
Service `database-headless` i prywatnym Service `database`. Dwa `volumeClaimTemplates`
przechowują:

- `postgres-data` — `20Gi`;
- `pgbackrest-data` — `40Gi`.

Oba mają jawną politykę `persistentVolumeClaimRetentionPolicy` równą `Retain` przy usunięciu
StatefulSetu i scale-down. Usunięcie workloadu nie oznacza więc usunięcia danych.

Kontener główny uruchamia istniejący, kontrolowany entrypoint obrazu PostgreSQL, TLS 1.3,
SCRAM-SHA-256 i pgBackRest. Sidecar `pgbackrest-scheduler` współdzieli ten sam pod i wolumeny:
wykonuje backup różnicowy co `PGBACKREST_BACKUP_INTERVAL_SECONDS=86400`, a w niedzielę pełny.
To celowy wybór zamiast CronJobu: lokalny pgBackRest potrzebuje dostępu do PGDATA, a osobny
pod wymagałby repo-servera albo niebezpiecznego `pods/exec`/współdzielenia RWO. Finalny
restore drill, retencja operacyjna oraz pomiar RPO/RTO pozostają bramką Fazy 12.

## PgBouncer

PgBouncer jest bezstanowym `Deployment` z dwiema replikami, prywatnym Service i PDB
`minAvailable: 1`. Pracuje w trybie transaction pooling i weryfikuje PostgreSQL przez TLS.

Kontrakt routingu:

- `DATABASE_URL` aplikacji wskazuje `pgbouncer:6432`;
- `DATABASE_DIRECT_URL` wskazuje `database:54325`;
- Authorization i backend otrzymują tylko plik z `DATABASE_URL`;
- tylko PostgreSQL, PgBouncer, pgBackRest i przyszły kontrolowany Job migracyjny mogą użyć
  bezpośredniego URL-u;
- nie istnieje fallback aplikacji omijający PgBouncera.

## RabbitMQ

RabbitMQ działa jako jednoinstancyjny `StatefulSet` z headless Service, prywatnym Service
AMQPS i PVC `rabbitmq-data=10Gi`. PVC ma retencję `Retain/Retain`. Plugin i port management
`15672` są wyłączone, a konfiguracja nadal wymusza trwałe quorum queues,
publisher confirms po stronie backendu i manualne ACK po stronie konsumentów.

Pojedyncza replika zapewnia trwałość przy restarcie poda, ale nie odporność na utratę węzła.
Topologia wielowęzłowego klastra RabbitMQ i certyfikacja awarii należą do końcowej bramki
produkcyjnej.

## Object Storage

Domyślne overlaye `kubernetes` i `k3s` nie zawierają RustFS. Korzystają z zewnętrznego
S3/R2 przez neutralne `S3_*`, z `S3_AUTO_CREATE_BUCKET=false`.

RustFS jest opcjonalnym komponentem Kustomize:

- `k8s/overlays/kubernetes-rustfs`;
- `k8s/overlays/k3s-rustfs`.

Komponent dodaje jednoinstancyjny StatefulSet, prywatny Service i PVC `rustfs-data=50Gi`.
Konsola jest wyłączona, poświadczenia są czytane z plików Secret, a komponent zmienia
wyłącznie `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` i `S3_AUTO_CREATE_BUCKET`. Backend oraz worker
pozostają provider-neutralne.

## Klasy storage i gwarancje

- Kubernetes: `standard`;
- K3s single-node: `local-path`, bez odporności na awarię hosta;
- K3s HA: wymagany replikowany storage albo zewnętrzne PostgreSQL/RabbitMQ/Object Storage.

Sama wielowęzłowa kontrola K3s nie zmienia lokalnego PVC w storage HA.

## Automatyczna bramka

`pnpm check:cluster-stateful` renderuje cztery overlaye i sprawdza:

- StatefulSety, headless Services, rozmiary PVC, klasy storage oraz retencję;
- wyłącznie prywatne Service dla PostgreSQL, PgBouncera, RabbitMQ i RustFS;
- brak pluginu i portu management RabbitMQ;
- zakaz bezpośredniego URL-u PostgreSQL w Authorization i backendzie;
- dwie repliki PgBouncera i PDB;
- scheduler pgBackRest;
- brak RustFS w profilach zewnętrznego S3;
- provider-neutralne przełączenie opcjonalnych overlayów RustFS.
