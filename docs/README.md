# Indeks dokumentacji ZgłosTO

Dokumentacja jest podzielona według roli. Dokument historyczny nie jest źródłem prawdy o
bieżącym runtime, nawet jeżeli pozostaje w pierwotnej ścieżce wymaganej przez ADR, test lub
release gate.

## A. Bieżące źródła prawdy

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

- [uruchomienie lokalne](local-development.md) — pełny start Docker Compose, demo Mobile,
  profile opcjonalne, testy i troubleshooting;
- [przekazanie Mobile](../Mobile/CLIENT_HANDOFF.md),
  [Quick Start](../Mobile/QUICK_START.md) i
  [konfiguracja klienta](../Mobile/CLIENT_CONFIGURATION.md);
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
- [runbook certyfikacji per klient](phase-12-operations-runbook.md) i
  [plan certyfikacji](phase-12-certification-plan.md).

## D. Archiwum zakończonych faz

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
