# Indeks dokumentacji ZgłosTO

Dokumentacja jest podzielona według roli. Dokument historyczny nie jest źródłem prawdy o
bieżącym runtime, nawet jeżeli pozostaje w pierwotnej ścieżce wymaganej przez ADR, test lub
release gate.

## A. Bieżące źródła prawdy

Serwis `/docs` publikuje wybrane źródła bez ich duplikowania. Zakres i zasady publikacji
opisuje [README serwisu](../docs-site/README.md), a komplet stron wybiera
[`content-map.mjs`](../docs-site/content-map.mjs). Nawigacja rozdziela pierwsze kroki,
korzystanie z aplikacji, wdrożenie oraz materiały dla programisty, operatora i klienta
Mobile. [Macierz pokrycia](documentation-coverage-audit.md) zestawia ścieżki produktu ze
stronami; archiwum faz pozostaje w repozytorium.

- [README produktu](../README.md) — zakres produktu, model licencji i szybkie wejście;
- [audyt bieżącej architektury](current-architecture-audit.md) — wdrożony runtime i granice;
- [rejestr decyzji architektonicznych](architecture-decisions.md) — obowiązujące ADR-y;
- [baseline kontraktów API](api-contracts-baseline.md) — HTTP, role, sesje i błędy;
- [roadmapa produktu](roadmap-overview.md) — status faz i prace po `1.0.0`;
- [wydanie 1.0.0](release-1.0.0.md),
  [raport weryfikacji](release-1.0.0-verification.md),
  [manifest pierwszego commita](release-1.0.0-file-manifest.txt) i
  [procedura wydania](release-1.0-cleanup-plan.md);
- [polityka zależności](dependency-policy.md) i [zmienne środowiskowe](environment-variables.md);
- [akceptacja ryzyka `image-size`](security-risk-acceptance-image-size.md) — dokładny,
  wygasający wyjątek build-time dla Mobile;
- [stan Mobile](../Mobile/CURRENT_STATE.md) i [architektura Mobile](../Mobile/ARCHITECTURE.md).

## B. Instrukcje klienta

- [mieszkaniec WEB](using-web-resident.md), [służby WEB](using-web-service.md) i
  [administrator WEB](using-web-admin.md) — codzienne użycie paneli i granice ról;
- [mieszkaniec Mobile](using-mobile-resident.md) oraz
  [służby Mobile](using-mobile-service.md) — odpowiednie przepływy na telefonie;
- [uruchomienie lokalne](local-development.md) — pełny start Docker Compose, demo Mobile,
  profile opcjonalne, testy i troubleshooting;
- [konfiguracja miasta](white-label-configuration.md) — YAML, branding, służby, walidacja i build;
- [wybór wdrożenia](deployment-selection.md) — Compose, Kubernetes i K3s;
- [przekazanie Mobile](../Mobile/CLIENT_HANDOFF.md),
  [Quick Start](../Mobile/QUICK_START.md) i
  [konfiguracja klienta](../Mobile/CLIENT_CONFIGURATION.md);
- [build Mobile](mobile-build.md) — eksport JS, development client i dystrybucja klienta;
- [runbook produkcyjnego Compose](production-compose-runbook.md);
- [Kubernetes/K3s](../k8s/README_K8s.md) i
  [przekazanie lokalnych obrazów K3s](k3s-local-images-handoff.md);
- [rollout White-Label per klient](phase-12-white-label-rollout.md).

Każdy klient utrzymuje jedną, odseparowaną instancję dla jednego miasta, własne ENV,
sekrety, domenę, signing Mobile, backupy, aktualizacje i rollback. Publikacja sklepowa jest
opcjonalnym procesem klienta, nie częścią źródłowego wydania.

## C. Dokumentacja operacyjna

- [healthchecki](healthchecks.md), [smoke tests](compose-smoke-tests.md),
  [backup/restore](backup-restore.md) i [obrazy kontenerowe](container-images.md);
- [TLS/mTLS](transport-security.md), [Object Storage i baza](phase-3-database-object-storage.md),
  [Redis](redis-operations.md), [observability](observability.md) i
  [media worker](media-processing-contract.md);
- [granice frontendu i API](frontend-domain-boundary.md) oraz
  [handoff lokalnych obrazów K3s](k3s-local-images-handoff.md);
- [runbook certyfikacji per klient](phase-12-operations-runbook.md) i
  [plan certyfikacji](phase-12-certification-plan.md).

## D. Migracja na Bun

- [Plan migracji na Bun](bun-migration-plan.md) — historia etapów i decyzji;
  migracja jest wdrożona. Bieżące zasady opisuje [polityka zależności](dependency-policy.md),
  a wyniki [raport fazy 6](bun-phase6-results.md). Node pozostaje w toolchainie Expo/Metro.

## E. Archiwum zakończonych faz

Pliki `phase-0-*` … `phase-11-*` w tym katalogu oraz `Mobile/PHASE_*` są wersjonowanym
archiwum decyzji, odbiorów i dowodów. Zachowują pierwotne ścieżki, ponieważ odwołują się do
nich ADR-y, testy kontraktowe i skrypty. Ich statusy, wersje i sformułowania opisują moment
wykonania danej fazy i nie zastępują dokumentów z grupy A.

[Plan modernizacji](release.md) jest skonsolidowanym rejestrem historyczno-planistycznym:
Fazy 0–11 są zamknięte, Faza 12 jest wykonywana osobno dla instancji klienta, Faza 13
pozostaje po wydaniu, a Faza 14 opisuje późniejszy rozwój produktu.

## Decyzja o Trivy i SBOM

Od 2026-08-26 projekt nie używa Trivy ani nie wymaga generowania SBOM jako bramki wydania,
artefaktu publikacji lub obowiązku klienta. Wzmianki o tych narzędziach w dokumentach faz
historycznych opisują stan z chwili realizacji i nie są bieżącym wymaganiem. Kontrole kodu,
zależności, sekretów, obrazów, Compose i runtime pozostają obowiązkowe zgodnie z procedurą
wydania 1.0.0.

- [Bun — wdrożenie i wyniki fazy 2](bun-phase2-results.md).

- [Bun — runtime usług i wyniki fazy 3](bun-phase3-results.md).

- [Bun — narzędzia, buildy i wyniki fazy 4](bun-phase4-results.md).

- [Bun — odbiór wdrożenia i wyniki fazy 5](bun-phase5-results.md).
- [Bun — procedura odbioru i rollbacku](bun-deployment-runbook.md).

- [Bun — domknięcie migracji, faza 6](bun-phase6-results.md).
