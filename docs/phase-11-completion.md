# Faza 11 — podsumowanie i dowody zakończenia

## Wynik

Faza 11 została zakończona 2026-07-26: wykonano **14/14 kroków**. ZgłosTO ma produkcyjny,
modułowy profil Docker Compose budowany natywnie ze źródeł na serwerze instalacji, bez
własnego registry i bez GitHub-hosted runnera.

## Dostarczone elementy

- audyt i docelowe budżety ośmiu obrazów;
- minimalne runtime'y non-root, healthchecki i test docelowych obrazów;
- lokalny pipeline `amd64`/`arm64` z niezmiennymi tagami, manifestem, CycloneDX i Trivy;
- `images.env` jako jedyne źródło ośmiu lokalnych referencji oraz `pull_policy: never`;
- 54 warianty modułów z domyślnym RustFS i bez trybu `both`;
- hardening rdzenia i modułów: read-only rootfs, tmpfs, drop capabilities,
  `no-new-privileges`, limity, rotacja logów, shutdown i healthchecki;
- publiczny HTTPS-only, hostowy nftables i utwardzona jednostka systemd;
- workflow `validate -> backup -> migrate -> wait -> smoke -> promote`;
- automatyczne odzyskanie ostatniego promowanego wydania po błędzie kandydata;
- retencja wyłącznie aktywnych obrazów oraz jawny rollback przez build wcześniejszego tagu;
- lokalne bramki statyczne, walidacyjne i runtime oraz negatywne testy polityk;
- runbook Compose i handoff lokalnych obrazów do opcjonalnego K3s.

Izolowany test runtime potwierdził start i stan `healthy` sześciu utwardzonych usług
lokalnej obserwowalności: OTel Collector, Prometheus, Loki, Tempo, Alertmanager i Grafana.
Po teście kontenery, sieć i testowe wolumeny zostały usunięte.

Historyczny maszynowy kontrakt ukończenia fazy został usunięty po zamknięciu migracji. Bieżące
reguły wydania są sprawdzane bezpośrednio przez główny `pnpm check`.

Metadane wydania i White-Label pozostają w manifeście lokalnego builda. Etykiety obrazów
zostały świadomie odroczone do czasu wdrożenia rzeczywistego CI/CD i publikacji obrazów.

## Świadomie poza zakresem

Faza 11 nie deklaruje jeszcze zmierzonej gotowości produkcyjnej konkretnego miasta.
Rzeczywista instalacja, DNS, publiczne certyfikaty, zewnętrzna kopia backupu, restore drill,
awarie, RTO/RPO, load/soak, pojemność Nginx, dostrojenie PgBouncera i parametry
autoskalowania wymagają środowiska docelowego i należą do Fazy 12.

Docker Compose jest profilem głównym. K3s jest opcjonalnym następnym profilem, a ogólny
Kubernetes pozostaje zamrożony. Faza 12 certyfikuje najpierw Compose i nie może być
blokowana pracą nad infrastrukturą, której małe wdrożenia jeszcze nie potrzebują.
