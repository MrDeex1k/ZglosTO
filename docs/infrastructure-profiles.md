# Profile Docker, Kubernetes i K3s

## Wprowadzone zmiany

- Konteksty obrazów backendu i gatewaya zawierają `@zglosto/workload-auth`.
  `check:image-contract` sprawdza także przechodnie zależności workspace w kontekstach.
- Backup Compose zatrzymuje wszystkie procesy zapisujące, włącznie z replikami workera.
  Wznowienie używa istniejących kontenerów; nie zmienia liczby replik przez `compose up`.
- Restore nie uruchamia aplikacji przed audytem bazy i obiektów; błąd pozostawia ją zatrzymaną.
- PostgreSQL ma jeden scheduler pg_cron: full w niedzielę o 02:00, diff codziennie o 03:00,
  według strefy czasowej pg_cron. ConfigMap pgBackRest zachowuje retencję 4 full / 14 diff.
  Usunięto drugi scheduler i nieużywaną kopię skryptów inicjalizacji w ConfigMap.
- Kubernetes używa Traefik; profil K3s nadal używa kontrolera dostarczanego przez K3s.
- Standardowe profile mają minimum dwie repliki auth i preferowane rozłożenie replik
  backendu, auth, frontendu, Nginx i PgBouncera między węzłami.

Nie zmieniono limitów pamięci/CPU ani powtórnej instalacji pnpm podczas buildów. Te zmiany
wymagają pomiarów na docelowym hoście oraz potwierdzenia zachowania zależności workspace.
Backup Compose nadal wymaga okna utrzymaniowego — skrócenie go wymaga spójnego snapshotu
bazy i wersjonowanego magazynu obiektów, a nie pozostawienia procesów zapisujących w ruchu.

## Wybór profilu

| Profil            | Repliki aplikacyjne                    | Redis                          | Skalowanie                        | Storage                                      |
| ----------------- | -------------------------------------- | ------------------------------ | --------------------------------- | -------------------------------------------- |
| `kubernetes`      | minimum 2 auth/backend/frontend        | local lub external w produkcji | HPA + KEDA                        | `standard`, dobierany przez operatora        |
| `k3s`             | jak Kubernetes                         | local lub external w produkcji | HPA + KEDA                        | `local-path`, bez HA danych                  |
| `k3s-single-node` | jedna na usługę                        | disabled                       | stała liczba replik, bez HPA/KEDA | `local-path`, bez odporności na utratę hosta |
| `k3s-ha`          | minimum 2, ścisłe rozłożenie aplikacji | external                       | HPA + KEDA                        | `zglosto-ha`, Longhorn, 3 repliki danych     |

`k3s-single-node` nadal uruchamia jedną lekką replikę gatewaya z `LLM_RUNTIME=disabled`.
Backend łączy się bezpośrednio z gatewayem przez mTLS, bez KEDA HTTP interceptora;
wyłączony model zwraca kontrolowany fallback. NetworkPolicy dopuszcza tylko tę ścieżkę.
Profil nadal wymaga cert-manager i Reloadera. PDB pozwalają na zatrzymanie pojedynczej
repliki podczas prac utrzymaniowych; nie deklarują ciągłej dostępności.

`k3s-ha` jest wariantem odzyskania działania po utracie węzła. PostgreSQL i RabbitMQ nadal
mają po jednym procesie z replikowanym wolumenem. Nie jest to synchroniczny klaster
PostgreSQL ani quorum RabbitMQ; przełączenie wymaga ponownego uruchomienia poda i
dołączenia wolumenu. Operator musi skonfigurować i przetestować politykę Longhorn/Kubernetes
dla niedostępnego węzła. Bez tego może być potrzebna interwencja ręczna.

Longhorn musi być zainstalowany oddzielnie, z trzema gotowymi węzłami i dyskami.
StorageClass nie instaluje sterownika. Wymusza trzy repliki i wyłącza miękką anti-affinity
replik wolumenu; dane nie mogą być zredukowane do trzech kopii na jednym węźle.
Redis i S3 muszą mieć własne gwarancje dostępności i kopie poza klastrem.

## Wdrożenie i walidacja

`deploy.sh` przyjmuje dotychczasowe argumenty oraz zmienne `CLUSTER_PROFILE`, `REDIS_MODE`
i opcjonalnie `KUSTOMIZE_OVERLAY`. Domyślny profil Kubernetes składa istniejący overlay
storage/observability z komponentem Redis external. Przed zastosowaniem manifestów
sprawdza zgodność liczby replik z limiterem. Tryb lokalny wymaga `REDIS_MODE=local`.

```bash
# Tylko walidacja, bez kontaktu z klastrem:
node scripts/check-cluster-production.ts k8s/overlays/kubernetes-redis-external
node scripts/check-cluster-production.ts k8s/overlays/k3s-single-node
node scripts/check-cluster-production.ts k8s/overlays/k3s-ha --ha

# Wdrożenie po podmianie domeny/endpointów i przygotowaniu obrazów oraz sekretów:
CLUSTER_PROFILE=kubernetes REDIS_MODE=external ./deploy.sh zglosto RELEASE
CLUSTER_PROFILE=k3s-single-node ./deploy.sh zglosto RELEASE
CLUSTER_PROFILE=k3s-ha ./deploy.sh zglosto RELEASE
```

`RELEASE` zastępuje się rzeczywistym tagiem przygotowanych obrazów. Profile referencyjne
zawierają domeny `example.invalid`, więc nie przechodzą bramki rzeczywistego wdrożenia.
Własny overlay można wskazać przez `KUSTOMIZE_OVERLAY`; należy ustawić odpowiadający mu
`REDIS_MODE`. HA używa zewnętrznego S3/Redis; dodatkową obserwowalność składa się we własnym
overlayu. Preflight `scripts/check-k3s-ha.sh` sprawdza trzy gotowe serwery embedded-etcd
i trzy węzły Longhorn z dyskami dopuszczonymi do planowania.

Zmiana `local-path` na Longhorn nie migruje istniejących PVC. Wariant HA należy wdrożyć
na nowych wolumenach i odtworzyć dane ze zweryfikowanej kopii. StatefulSet nie pozwala
zwyczajnie podmienić istniejących `volumeClaimTemplates`.

Przejście istniejącej instalacji na `k3s-single-node` wymaga usunięcia wcześniejszych
HPA, ScaledObject, TriggerAuthentication, InterceptorRoute oraz Service/llm-gateway-proxy
w kontrolowanym oknie utrzymaniowym. Samo `kubectl apply` nie usuwa zasobów pominiętych
w nowym renderze. Nie należy kasować CRD KEDA używanych przez inne aplikacje.

## Migracja Kubernetes z ingress-nginx

Kontroler ingress-nginx zakończył utrzymanie w marcu 2026 r. Nie dotyczy to Nginx
wewnątrz aplikacji, który nadal odpowiada za routing same-origin i cache publicznej listy.

Zainstaluj Traefik w osobnym namespace i przygotuj jego publiczny adres:

```bash
helm upgrade --install traefik oci://ghcr.io/traefik/helm/traefik \
  --namespace traefik --create-namespace --version 41.4.0 \
  --values k8s/traefik-values.yaml --wait --timeout 5m
```

Przed przełączeniem produkcji sprawdź certyfikat, routing hosta, login/cookie,
rzeczywisty adres klienta dla limitera, upload zdjęć i dostępność API przez nowy adres.
Zsynchronizuj zmianę klasy Ingress i NetworkPolicy z przełączeniem DNS/load balancera.
Stary kontroler usuń dopiero po potwierdzeniu ruchu przez Traefik. Rollback routingu wymaga
przywrócenia poprzedniego Ingressu, polityki sieciowej i publicznego adresu.
W K3s używaj kontrolera pakietowego; nie instaluj drugiej kopii z powyższego polecenia.

## Backup i odtworzenie control plane K3s

Kopia PostgreSQL nie odtwarza obiektów Kubernetes, sekretów ani PKI klastra. Dla embedded-etcd
wykonaj na serwerze K3s, z uprawnieniami do katalogu danych:

```bash
sudo ./scripts/backup-k3s-control-plane.sh /mnt/encrypted-offsite/k3s/2026-09-05
```

Katalog docelowy musi być nowy. Skrypt zapisuje snapshot etcd, token serwera, konfigurację,
wersję K3s i sumy SHA-256. Odmawia sukcesu, gdy token zmieni się podczas snapshotu.
Zmienne `K3S_DATA_DIR` i `K3S_CONFIG_DIR` obsługują instalacje z innymi ścieżkami.
Skrypt nie sprawdza, czy mount rzeczywiście znajduje się poza hostem: operator musi
zapewnić szyfrowany nośnik zewnętrzny, kontrolę dostępu i retencję katalogów backupu.
Brak `SHA256SUMS` albo niezerowy kod wyjścia oznacza niekompletną kopię.

Odtwarzanie embedded-etcd na izolowanej infrastrukturze:

1. Zweryfikuj `sha256sum --check SHA256SUMS` w katalogu kopii. Przygotuj odpowiednią wersję
   K3s i parametry sieci. Nie wypisuj tokena w terminalu ani w logach.
2. Zatrzymaj K3s na serwerach. Przywróć token jako plik chroniony przed odczytem innych
   użytkowników; przejrzyj konfigurację przed użyciem na nowych hostach.
3. Na pierwszym serwerze wykonaj `k3s server --cluster-reset
--cluster-reset-restore-path=/ABSOLUTE/PATH/TO/SNAPSHOT --etcd-s3=false
--token-file=/ABSOLUTE/PATH/TO/server-token`, zachowując właściwy `--data-dir`.
4. Uruchom pierwszy serwer normalnie, a następnie dołącz pozostałe zgodnie z procedurą
   K3s dla odtwarzania wielu serwerów. Nie usuwaj katalogów peerów przed zweryfikowaniem kopii.
5. Odtwórz osobno PostgreSQL i obiekty S3; snapshot etcd nie zawiera danych PVC.
   Sprawdź spójność obrazów, sekrety, certyfikaty, logowanie i zapis zgłoszenia.
6. Zmierz RTO/RPO oraz utratę jednego węzła z rzeczywistą konfiguracją Longhorn.

Skrypt snapshotu nie obsługuje SQLite. Dla standardowego jednowęzłowego K3s z SQLite
stosuj kopię datastore i tokena po zatrzymaniu usługi według dokumentacji K3s.

## Testy

`pnpm test:infrastructure` sprawdza rzeczywiste rendery Kustomize oraz izolowane scenariusze
skryptów z atrapą Docker: sukces, błąd backupu, nieudany audyt restore i wymuszone zabicie
workera. Testy nie zastępują rzeczywistego backup/restore na kontenerach.
`scripts/test-cluster-profile.sh` instaluje Traefik dla Kind i sprawdza również routing przez
kontroler ingress. Pełne testy wymagają działającego Docker Engine i kontrolerów klastra.

Źródła: [Kubernetes o wycofaniu ingress-nginx](https://kubernetes.io/blog/2026/03/30/kubernetes-v1-36-sneak-peek/),
[Traefik Helm](https://github.com/traefik/traefik-helm-chart),
[parametry Longhorn](https://longhorn.io/docs/1.12.1/references/storage-class-parameters/),
[snapshot i restore K3s](https://docs.k3s.io/cli/etcd-snapshot).
