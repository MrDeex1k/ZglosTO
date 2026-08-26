# Faza 9 / krok 3 — profile Kustomize dla Kubernetes i K3s

## Status

**Wdrożony 2026-07-24.**

Krok oddziela wspólny kontrakt aplikacji od decyzji zależnych od dystrybucji klastra.
`k8s/base` pozostaje neutralną bazą, a overlaye wybierają ingress, storage i wymagane
komponenty platformowe. Nie dodaje jeszcze brakujących workloadów PgBouncer, RabbitMQ i
`media_worker`; jest to zakres kroków 5-6.

## Struktura

```text
k8s/
├── base/
│   ├── config/
│   ├── ingress/
│   ├── network/
│   ├── services/
│   ├── storage/
│   └── kustomization.yaml
└── overlays/
    ├── kubernetes/
    │   ├── ingress.yaml
    │   ├── storage-class.yaml
    │   ├── *-network-policy.yaml
    │   └── kustomization.yaml
    └── k3s/
        ├── ingress.yaml
        ├── storage-class.yaml
        ├── *-network-policy.yaml
        └── kustomization.yaml
```

Baza nie zawiera `ingressClassName`, `storageClassName` ani adnotacji konkretnego
kontrolera ingress. Overlaye używają aktualnego pola `patches`; nie korzystają z
przestarzałych `bases`, `commonLabels`, `patchesStrategicMerge` ani `patchesJson6902`.

## Jawne decyzje profili

Maszynowym źródłem prawdy jest `deploy/cluster-profiles.json`.

| Decyzja                | Kubernetes                         | K3s                                      |
| ---------------------- | ---------------------------------- | ---------------------------------------- |
| ingress                | ingress-nginx, klasa `nginx`       | pakietowy Traefik, klasa `traefik`       |
| namespace ingress      | `ingress-nginx`                    | `kube-system`                            |
| storage                | klasa `standard`                   | pakietowa klasa `local-path`             |
| metryki zasobów        | wymagany Metrics Server            | pakietowy Metrics Server                 |
| autoskalowanie kolejki | wymagany KEDA                      | KEDA instalowane jako zewnętrzny dodatek |
| certyfikaty            | wymagany cert-manager              | cert-manager jako zewnętrzny dodatek     |
| topologia              | wielowęzłowa, zależna od operatora | single-node albo HA                      |

KEDA i cert-manager nie są jeszcze instalowane przez ten krok. Kontrakt odrzuca brak jawnej
decyzji, ale ich manifesty i konfiguracja pojawią się odpowiednio w krokach 8-9 oraz 7.
`standard` jest referencyjną klasą ogólnego klastra; operator innej platformy zmienia
wyłącznie patch overlayu i odpowiadający mu kontrakt, nie bazę.

NetworkPolicy dopuszcza publiczny ruch do projektowego Nginx wyłącznie z wybranego
kontrolera ingress:

- `ingress-nginx` w namespace `ingress-nginx` dla Kubernetes;
- Traefik w namespace `kube-system` dla K3s.

Szczegółowe reguły przepływów między wszystkimi usługami zostaną domknięte w kroku 7.

## K3s single-node

Wariant single-node ma jeden serwer K3s i nie jest odporny na utratę hosta. Pakietowe
`local-path` wiąże dane z tym węzłem. Jest właściwy dla małych instalacji akceptujących
przerwę i odtworzenie z backupu.

Wymagania:

- jeden jawnie utrzymywany serwer;
- backup poza hostem dla PostgreSQL i Object Storage;
- udokumentowane RTO/RPO oraz procedura odtworzenia całej maszyny;
- brak deklaracji HA, nawet jeśli workload ma więcej niż jedną replikę.

## Rekomendowany K3s HA

Kontrakt HA zakłada co najmniej trzy serwery K3s z embedded etcd, stały adres rejestracji
przed serwerami oraz storage workloadów odporny na utratę węzła. Sama wielowęzłowa warstwa
control plane nie zapewnia trwałości PostgreSQL ani zdjęć.

Profil może deklarować odporność na awarię pojedynczego hosta dopiero po spełnieniu łącznie:

- minimum trzech serwerów i poprawnego quorum embedded etcd;
- stałego endpointu/API przed serwerami;
- rozłożenia replik i PodDisruptionBudget między węzłami;
- zewnętrznego albo replikowanego storage dla danych aplikacji;
- off-host backupu i przejścia testu utraty węzła w Fazie 12.

Do czasu realizacji storage, anti-affinity i testów awarii w kolejnych krokach jest to
kontrakt docelowy, a nie bieżąca gwarancja HA.

## Walidacja

```bash
kubectl kustomize k8s/overlays/kubernetes
kubectl kustomize k8s/overlays/k3s
pnpm check:deployment-baseline
```

Walidator:

- renderuje każdy overlay dwukrotnie i porównuje wynik;
- sprawdza workloady, ServiceAccount, wspólne etykiety i zakazane komponenty;
- egzekwuje właściwe klasy ingress i storage;
- sprawdza selektory namespace kontrolerów ingress;
- odrzuca platformowe decyzje w bazie i przestarzałe pola Kustomize;
- weryfikuje, że tylko wariant K3s HA może deklarować odporność na utratę hosta.

Walidacja API względem rzeczywistego serwera oraz `kubectl diff` pozostają częścią
instalacji na ephemeralnym klastrze w kroku 14 i certyfikacji Fazy 12. Sam
`kubectl apply --dry-run=client` bez dostępu do discovery API nie jest traktowany jako dowód
zgodności klastra.
