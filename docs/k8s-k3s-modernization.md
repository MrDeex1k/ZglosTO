# Modernizacja profili Docker Compose, Kubernetes i K3s

## Status

**Faza 9 została zakończona; kroki 1-11 wdrożono 2026-07-24.** Ten dokument opisuje wymagania
docelowe. Kolejność wdrożenia, bramki i kryteria ukończenia definiuje
[plan wykonawczy Fazy 9](phase-9-execution-plan.md).

## Cel

Ten dokument opisuje, jak przygotować trzy profile produkcyjne po zmianie architektury
ZglosTO na White-Label, PNPM, Node 26, Hono, NestJS, TanStack Start, PgBouncer, neutralny
Object Storage i `llm_gateway`:

- Docker Compose na pojedynczym hoście;
- Kubernetes;
- K3s.

Krok 1 ustanowił wspólną bazę Kustomize, overlaye Kubernetes/K3s i automatyczną macierz
parytetu. Krok 2 dodał oddzielnego, dziewięciousługowego kandydata Compose z obrazami po
digestach, sekretami plikowymi, HTTPS i procedurami operacyjnymi. Krok 3 oddzielił neutralną
bazę od decyzji ingress/storage i utrwalił kontrakty Kubernetes/K3s. Krok 4 dodał
immutable ConfigMapy oraz zewnętrzny, plikowy kontrakt Secretów. Krok 5 dodał usługi
stanowe, retencję PVC i opcjonalny komponent RustFS. Kroki 6-7 uzupełniły workloady,
routing same-origin, cert-manager, rotację certyfikatów oraz default-deny NetworkPolicy.
Krok 8 dodał obserwowalność, krok 9 dokładne skalowanie workera, krok 10
scale-to-zero gatewaya, a krok 11 automatyczne testy Compose, Kind/Kubernetes i K3d/K3s.
Końcowa certyfikacja na docelowej infrastrukturze, load/soak oraz RTO/RPO pozostają Fazą 12.

## Stan obecny do uporzadkowania

Wspólna baza `k8s/base` zawiera obecnie zasoby dla pełnego zestawu usług:

- `frontend`;
- `backend`;
- `authorization`;
- `database`;
- `llm-gateway`;
- `nginx`.
- `media-worker`;
- `pgbouncer`;
- `rabbitmq`.

PgAdmin oraz stary `llm-service` Python/FastAPI zostały usunięte. Manifest gatewaya działa
domyślnie z `LLM_RUNTIME=disabled`; profesjonalne uruchamianie runtime'u DMR, skalowanie i
limity sprzętowe pozostają zakresem tej fazy wdrożeniowej. Dostęp do PostgreSQL w starszych
manifestach nadal wymaga pełnego ujednolicenia z PgBouncerem.

Obecny Compose zapewnia kompletny runtime lokalny i testy integracyjne, ale nie ma jeszcze
osobnego profilu produkcyjnego. Przed certyfikacją trzeba między innymi:

- uruchamiać obrazy z rejestru przypięte digestami, bez budowania na hoście produkcyjnym;
- usunąć developerskie wartości domyślne i bind mounty kodu;
- dostarczać sekrety poza zwykłymi zmiennymi w wersjonowanych plikach;
- zamknąć publiczne porty baz danych i brokera, pozostawiając wyłącznie HTTPS;
- ustawić restart policy, limity CPU/RAM/PID, hardening kontenerów i rotację logów;
- zautomatyzować instalację, migracje, backup, restore, upgrade i rollback hosta;
- udokumentować brak HA hosta oraz wynikające z niego SLA, RTO i RPO.

## Wspólny kontrakt i różne gwarancje

| Obszar                    | Docker Compose                                              | Kubernetes                        | K3s                                     |
| ------------------------- | ----------------------------------------------------------- | --------------------------------- | --------------------------------------- |
| Zakres                    | produkcja na jednym hoście                                  | produkcja klastrowa               | lekka produkcja jedno- lub wielowęzłowa |
| Funkcje/API/dane          | pełna zgodność                                              | pełna zgodność                    | pełna zgodność                          |
| Bezpieczeństwo transportu | HTTPS, mTLS/TLS, sieci Compose i firewall hosta             | HTTPS, mTLS/TLS, NetworkPolicy    | HTTPS, mTLS/TLS, NetworkPolicy          |
| Sekrety                   | Compose secrets lub zewnętrzny menedżer                     | Secret/CSI/zewnętrzny menedżer    | Secret/CSI/zewnętrzny menedżer          |
| Worker mediów             | stała liczba replik, ręczna zmiana                          | KEDA, 1-4 repliki                 | KEDA, 1-4 repliki                       |
| LLM gateway               | jedna replika albo wyłączony                                | opcjonalny scale-to-zero          | opcjonalny scale-to-zero                |
| Awaria hosta              | wymaga odtworzenia na innym hoście                          | zależna od topologii klastra      | odporna wyłącznie w wariancie HA        |
| Rollout                   | kontrolowana wymiana usług z procedurą rollbacku            | rolling update/rollback           | rolling update/rollback                 |
| Stan trwały               | wolumeny hosta lub zewnętrzne usługi                        | PVC lub zewnętrzne usługi         | PVC lub zewnętrzne usługi               |
| Stan krótkotrwały         | Redis `disabled`/`local`/`external`; lokalny limiter zawsze | Redis `local`/`external` zalecany | Redis `local`/`external` zalecany       |
| Obserwowalność            | ten sam kontrakt OTel, zwykle pojedynczy Collector          | OTel agent/gateway                | OTel agent/gateway                      |

„Gotowy produkcyjnie” oznacza przejście osobnej bramki dla danego profilu, a nie
identyczny poziom automatyzacji. W każdej instrukcji wdrożeniowej muszą być zapisane
gwarancje, ograniczenia, model awarii oraz oczekiwane RTO/RPO.

## Docelowy zestaw zasobów klastrowych

Docelowa konfiguracja Kubernetes/K3s powinna zawierac:

| Komponent         | Typowe zasoby                                          | Uwagi                                                                          |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `frontend`        | Deployment, Service, HPA                               | TanStack Start, Node 26 albo adapter hostingowy wybrany podczas migracji       |
| `authorization`   | Deployment, Service, HPA                               | Hono + Node 26 + Better Auth                                                   |
| `backend`         | Deployment, Service, HPA, PDB                          | NestJS + `@nestjs/platform-express` + Node 26, glowne API domenowe             |
| `llm_gateway`     | Deployment/ScaledObject albo Knative Service, Service  | Hono + Node 26, kandydat do scale-to-zero                                      |
| `postgres`        | StatefulSet albo Deployment, Service, PVC              | Dane trwale, backup/restore obowiazkowy                                        |
| `pgbouncer`       | Deployment, Service, ConfigMap                         | Standardowa sciezka polaczen aplikacji do PostgreSQL                           |
| `redis`           | opcjonalny Deployment/Service albo zewnętrzny endpoint | Wspólny cache i rate limiting; dane odtwarzalne, lokalny limiter działa zawsze |
| `rustfs`          | StatefulSet/Deployment, Service, PVC                   | S3-compatible storage dla zdjec                                                |
| `model_runner`    | Zaleznie od wybranego trybu                            | Opcjonalny, wlaczany flaga/profilami, nie wymagany do podstawowego startu      |
| `nginx` / ingress | Ingress, Service, ConfigMap                            | Publiczny routing, TLS, naglowki proxy                                         |

## Zasoby usuniete

Z runtime'u usunieto:

- `pgadmin` Deployment;
- `pgadmin` Service;
- konfiguracje pgAdmin;
- wolumeny/PVC pgAdmin, jesli istnieja;
- routing Nginx/Ingress do pgAdmin;
- sekrety pgAdmin.

Usuniecie pgAdmin jest skorelowane z dokumentacja operacyjna:

- jak wejsc do `psql` przez kontener/poda;
- jak wykonac diagnostyczne zapytania;
- jak wykonywac backup/restore;
- jak bezpiecznie udostepnic read-only connection string lokalnemu klientowi DB, jesli bedzie potrzebny.

## Zasoby do dodania

### Redis i lokalny rate limiting — Faza 10

Redis ma trzy tryby: `disabled`, `local` i `external`. Lokalny limiter Authorization oraz
backendu działa niezależnie od trybu. `disabled` jest wspierany przede wszystkim dla
pojedynczego Compose; wieloreplikowe Kubernetes/K3s powinny używać wspólnego Redisa.

Tryb `local` dodaje prywatny Service i workload Redisa dostępny wyłącznie dla Authorization
oraz backendu. `external` nie tworzy workloadu, tylko dostarcza endpoint i poświadczenia
przez Secret. Publiczna lista rozwiązanych incydentów ma cache Redis `900 s` i Nginx
microcache `30 s`; pojedynczy Compose `disabled` używa Nginx cache `900 s`.

Awaria Redisa pozostawia lokalny limiter oraz fallback publicznego odczytu do PostgreSQL.
Readiness raportuje `degraded`, ale nie usuwa zdrowego procesu z routingu wyłącznie z powodu
braku cache’u. Faza 10 jest zakończona. Pełny kontrakt opisuje
[Faza 10](phase-10-redis-cache-rate-limiting.md), a działania operatorskie
[runbook Redis](redis-operations.md).

### PgBouncer

Wymagane:

- `pgbouncer` Deployment;
- `pgbouncer` Service;
- ConfigMap z konfiguracja poolingu;
- Secret albo referencje do sekretow DB;
- NetworkPolicy pozwalajaca backendowi, auth i gatewayowi laczyc sie z PgBouncerem;
- ograniczenie bezposredniego dostepu do PostgreSQL dla aplikacji.

Zasada: aplikacje lacza sie z PostgreSQL przez PgBouncer. Bezposredni dostep do Postgresa zostaje tylko dla migracji, backupu i kontrolowanej administracji.

### TLS i mTLS

Zgodnie z ADR-029:

- backend i Nginx łączą się z authorization przez mTLS i używają osobnych certyfikatów
  klienta;
- użytkownicy web/Expo kończą zwykły HTTPS na Ingressie i nie posiadają certyfikatów klienta;
- backend oraz authorization łączą się z PgBouncerem przez TLS z pełną weryfikacją DNS;
- PgBouncer otwiera osobny, również zweryfikowany kanał TLS do PostgreSQL;
- uwierzytelnianie bazy pozostaje SCRAM-SHA-256, bez mTLS;
- Service CA i Database CA są rozdzielone;
- w Kubernetes/K3s cert-manager lub równoważny kontroler wystawia i rotuje certyfikaty
  w Secrets/CSI;
- w Compose równoważną funkcję zapewnia automatyzacja hostowa ACME/PKI, montująca
  krótkotrwałe certyfikaty read-only i wykonująca bezpieczny reload;
- klucze prywatne nie trafiają do obrazów, ConfigMap ani White-Label config.

NetworkPolicy albo izolowane sieci Compose z firewallem hosta nie zastępują TLS/mTLS.
Mechanizmy są wymagane łącznie: polityka ogranicza możliwe przepływy sieciowe, a certyfikat
potwierdza tożsamość końca połączenia. Szczegóły i testy negatywne opisuje
[kontrakt bezpieczeństwa transportu](transport-security.md).

### RustFS

Wymagane:

- Deployment/StatefulSet;
- Service;
- PVC;
- Secret z access key/secret key;
- ConfigMap z bucketami albo job inicjalizacyjny;
- NetworkPolicy pozwalajaca backendowi korzystac z RustFS;
- backup/lifecycle albo przynajmniej jawna strategia retencji.

Backend przechowuje w PostgreSQL metadane i klucze obiektow, a nie binarne zdjecia.

### White-Label config

Wymagane:

- ConfigMap dla publicznej konfiguracji miasta;
- Secret tylko dla danych wrazliwych;
- mount pliku konfiguracyjnego do frontendu/backendu/auth, jesli aplikacja czyta plik;
- albo endpoint backendu wystawiajacy publiczna czesc konfiguracji;
- walidacja konfiguracji przy starcie podow.

Minimalne dane:

- nazwa miasta;
- nazwa wyswietlana;
- sciezka do logo;
- lista aktywnych sluzb;
- przykładowy format adresu;
- opcjonalne dane kontaktowe/stopka.

### LLM Gateway

Wymagane:

- `llm_gateway` jako osobna granica HTTP;
- endpoint `/health`;
- endpoint klasyfikacji, np. `/classify-incident`;
- timeouty i fallbacki po stronie backendu;
- osobne resource requests/limits;
- logowanie bledow bez danych wrazliwych.

Gateway nie powinien przechowywac stanu. To warunek sensownego scale-to-zero.

### Docker Model Runner

Docker Model Runner ma byc opcjonalny:

- nie jest wymagany do podstawowego startu klastra;
- wlaczany flaga, profilem albo osobnym wariantem manifestow;
- ma miec jawnie opisane wymagania hosta, cache i limity zasobow;
- `llm_gateway` musi dzialac kontrolowanie rowniez wtedy, gdy model nie jest wlaczony.

## Docker Compose vs Kubernetes vs K3s

Compose pozostaje wspieranym profilem produkcyjnym na pojedynczym hoście. Kubernetes jest
ogólnym standardem manifestów klastrowych. K3s jest lżejszą ścieżką produkcyjną dla
mniejszych wdrożeń; pojedynczy serwer K3s nie zapewnia HA hosta, dlatego pełna odporność na
jego awarię wymaga topologii HA.

Roznice, ktore trzeba jawnie opisac:

- ingress controller i TLS;
- storage class;
- metrics server;
- wsparcie dla KEDA albo Knative;
- wymagania node'ow dla modelu;
- backup/restore;
- monitoring i logi;
- sposob dostarczania sekretow.

Manifesty powinny być możliwie wspólne. Preferowanym punktem startowym jest Kustomize ze
wspólną bazą oraz overlayami K8s i K3s; wybór zostanie zatwierdzony w pierwszym kroku Fazy 9.
Overlay K3s używa pakietowego Traefika, `local-path` i Metrics Server; KEDA oraz cert-manager
są jawnymi dodatkami zewnętrznymi. Ogólny overlay Kubernetes wybiera ingress-nginx i klasę
`standard`. Compose ma osobny produkcyjny override, ale korzysta z tych samych obrazów,
zmiennych, endpointów health i kontraktów bezpieczeństwa.

## Autoskalowanie `media_worker`

KEDA odwzorowuje dokładną funkcję `min(floor(backlog / 4) + 1, 4)`. Zwykły cel
`QueueLength value: 4` oznacza liczbę wiadomości na replikę i nie gwarantuje drugiej repliki
dokładnie przy backlogu `4`. Implementacja używa `scalingModifiers`, złożonej metryki
`Value` i celu `1`, a maszynowy test obejmuje wartości graniczne.

Profil podstawowy ma `minReplicaCount: 1`, `maxReplicaCount: 4`, prefetch i Sharp concurrency
równe `1`. Trzyminutowe okno powrotu do jednej repliki należy skonfigurować przez
`horizontalPodAutoscalerConfig.behavior.scaleDown.stabilizationWindowSeconds: 180`;
`cooldownPeriod` KEDA dotyczy zejścia do zera.

Powyższy automat dotyczy Kubernetes/K3s. Compose utrzymuje domyślnie jednego workera;
operator może jawnie zwiększyć liczbę replik po obserwacji kolejki, ale profil nie emuluje
KEDA ani nie obiecuje automatycznego progu co cztery zdjęcia.

## Scale-to-zero dla `llm_gateway`

Scale-to-zero dotyczy wyłącznie Kubernetes/K3s. W profilu Compose gateway utrzymuje jedną
replikę albo jest wyłączony, a backend zawsze zachowuje timeout i kontrolowany fallback.

Wybrano KEDA HTTP Add-on 0.15.0 i `InterceptorRoute` v1beta1. Gateway skaluje się
`0-4`, a ruch backendu przechodzi przez proxy interceptora. Knative Serving odrzucono,
ponieważ tworzyłby drugi, cięższy stos operacyjny. Przed-1.0 linia dodatku i API v1beta1
wymagają końcowej certyfikacji cold startu, upgrade'u i awarii w Fazie 12.

Backend musi miec:

- timeout do gatewaya;
- retry z limitem;
- fallback klasyfikacji;
- brak blokowania zapisu zgloszenia;
- metryki bledu/niedostepnosci gatewaya.

## Izolacja sieci

Docelowe reguly powinny wymuszac minimalne przeplywy:

- ingress/nginx -> frontend, auth, backend;
- frontend -> auth/backend tylko jesli frontend wykonuje bezposrednie wywolania z klienta;
- backend -> authorization;
- backend -> pgbouncer;
- backend -> rustfs;
- backend -> llm_gateway;
- llm_gateway -> model_runner;
- pgbouncer -> postgres;
- joby migracyjne/backupowe -> postgres;
- brak ruchu do pgAdmin, bo pgAdmin nie jest czescia docelowego runtime'u.

Kubernetes/K3s egzekwują te przepływy przez NetworkPolicy. Compose odwzorowuje je przez
osobne sieci, brak niepotrzebnych mapowań portów i firewall hosta.

## Healthchecki i probes

Kazda usluga aplikacyjna musi miec:

- `GET /health` albo rownowazny endpoint;
- rozdzielone liveness i readiness;
- healthcheck Compose albo odpowiadające im probes Kubernetes/K3s;
- jasne rozroznienie: proces zyje vs usluga jest gotowa do obslugi ruchu.

Dla `llm_gateway` healthcheck nie powinien bezwarunkowo wymagac dzialajacego modelu, jesli model jest opcjonalny. Powinien rozroznic:

- gateway dziala;
- model jest dostepny;
- fallback jest aktywny.

## Konfiguracja i sekrety

Zasady:

- publiczne ustawienia miasta trafiaja do ConfigMap w klastrach lub pliku read-only
  dostarczonego podczas deploymentu Compose;
- hasla, tokeny, access key i sekrety auth trafiaja do Secret/CSI w klastrach albo
  Compose secrets/zewnętrznego menedżera sekretów;
- nie duplikujemy tych samych wartosci pod roznymi nazwami;
- nazwy zmiennych sa wspolne dla Compose, K8s i K3s tam, gdzie to praktyczne;
- `.env.example`, README i manifesty musza opisywac te same zmienne.

Stan wdrożony w kroku 4:

- `config/white-label/zglosto.yaml` jest synchronizowany do generatora Kustomize i montowany
  jako `/app/config/city.yaml` w Authorization oraz backendzie;
- publiczny runtime ENV pochodzi z `k8s/base/config/runtime.env`;
- obie ConfigMapy są immutable i mają hash treści w nazwie;
- `deploy/cluster-secret-contract.json` definiuje wyłącznie nazwy zasobów, klucze i
  odbiorców, bez wartości;
- Secretów nie renderuje Kustomize; zewnętrzny operator/CSI/Sealed Secrets dostarcza je
  jako nieopcjonalne pliki read-only `0440`;
- `pnpm check:cluster-config` automatycznie weryfikuje ten kontrakt dla Kubernetes i K3s.

## Wolumeny i storage

Wymagane wolumeny:

- PostgreSQL data;
- backupy PostgreSQL;
- RustFS data;
- cache modeli, jesli wybrany runtime modelu tego wymaga.

Stan kroku 5:

- PostgreSQL: StatefulSet, `postgres-data=20Gi`, `pgbackrest-data=40Gi`, retencja
  `Retain/Retain`;
- RabbitMQ: StatefulSet, `rabbitmq-data=10Gi`, retencja `Retain/Retain`;
- RustFS: opcjonalny komponent, `rustfs-data=50Gi`, retencja `Retain/Retain`;
- Kubernetes używa klasy `standard`, K3s `local-path`;
- PgBouncer jest bezstanowym Deploymentem z dwiema replikami i PDB;
- `deploy/cluster-stateful-contract.json` oraz `pnpm check:cluster-stateful` blokują
  regresje.

Do decyzji:

- docelowe wolumeny i ścieżki hosta dla Compose;
- storage class dla K8s;
- storage class dla K3s;
- retencja backupow;
- restore drill;
- oddzielenie danych produkcyjnych od danych testowych.

## Skalowanie, dostępność i resources

Po migracji na Node 26 trzeba ponownie ustawic:

- CPU/memory requests;
- CPU/memory limits;
- HPA thresholds;
- PDB dla backendu i ewentualnie auth;
- limity dla gatewaya inne niz dla backendu, bo gateway jest kandydatem do scale-to-zero.

Nie kopiujemy starych wartosci automatycznie, bo zmienia sie runtime, framework i profil obciazenia.
Compose otrzymuje limity zasobów, restart policy i stałe liczby replik, ale nie deklaruje
HPA ani PDB.

## Kolejność aktualizacji profili

1. Zamrozić wspólny kontrakt funkcji, obrazów, konfiguracji, sekretów, health i telemetryki.
2. Zbudować produkcyjny override Compose i automatyzację cyklu życia pojedynczego hosta.
3. Utrzymac wykonane usuniecie pgAdmin i workflow administracyjny przez `psql`.
4. Przygotować wspólną bazę manifestów oraz overlaye Kubernetes i K3s.
5. Ujednolicić White-Label config, PgBouncer, Object Storage i wolumeny/PVC.
6. Ustawić routing, TLS/mTLS i izolację sieci właściwą dla profilu.
7. Dodać opcjonalny wariant Docker Model Runner.
8. Dodać KEDA dla workera oraz wybrany scale-to-zero gatewaya tylko w klastrach.
9. Zaktualizować instrukcje instalacji, upgrade'u, rollbacku, backupu i restore.
10. Uruchomić osobny smoke test i test negatywny bezpieczeństwa każdego profilu.

## Smoke test po wdrozeniu

Minimalny test należy wykonać osobno dla Compose, Kubernetes i K3s:

1. Wszystkie kontenery/pody poza opcjonalnym modelem są zdrowe i gotowe.
2. Frontend odpowiada przez ingress.
3. Auth pozwala na logowanie.
4. Backend zapisuje zgloszenie.
5. Backend zapisuje zdjecie do RustFS.
6. Backend laczy sie z DB przez PgBouncer.
7. `llm_gateway` odpowiada na `/health`.
8. Przy wylaczonym modelu zgloszenie nadal da sie zapisac.
9. Przy wlaczonym modelu klasyfikacja przechodzi przez `llm_gateway`.
10. PgAdmin nie jest wystawiony.
11. Sekrety nie występują w obrazach, publicznych konfiguracjach ani logach.
12. Backup i restore oraz udokumentowany rollback działają w danym profilu.

## Otwarte decyzje

- KEDA HTTP add-on czy Knative Serving dla scale-to-zero.
- Deployment czy StatefulSet dla RustFS w pierwszym wariancie.
- Czy frontend TanStack Start bedzie hostowany jako Node service, czy przez adapter/statyczny wariant, jesli wystarczy.
- Jak dostarczac logo miasta: mount pliku, publiczny asset, RustFS czy CDN.
- Czy manifesty beda utrzymywane jako czysty YAML, Kustomize, Helm, czy inny mechanizm overlayow.
- Jaki menedżer sekretów i mechanizm automatycznej rotacji certyfikatów przyjąć dla
  produkcyjnego hosta Compose.
