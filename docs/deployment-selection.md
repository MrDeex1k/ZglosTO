# Wybór wdrożenia

Masz już [konfigurację miasta](white-label-configuration.md). Teraz wybierz środowisko,
które operator potrafi utrzymać i odtworzyć po awarii. Ten przewodnik porównuje dostępne
profile ZgłosTO; instrukcje wykonawcze znajdziesz przy każdym wariancie.

**Punkt wyjścia: produkcyjny Docker Compose na jednym hoście**, jeżeli to pierwsza
instalacja miasta, nie masz utrzymywanego klastra i akceptujesz przerwę na odtworzenie
hosta. To podstawowy profil pierwszych wdrożeń opisany w
[runbooku operatora](production-compose-runbook.md), nie deklaracja wysokiej dostępności.

## Najpierw wybierz scenariusz

1. **Chcesz tylko uruchomić aplikację na komputerze?** Przejdź do
   [uruchomienia lokalnego](local-development.md). Developerski Compose nie jest
   gotową konfiguracją publicznej produkcji.
2. **Masz jeden serwer i nie potrzebujesz Kubernetes?** Wybierz
   [produkcyjny Compose](production-compose-runbook.md).
3. **Potrzebujesz środowiska Kubernetes, ale masz jeden węzeł?** Rozważ
   `k3s-single-node`. Zyskujesz obsługę manifestów Kubernetes, nie odporność na utratę hosta.
4. **Operator już utrzymuje klaster?** Wybierz `kubernetes` albo `k3s`, zgodnie z jego
   platformą. Przed wdrożeniem uzgodnij storage, ingress, Redis i kontrolery.
5. **Wymagane jest odzyskanie działania po utracie węzła?** Oceń `k3s-ha`, dostępność
   usług zewnętrznych oraz zmierz czas przełączenia. Jeśli wymogiem jest brak przerwy,
   obecny profil nie daje takiej gwarancji.

K3s nie jest alternatywą dla API Kubernetes: jest jego lekką dystrybucją. W repozytorium
nazwy `kubernetes` i `k3s` oznaczają różne zestawy założeń infrastrukturalnych, m.in.
klasę storage i dostarczane kontrolery. [Dokumentacja K3s](https://docs.k3s.io/).

## Porównanie profili ZgłosTO

| Wariant             | Kiedy go wybrać                                                  | Główne ograniczenie                                                                         |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Produkcyjny Compose | Pierwsza instalacja, jeden host i prostsze utrzymanie            | Utrata hosta wymaga odtworzenia; backup potrzebuje okna utrzymaniowego.                     |
| `k3s-single-node`   | Jeden węzeł i świadoma potrzeba pracy z Kubernetes               | Jedna replika każdej usługi, lokalne dane, brak HPA/KEDA.                                   |
| `k3s`               | Utrzymywany klaster K3s i wiele replik aplikacji                 | Domyślny `local-path` nie zapewnia HA danych.                                               |
| `kubernetes`        | Istniejąca platforma Kubernetes obsługiwana przez operatora      | Dostępność danych zależy od rzeczywistego storage; nazwa `standard` niczego nie gwarantuje. |
| `k3s-ha`            | Przygotowana infrastruktura do odzyskania pracy po utracie węzła | Wymaga Longhorn i zewnętrznych S3/Redis; procesy bazy i kolejki nadal są pojedyncze.        |

Nie dobieraj profilu wyłącznie na podstawie liczby mieszkańców. Uwzględnij ruch,
rozmiary zdjęć, retencję danych, wymagania modelu LLM oraz dostępność administratora.
Wymiarowanie wymaga pomiarów konkretnej konfiguracji; zobacz
[lokalny pomiar zasobów](phase-12-local-resource-sizing.md) i
[plan certyfikacji](phase-12-certification-plan.md). Wyniki lokalne nie są SLA produkcji.

## Compose: pierwszy host produkcyjny

Ten wariant obejmuje HTTPS, plikowe sekrety, trwałe dane, kontrolowany build,
aktualizacje i odtwarzanie. Operator utrzymuje system hosta, Docker, certyfikaty,
monitoring oraz kopie poza maszyną. Compose może służyć produkcji, ale wymaga ustawień
innych niż developerskie. [Dokumentacja Docker](https://docs.docker.com/compose/how-tos/production/).

W ZgłosTO używaj procedury `scripts/production-compose.sh`, a nie lokalnego
`docker compose up -d --build` jako instrukcji publikacji. Storage, Redis,
obserwowalność i LLM dobiera się oddzielnie do wybranego wariantu.

**Dalej:** [wdrożenie Compose](production-compose-runbook.md), następnie
[backup i odtwarzanie](backup-restore.md).

## K3s na jednym węźle

Profil `k3s-single-node` uruchamia po jednej replice usług aplikacyjnych, wyłącza Redis
i autoskalowanie HPA/KEDA. Gateway pozostaje uruchomiony z `LLM_RUNTIME=disabled`.
Nie należy mylić tego profilu ze standardowym `k3s`, który zakłada wiele replik.

Referencyjny wariant wymaga zewnętrznego S3; używa `local-path` dla lokalnych wolumenów.
Nadal potrzebujesz cert-manager, Reloadera, ingressu oraz egzekwowania NetworkPolicy.
Jednowęzłowy klaster jest dodatkową warstwą utrzymania, nie sposobem na obejście
backupów czy okien serwisowych.

**Dalej:** [profile i procedury klastrowe](infrastructure-profiles.md).

## Standardowy Kubernetes lub K3s

Oba warianty obsługują wiele replik aplikacyjnych oraz HPA/KEDA. Przy wielu replikach
backendu i Authorization wymagany jest Redis `local` albo `external`, aby zachować
wspólny stan limitera. Bazowego overlayu z wyłączonym Redis nie traktuj jako gotowego
profilu wieloreplikowej produkcji.

- `kubernetes`: operator dostarcza Traefik, odpowiednio skonfigurowaną klasę `standard`
  i Metrics Server.
- `k3s`: profil korzysta z pakietowego Traefika, Metrics Server i `local-path`.
- Oba wymagają m.in. cert-manager, Reloadera, KEDA/HTTP Add-on oraz sieci egzekwującej
  NetworkPolicy; sekrety, domeny i endpointy pozostają zadaniem operatora.

Domyślne preferowane rozłożenie podów między węzłami nie gwarantuje, że każda replika
trafi na inną maszynę. Dwie repliki frontendu nie zabezpieczają pojedynczej bazy danych.

**Dalej:** [profile infrastruktury](infrastructure-profiles.md) oraz
[techniczna instrukcja klastra](../k8s/README_K8s.md). Ta druga obejmuje również scenariusze
testowe; nie zastępuje odbioru produkcyjnego.

## K3s HA: co jest replikowane, a co nie

Profil `k3s-ha` wymaga przygotowania co najmniej trzech serwerów embedded-etcd oraz
Longhorn z trzema gotowymi węzłami i dyskami. HA control plane K3s z embedded-etcd
wymaga co najmniej trzech serwerów; kolejne rozmiary dobiera się z zachowaniem quorum.
[Dokumentacja K3s HA](https://docs.k3s.io/datastore/ha-embedded).

W profilu aplikacji:

- backend, Authorization, frontend, Nginx i PgBouncer mają minimum dwie repliki
  i ścisłe rozłożenie między węzłami;
- wolumeny PostgreSQL i RabbitMQ korzystają z `zglosto-ha`: Longhorn utrzymuje trzy
  repliki danych, a polityka `Retain` chroni przed automatycznym usunięciem wolumenu;
- PostgreSQL i RabbitMQ nadal mają po jednym procesie — nie jest to klaster PostgreSQL
  ani quorum RabbitMQ;
- S3 i Redis są zewnętrzne i wymagają własnych gwarancji dostępności.

Po awarii konieczne może być ponowne uruchomienie poda i dołączenie wolumenu.
Operator musi przetestować politykę obsługi niedostępnego węzła; bez niej może być
potrzebna interwencja ręczna. Sama definicja StorageClass nie instaluje Longhorn.

**Dalej:** [walidacja HA, migracja storage i odtwarzanie K3s](infrastructure-profiles.md).

## Sprawdź profil bez wdrażania

Z katalogu głównego repozytorium, z Bun zgodnym z projektem i `kubectl` zawierającym
Kustomize, możesz uruchomić statyczne kontrole:

```bash
bun scripts/check-cluster-production.ts k8s/overlays/kubernetes-redis-external
bun scripts/check-cluster-production.ts k8s/overlays/k3s-redis-external
bun scripts/check-cluster-production.ts k8s/overlays/k3s-single-node
bun scripts/check-cluster-production.ts k8s/overlays/k3s-ha --ha
```

Polecenia renderują lokalne manifesty i sprawdzają politykę replik, Redis oraz HA.
Nie stosują zasobów i nie kontaktują się z klastrem. Sukces nie potwierdza gotowości
DNS, sekretów, obrazów, kontrolerów czy dysków. Referencyjne domeny `example.invalid`
trzeba zastąpić przed rzeczywistym wdrożeniem.

`deploy.sh` zmienia zasoby klastra — uruchamiaj go dopiero według instrukcji profilu.
Skrypt obsługuje obecnie kanoniczny namespace `zglosto`; przekazanie nazwy innego miasta
nie tworzy automatycznie odseparowanej instalacji.

## Ustal warunki odbioru

Przed wyborem produkcyjnym zapisz:

- kto utrzymuje host lub klaster, storage, certyfikaty i usługi zewnętrzne;
- ile przerwy można zaakceptować i ile danych można utracić — docelowe RTO i RPO;
- gdzie znajduje się zaszyfrowana kopia poza infrastrukturą aplikacji;
- jak odtworzysz jednocześnie bazę, zdjęcia, konfigurację i sekrety;
- jak sprawdzisz logowanie, upload i obsługę zgłoszenia po aktualizacji lub awarii.

Replikacja nie zastępuje backupu. Snapshot etcd nie zawiera danych PVC ani zdjęć w S3.
Zmiana `local-path` na Longhorn nie migruje istniejących danych: wymaga przygotowania
nowych wolumenów i kontrolowanego odtworzenia. Przejście na single-node również wymaga
planu usunięcia wcześniejszych zasobów autoskalowania; samo `apply` ich nie usuwa.

Zakończ wybór wskazaniem profilu i przejdź do jego instrukcji:
[Compose](production-compose-runbook.md) albo [Kubernetes/K3s](infrastructure-profiles.md).
Każdy wariant zamyka dopiero [odbiór instalacji White-Label](phase-12-white-label-rollout.md).
