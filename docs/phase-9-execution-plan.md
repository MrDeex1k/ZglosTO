# Faza 9 — trzy profile wdrożeniowe, autoskalowanie i obserwowalność

## Status i cel

**Status:** zakończona; kroki 1-11 wdrożone 2026-07-24.  
**Wejście:** zakończone Fazy 0-8 i przechodzące `pnpm check`.  
**Cel:** powtarzalny, bezpieczny i testowalny deployment obecnego systemu przez Docker
Compose, Kubernetes oraz K3s, bez zmiany kontraktów domenowych.

Faza 9 tworzy pierwsze kompletne kandydaty produkcyjne i wspólny kontrakt profili. Faza 11
finalizuje obrazy oraz hardening Compose, a Faza 12 certyfikuje każdy profil przez pełne
testy awarii, bezpieczeństwa i obciążenia.

## Docelowe profile

- Docker Compose jest produkcyjnym profilem pojedynczego hosta dla mniejszych instalacji.
- Kubernetes pozostaje ogólnym profilem klastrowym.
- K3s jest lżejszym profilem klastrowym dla pojedynczego miasta i mniejszych instalacji;
  dokumentujemy wariant single-node oraz rekomendowany wariant HA.
- Rekomendowaną strukturą manifestów jest Kustomize: wspólna `base` oraz overlaye `k8s` i
  `k3s`. Jest to bramka decyzji w kroku 1, a nie wymaganie aplikacji.
- Jedna instalacja nadal obsługuje dokładnie jedno miasto i jeden plik White-Label.
- Wszystkie profile używają tego samego, przypiętego zestawu obrazów; profil nie buduje
  innego kodu.
- Docker Model Runner pozostaje opcjonalnym runtime'em profilu Compose. Klastrowy
  `llm_gateway` zależy od provider-neutralnego endpointu modelu; wdrożenie modelu wewnątrz
  klastra wymaga osobnego, opcjonalnego overlayu i jawnych wymagań sprzętowych.

## Macierz parytetu

| Właściwość                | Docker Compose                         | Kubernetes            | K3s                   |
| ------------------------- | -------------------------------------- | --------------------- | --------------------- |
| funkcje i kontrakty       | pełne                                  | pełne                 | pełne                 |
| topologia                 | pojedynczy host                        | klaster               | single-node albo HA   |
| odporność na utratę hosta | brak; wymagany restore na innym hoście | zależna od klastra    | tylko wariant HA      |
| `media_worker`            | stałe/manualne repliki                 | KEDA `1-4`            | KEDA `1-4`            |
| `llm_gateway`             | jedna replika albo wyłączony           | scale-to-zero         | scale-to-zero         |
| rollout/rollback          | automatyzowany recreate i rollback     | Deployment rollout    | Deployment rollout    |
| sekrety                   | Compose secrets/zewnętrzny magazyn     | Secret/operator       | Secret/operator       |
| certyfikaty               | automatyzacja hostowa ACME/PKI         | cert-manager          | cert-manager          |
| izolacja sieci            | sieci Docker i firewall hosta          | NetworkPolicy         | NetworkPolicy         |
| storage                   | wolumeny hosta/usługi zewnętrzne       | PVC/usługi zewnętrzne | PVC/usługi zewnętrzne |
| obserwowalność            | OpenTelemetry i stos Grafana           | ten sam kontrakt      | ten sam kontrakt      |

Produkcja nie oznacza identycznych gwarancji orkiestracji. Dokumentacja instalacji musi
podawać SLA/RTO/RPO oraz ograniczenia wybranego profilu.

## Kolejność realizacji

### 1. Baseline i wspólny kontrakt — wdrożony 2026-07-24

1. Zinwentaryzować zasoby Compose i manifestów, obrazy, porty, zmienne, wolumeny/PVC,
   healthchecki/probes oraz przepływy sieciowe.
2. Zbudować maszynowo sprawdzaną macierz parytetu trzech profili.
3. Usunąć historyczne nazwy oraz rozbieżne kontrakty konfiguracji.
4. Przyjąć strukturę `base + overlays`, preferencyjnie Kustomize, oraz walidować wynik przez
   `kubectl kustomize`/`kubectl diff`.
5. Dodać jednolite labels, namespace, ServiceAccount i nazewnictwo obrazów.

**Bramka:** Compose renderuje się przez `docker compose config`, oba overlaye klastrowe
renderują się deterministycznie, a żaden profil nie zawiera pgAdmin, starego FastAPI,
sekretów jawnym tekstem ani tagów `latest`.

Wynik: przyjęto Kustomize `base + overlays`, dodano dedykowane ServiceAccount i wspólne
etykiety, maszynową macierz `deploy/deployment-baseline.json` oraz obowiązkową komendę
`pnpm check:deployment-baseline`. Oba overlaye renderują się poprawnie. Brakujące workloady
klastrowe są jawnie oznaczone jako planowane, a nie pozorowane w baseline. Szczegóły:
[baseline kroku 1](phase-9-step-1-deployment-baseline.md).

### 2. Produkcyjny kandydat Docker Compose — wdrożony 2026-07-24

1. Dodać osobny override `docker-compose.production.yml`.
2. Używać obrazów z registry przypiętych digestem; nie używać lokalnego `build`.
3. Usunąć bind mounty kodu i inicjalizacyjnych plików, które pozwalają zmienić runtime poza
   kontrolowanym wydaniem.
4. Wymusić `NODE_ENV=production`, pełne ENV, Compose secrets i brak developerskich wartości
   domyślnych.
5. Dodać restart policies, healthchecki, graceful shutdown, resource limits, rotację logów
   oraz hardening `read_only`, `tmpfs`, `cap_drop` i `no-new-privileges`, gdzie są możliwe.
6. Wystawić publicznie wyłącznie HTTPS przez Nginx; PostgreSQL, RabbitMQ, PgBouncer i RustFS
   pozostają w sieciach wewnętrznych.
7. Dodać automatyzację hosta: start po restarcie, `pull -> migrate -> up -> smoke`, rollback,
   backup, restore i rotację certyfikatów.
8. Udokumentować, że awaria całego hosta powoduje przerwę do czasu odtworzenia zgodnie z RTO.

**Bramka:** świeży host uruchamia przypięte wydanie bez kompilacji kodu, smoke test przechodzi
po restarcie hosta, a rollback nie narusza wolumenów.

Wynik: powstał dziewięciousługowy override bez lokalnych buildów i RustFS, wymagający
obrazów z registry przypiętych digestem. Sekrety są plikami Compose secrets, tylko Nginx
publikuje HTTPS, a usługi mają limity, restart, rotację logów i hardening. Dodano
maszynową politykę `pnpm check:production-compose`, atomowo blokowaną procedurę
`pull -> migrate -> up -> smoke`, rollback bez cofania migracji, backup/restore, rotację
certyfikatów oraz start systemd po restarcie hosta. Pełny test na świeżej maszynie i
certyfikacja RTO/RPO pozostają w Fazie 12. Szczegóły:
[produkcyjny Compose kroku 2](phase-9-step-2-production-compose.md).

### 3. Struktura manifestów K8s/K3s — wdrożony 2026-07-24

1. Utrzymać wspólną bazę oraz overlaye Kubernetes i K3s.
2. Overlay K3s jawnie wybiera ingress, storage class, metrics-server, KEDA i cert-manager.
3. Opisać wariant K3s single-node oraz HA; tylko HA deklaruje odporność na utratę serwera.

**Bramka:** oba overlaye renderują się deterministycznie i nie zawierają pgAdmin, starego
FastAPI ani sekretów zapisanych jawnym tekstem.

Wynik: baza nie zawiera decyzji o ingressie ani klasie storage. Overlay Kubernetes wybiera
ingress-nginx i `standard`, a K3s pakietowe Traefik, `local-path` i Metrics Server.
`deploy/cluster-profiles.json` zapisuje również wymaganie KEDA/cert-manager oraz rozróżnia
K3s single-node bez HA od rekomendowanego, co najmniej trzyserwerowego wariantu HA.
Walidator sprawdza te decyzje, neutralność bazy i deterministyczność renderów. Szczegóły:
[profile Kustomize kroku 3](phase-9-step-3-kustomize-profiles.md).

### 4. Konfiguracja i sekrety — wdrożony 2026-07-24

1. Publiczny, walidowany YAML White-Label trafia do ConfigMap i jest montowany pod tą samą
   ścieżką we wszystkich wymagających go workloadach.
2. Hasła, klucze S3, Better Auth, RabbitMQ, PostgreSQL i materiał TLS trafiają do Secret lub
   zatwierdzonego zewnętrznego operatora sekretów.
3. Nazwy ENV pozostają zgodne z Compose; K8s/K3s nie tworzą drugiego kontraktu konfiguracji.
4. Nie umieszczamy sekretów w repozytorium, obrazach, ConfigMap ani argumentach poleceń.

**Bramka:** brak sekretu lub błędny White-Label powoduje kontrolowany brak readiness, a nie
uruchomienie z cichym fallbackiem.

Wynik: Kustomize generuje immutable, hashowane ConfigMapy z publicznego runtime ENV i
kanonicznego White-Label YAML. Authorization i backend montują identyczny plik
`/app/config/city.yaml`. Sekrety mają maszynowy kontrakt
`deploy/cluster-secret-contract.json`, są dostarczane zewnętrznie wyłącznie jako pliki
read-only `0440`, a wszystkie wolumeny są nieopcjonalne. Usunięto zbiorczy
`Secret/zglosto-secret`, `secretKeyRef`, `envFrom` i przykładowy manifest z wartościami.
`pnpm check:cluster-config` weryfikuje oba overlaye i blokuje regresje. Szczegóły:
[konfiguracja i sekrety kroku 4](phase-9-step-4-cluster-configuration.md).

### 5. Usługi stanowe i storage — wdrożony 2026-07-24

1. PostgreSQL otrzymuje trwały wolumen, politykę retencji i ścieżkę backupu pgBackRest.
2. RabbitMQ otrzymuje trwały wolumen i kontrolowany restart bez utraty zaakceptowanych zadań.
3. PgBouncer staje się jedynym adresem DB dla aplikacji; bezpośredni PostgreSQL pozostaje
   wyłącznie dla migracji, backupu i administracji.
4. RustFS działa jako opcjonalny profil/overlay. Zewnętrzny S3/R2 wymaga tylko zmiany `S3_*`
   i nie uruchamia RustFS.
5. Compose używa kontrolowanych wolumenów hosta, a overlay K3s jawnie wybiera storage class.
   Cache modelu jest osobnym, opcjonalnym wolumenem/PVC.

**Bramka:** restart kontenera/poda nie usuwa danych, a kontrolowany restore odtwarza spójną
parę PostgreSQL + Object Storage.

Wynik: PostgreSQL i RabbitMQ działają jako StatefulSety z headless Service,
`volumeClaimTemplates` oraz retencją `Retain/Retain`. PgBouncer ma dwie repliki, prywatny
Service i PDB, a aplikacje nie otrzymują bezpośredniego URL-u PostgreSQL. pgBackRest ma
osobny wolumen i scheduler sidecar wykonujący backupy różnicowe oraz tygodniowe pełne.
Domyślne overlaye używają zewnętrznego S3, natomiast opcjonalne `kubernetes-rustfs` i
`k3s-rustfs` dodają provider-neutralny StatefulSet RustFS. Maszynowy kontrakt znajduje się
w `deploy/cluster-stateful-contract.json`, a cztery rendery sprawdza
`pnpm check:cluster-stateful`. Pełny restore drill i certyfikacja RPO/RTO pozostają w Fazie 12. Szczegóły: [usługi stanowe kroku 5](phase-9-step-5-stateful-services.md).

### 6. Workloady aplikacyjne i routing — wdrożony 2026-07-24

1. Dodać lub zaktualizować `frontend`, `authorization`, `backend`, `media_worker` i
   `llm_gateway`.
2. `frontend` serwuje obecny artefakt TanStack Start SPA; nie dokładamy niepotrzebnego
   procesu SSR.
3. Każda usługa ma healthcheck/readiness, graceful shutdown i jawne limits; workloady
   klastrowe mają osobne liveness/readiness oraz requests.
4. `backend` i `authorization` mają PDB; pozostałe workloady otrzymują PDB tylko, jeśli
   liczba replik i profil dostępności nadają mu sens.
5. Nginx Compose i Ingress klastrowy zachowują kontrakt same-origin `/`, `/api`, `/api/auth`
   i `/llm`.

**Bramka:** bezpośrednie wejścia na trasy frontendu, logowanie, zapis zgłoszenia, upload,
worker oraz fallback LLM działają przez publiczny punkt wejścia danego profilu.

Wynik: baza zawiera kompletny zestaw workloadów, w tym osobny Deployment `media-worker`
bez Service. Wszystkie mają ServiceAccount, zasoby i probes, a krytyczne lub wieloreplikowe
warstwy mają PDB. Wewnętrzny Nginx zachowuje same-origin `/`, `/api`, `/api/auth` oraz
udostępnia tylko healthcheck `/llm/health`. Nginx jest prywatnym ClusterIP za Ingressem,
bez NodePort. Szczegóły: [workloady i routing kroku 6](phase-9-step-6-workloads-routing.md).

### 7. TLS, mTLS i izolacja sieci — wdrożony 2026-07-24

1. Compose używa automatyzacji hostowej ACME/PKI oraz montowanych secrets; K8s/K3s używają
   cert-managera albo równoważnego kontrolera.
2. Service CA i Database CA pozostają rozdzielone.
3. Backend i Nginx mają osobne certyfikaty klienckie do Authorization; rotacja kluczy używa
   `rotationPolicy: Always`.
4. Backend i Authorization weryfikują TLS do PgBouncera, a PgBouncer weryfikuje osobny TLS
   do PostgreSQL.
5. Compose używa osobnych sieci, minimalnych portów hosta i firewalla; K8s/K3s używają
   default-deny NetworkPolicy.
6. Test negatywny obejmuje plaintext, obcą CA, błędny SAN oraz połączenie z niedozwolonego
   kontenera/poda.

**Bramka:** rotacja certyfikatu nie wymaga przebudowy obrazu i nie prowadzi do utraty danych.

Wynik: cert-manager utrzymuje rozdzielone Service CA i Database CA, certyfikaty leaf z
rotacją kluczy oraz oddzielne tożsamości SPIFFE backendu, Nginx i healthchecku. Reloader
wykonuje rollout po zmianie Secretu. Ingress kończy publiczny HTTPS, a namespace używa
default-deny i precyzyjnych allowlist. Test polityki odrzuca plaintext, obcą CA, błędny SAN,
niedozwolony pod, brak rotacji i brak default-deny. Rotacja na działającym klastrze i próby
sieciowe pozostają bramką certyfikacyjną Fazy 12. Szczegóły:
[bezpieczeństwo transportu kroku 7](phase-9-step-7-cluster-transport-security.md).

### 8. Fundament obserwowalności — wdrożony 2026-07-24

1. Usunąć `authorization/auth_log.txt` i przenieść Authorization na strukturalny JSON do
   `stdout`/`stderr`.
2. Dodać OpenTelemetry SDK do usług Node.js oraz propagację W3C `traceparent` przez HTTP,
   mTLS i envelope RabbitMQ.
3. Uruchomić OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafanę i Alertmanager w
   każdym profilu.
4. Dodać podstawowe metryki RED, RabbitMQ/outbox, Sharp, PgBouncer, PostgreSQL, storage i LLM.
5. Dodać developerskie dashboardy i korelację `correlationId`/`traceId`.
6. Telemetria nie może zawierać treści zgłoszeń, e-maili, cookies, tokenów, object keys ani
   identyfikatorów o wysokiej kardynalności jako etykiet.

**Bramka:** odłączenie Collectora i każdego backendu telemetrycznego nie zatrzymuje requestu,
zadania workera ani startu produktu.

Wynik: współdzielony pakiet `@zglosto/observability` uruchamia SDK przed kodem czterech
usług Node.js, propaguje W3C Trace Context przez HTTP/mTLS i RabbitMQ oraz emituje
strukturalne logi i podstawowe metryki operacyjne bez danych prywatnych. Każda platforma
ma trzy wzajemnie wyłączne tryby: `disabled`, `external` i `local`; tryb `both` został
jawnie odrzucony. `external` izoluje poświadczenia zewnętrznego OTLP w Collectorze, a
`local` uruchamia Collector, Prometheus, Loki, Tempo, Grafanę i Alertmanager. Walidator
renderuje warianty Compose, Kubernetes i K3s, również z RustFS, i sprawdza nieblokującą
awarię eksportera. Szczegóły: [fundament obserwowalności kroku 8](phase-9-step-8-observability.md).

### 9. Skalowanie `media_worker` — wdrożone 2026-07-24

Kontrakt desired replicas pozostaje dokładny:

| Oczekujące zdjęcia | Repliki |
| ------------------ | ------- |
| `0-3`              | 1       |
| `4-7`              | 2       |
| `8-11`             | 3       |
| `12+`              | 4       |

Implementacja K8s/K3s używa KEDA, `minReplicaCount: 1`, `maxReplicaCount: 4`,
`MEDIA_WORKER_PREFETCH=1` i `MEDIA_SHARP_CONCURRENCY=1`. Nie wolno zakładać, że prosty
RabbitMQ `QueueLength value: 4` daje drugą replikę dokładnie przy backlogu `4`; HPA traktuje
ten parametr jako cel na replikę. Wdrożono metrykę z dokładną funkcją
`min(floor(backlog / 4) + 1, 4)` przez KEDA `scalingModifiers`.

Skalowanie w górę ma reagować szybko. Powrót z `N` do `1` następuje dopiero, gdy przez
nieprzerwane 180 sekund backlog pozostaje w `0-3`. Ponieważ `cooldownPeriod` KEDA dotyczy
zejścia do zera, okno `N -> 1` realizuje `horizontalPodAutoscalerConfig.behavior.scaleDown`
z `stabilizationWindowSeconds: 180`. Podczas termination worker kończy aktywną wiadomość z
manual ACK.

Compose nie emuluje KEDA własnym skryptem. Używa zatwierdzonej, stałej liczby replik lub
kontrolowanego `docker compose up --scale media_worker=N`; monitoring informuje operatora o
przekroczonym backlogu. Rekomendowana wartość startowa to jedna replika.

**Bramka:** K8s/K3s automatycznie sprawdzają backlog `0, 3, 4, 7, 8, 11, 12`. Compose
sprawdza każdą wspieraną liczbę replik. Wszystkie profile testują restart, retry/DLQ,
graceful shutdown i brak podwójnego przetworzenia.

Wynik: KEDA `ScaledObject` i szyfrowany `TriggerAuthentication` realizują dokładną funkcję
przez złożoną metrykę typu `Value`. Fallback utrzymuje jedną replikę, scale-down ma okno
`180 s`, a NetworkPolicy pozwala kontrolerowi KEDA wyłącznie na AMQPS. Maszynowy kontrakt
testuje wszystkie wartości graniczne w każdym overlayu i potwierdza, że Compose pozostaje
statyczny. Szczegóły: [autoskalowanie workera kroku 9](phase-9-step-9-media-worker-autoscaling.md).

### 10. Scale-to-zero `llm_gateway` — wdrożone 2026-07-24

1. Porównano KEDA HTTP Add-on oraz Knative Serving pod kątem K8s i K3s.
2. Ustalono budżety cold startu i interceptora wobec timeoutu całkowitego `7 s` oraz budżetu
   `5 s` dla runtime'u modelu; pomiary na rzeczywistych klastrach należą do Fazy 12.
3. Zweryfikowano model routingu, TLS, obserwowalności, operacyjności i upgrade'u.
4. ADR-011 wybiera jeden mechanizm; repo nie utrzymuje dwóch produkcyjnych ścieżek.
5. Backend zachowuje limitowany retry i fallback. Zapis zgłoszenia działa także wtedy, gdy
   gateway lub model nie zdąży wystartować.

KEDA HTTP Add-on używa obecnie `InterceptorRoute`; historyczny `HTTPScaledObject` nie powinien
być podstawą nowej konfiguracji. Scale-to-zero dotyczy gatewaya, nie całego backendu, auth ani
`media_worker`. Compose uruchamia jedną replikę gatewaya albo pozostawia LLM wyłączony; nie
deklaruje scale-to-zero.

**Bramka:** przejścia `0 -> 1 -> 0`, równoległy burst, timeout i niedostępny model nie
powodują utraty zgłoszenia ani błędu 5xx w podstawowym przepływie zapisu.

Wynik: wybrano jedną ścieżkę — KEDA HTTP Add-on 0.15.0 z `InterceptorRoute` v1beta1.
Backend kieruje ruch przez interceptor, gateway skaluje się w zakresie `0-4`, a po
`300 s` bezczynności wraca do zera. Timeout interceptora `6 s` mieści się w budżecie
backendu `7 s`. Knative odrzucono ze względu na dodatkowy stos operacyjny, szczególnie w
K3s. Przed-1.0 linia dodatku i API v1beta1 są jawnym ryzykiem podlegającym empirycznej
certyfikacji w Fazie 12.
Szczegóły: [scale-to-zero gatewaya kroku 10](phase-9-step-10-llm-scale-to-zero.md).

### 11. Automatyzacja testów deploymentu — wdrożona 2026-07-24

1. Walidacja `docker compose config`, YAML/Kustomize i schematów CRD.
2. Policy checks: brak `latest`, brak sekretów, wymagane probes/resources/securityContext.
3. Test świeżego hosta Compose, ephemeralnego klastra i co najmniej jeden test prawdziwego K3s.
4. Wspólny smoke i testy negatywne dla routingu, auth, DB, storage, RabbitMQ, LLM oraz
   telemetryki.
5. Test restartu hosta Compose, utraty poda/węzła, rotacji certyfikatu i podstawowego restore.

Wynik: powstał przypięty kontrakt wersji i scenariuszy, walidator wszystkich 12 overlayów,
walidacja standardowych schematów przez kubeconform i CRD przez server-side dry-run oraz
workflow CI dla Compose, Kind/Kubernetes i K3d/K3s. Wspólny smoke klastrowy sprawdza
routing, auth, readiness cert-manager/KEDA, odtworzenie podów, trwałość markera PostgreSQL
oraz rollout po aktualizacji Secretu TLS. Końcowy przebieg przeszedł na Compose/OrbStack,
Kind/Kubernetes 1.35.0 i dwuwęzłowym K3d/K3s 1.36.2. Awaria rzeczywistego węzła wielowęzłowego,
mierzone RTO/RPO oraz load/soak pozostają świadomie certyfikacją Fazy 12. Szczegóły:
[automatyzacja deploymentu kroku 11](phase-9-step-11-deployment-tests.md).

## Kryteria ukończenia Fazy 9

- produkcyjny Compose, baza K8s i overlay K3s renderują się i przechodzą automatyczną
  walidację;
- wszystkie profile używają tych samych przypiętych obrazów i jednego kontraktu White-Label;
- wszystkie wymagane workloady są Ready i używają przypiętych obrazów;
- aplikacje łączą się z DB wyłącznie przez PgBouncera, poza zatwierdzonymi jobami;
- RustFS można wyłączyć i zastąpić zewnętrznym S3/R2 wyłącznie przez konfigurację;
- mTLS/TLS, hostowa automatyzacja certyfikatów i izolacja Compose oraz
  cert-manager/default-deny NetworkPolicy w klastrach przechodzą testy pozytywne i negatywne;
- `media_worker` spełnia dokładne progi i trzyminutowe okno scale-down w K8s/K3s, a Compose
  ma przetestowane stałe/manualne repliki;
- wybrany wariant `llm_gateway` przechodzi scale-to-zero w K8s/K3s, a Compose działa z jedną
  repliką lub bez LLM;
- logi, metryki i traces są skorelowane, a awaria telemetryki jest nieblokująca;
- smoke test przechodzi na Compose, Kubernetes oraz K3s;
- dokumentacja instalacji, aktualizacji, rollbacku i diagnostyki odpowiada manifestom.

## Świadomie odłożone

- finalne wartości CPU/RAM, PgBouncera i progów alertów — Faza 12 po load testach;
- produkcyjne SLI/SLO, retencja i alert routing — Faza 12;
- finalne odchudzanie obrazów i pełny hardening produkcyjnego Compose — Faza 11;
- wdrożenie zaakceptowanego Redisa, lokalnego rate limitingu i cache’u publicznej listy —
  Faza 10;
- stabilne NestJS 12 — Faza 13;
- automatyczna lub półautomatyczna kontrola służby przez LLM — Faza 14.
