# Bun — faza 5: wdrożenie i odbiór

Data: 2026-09-13. Branch: `chore/bun-migration`. Implementacja narzędzi odbioru jest dostępna; pełna certyfikacja produkcyjna pozostaje otwarta.

## Zmiany

- Dodano powtarzalny drill Compose: archiwizacja exact tagu, odtworzenie całych poprzednich obrazów, integracja kandydata, przełączenia Node/Bun na tej samej bazie, porównanie trzech serii oraz soak.
- Pomiar runtime używa bezpośredniego odczytu backendu na porcie loopback. Istniejący scenariusz publiczny mierzy głównie cache Nginx i nie służy jako dowód wydajności Bun.
- Bramka porównuje mediany p95 i RSS każdej usługi; wzrost powyżej 10%, błędy żądań lub niekompletne pomiary blokują lokalny odbiór.
- Test Kubernetes/K3s ma odrębne porty oraz potwierdza związanie port-forwardu przed żądaniami HTTP. Test regresji odrzuca sytuację, w której port-forward nie wystartował, lecz inny serwer odpowiada. Ma prywatny kubeconfig i katalogi Helm, odrzuca istniejący klaster, przypina obrazy kandydata oraz włącza Redis dla replik. Przed utworzeniem klastra sprawdza docelowy kontrakt ośmiu obrazów.
- Żywy test wykrył cykliczną zależność sondy Redis od Service bez gotowych endpointów. Sonda używa teraz localhost. Timeout sond mTLS wynosi 5 s wobec 4 s klienta, a readiness backendu ma czas na kontrolę zależności.
- Health gatewaya skalowanego do zera normalizuje błędy połączenia 502/504 do 503. Smoke nadal odrzuca niedostępność, jeśli istnieje gotowa replika gatewaya.
- Kind wymaga 0.32.0, ponieważ 0.31.0 odrzuca konfigurację containerd v4 przypiętego obrazu węzła. Nie zmieniono globalnej instalacji narzędzi.
- Audyt obrazów obsługuje również pominięte pole `Config.Labels` jako pusty zestaw. Lista wymaganych etykiet i pozostałe wymagania pozostają egzekwowane.
- Długie testy obciążenia obliczają maksimum iteracyjnie, bez rozwijania wszystkich próbek w argumentach funkcji.

## Potwierdzone kontrole

- `bun run check` przeszedł. Nowe testy polityki obejmują oba rendery klastra, brakujące wyniki, błędy żądań i regresję pojedynczej usługi. Nowe skrypty mają osobny typecheck.
- Docelowy audyt ośmiu obrazów arm64 przeszedł. Rozmiary MB: authorization 125.1, backend 180.5, gateway 117.2, frontend 14.3, database 299.5, PgBouncer 17.5, RabbitMQ 160.6, nginx 13.2. Macierz arm64/emulowane amd64 usług i frontendu pozostaje udokumentowana w fazie 4.
- Odbudowano authorization, backend/workera, gateway i frontend z tagu `v1.0.0`, commit `88cf2ec6d03b324e63354b4f22cb121995792fc6`. Nie zmieniano archiwum ani jego przypiętych zależności.

## Kubernetes i K3s

Świeży test K3s 1.36.4 przez k3d 5.9.0 zakończył się kodem 0: żywe CRD i kontrolery, readiness, routing, anonimowa granica autoryzacji, certyfikaty/KEDA, odtworzenie podów, zachowany znacznik PostgreSQL, reakcja Reloader i rzeczywisty ingress Traefik. Klaster testowy został usunięty.

Końcowy, odrębny test Kubernetes 1.35.8 przez kind 0.32.0 również zakończył się kodem 0. Objął dodatkowo sprawdzenie Redis z backendu i potwierdzenie własności port-forwardu. Klaster został usunięty. Wcześniejsze próby wykryły niezgodność kind/containerd, sondy i kolizję portów; ich nieudane wyniki nie są liczone jako odbiór.

## Compose, rollback i pomiary lokalne

Drill zakończył się kodem 0. Integracja kandydata przeszła, po czym wykonano trzy powroty do kompletu obrazów Node odtworzonych z tagu i trzy przełączenia na Bun. Zachowano bazę ze znacznikiem trwałości; sprawdzono faktyczny runtime czterech procesów usług oraz granicę dostępu anonimowego. Stack testowy został usunięty.

P95 bezpośredniego odczytu backendu: Node 8/8/8 ms, Bun 7/6/7 ms. Stosunek median Bun/Node wyniósł 0.875. Stosunki RSS: backend 0.946, authorization 0.646, media worker 1.015, gateway 0.793. Lokalna bramka 1.10 przeszła.

Soak trwał 300 s: 105 529 żądań, 0 błędów, p50 4 ms, p95 16 ms, p99 53 ms. Dowody lokalne: `.state/bun-migration/1789258223291/report.json` i pliki prób w tym katalogu. To krótka próba OrbStack arm64, wykonywana podczas prac nad klastrami na tej samej VM, a nie izolowany benchmark produkcyjny ani dowód przewagi samego runtime. Porównano całe wydania, również różniące się zależnościami.

Pierwszą serię przez cache Nginx przerwano i oznaczono jako nieważną; nie służy do odbioru wydajności.

## Otwarte bramki

Audyt wydaniowy nadal zwraca advisory dla `@xmldom/xmldom`, `js-yaml`, `multer` i `qs`; kod wyjścia 1. Nie dodano wyjątków ani nie aktualizowano bibliotek w ramach tej fazy.

Natywny amd64, godzinny soak i pełna certyfikacja rzeczywistego hosta/profile'u klienta, w tym sesje i rotacja certyfikatów przy rollbacku, wymagają osobnych dowodów. Kandydat pozostaje niezacommitowany, więc produkcyjna bramka czystego exact tagu również nie jest spełniona. Docs-site pozostaje w stashu, a wcześniejsze wyniki Expo Doctor nie zostały zastąpione nowym odbiorem Mobile.

Procedury i polecenia: [runbook odbioru i rollbacku](bun-deployment-runbook.md). Lokalny raport zawsze zawiera `productionCertified: false`.
