# Faza 12 — runbook wykonania i dowodów

## Bezpieczne poziomy

Kontrole statyczne i odczyt hosta:

```bash
pnpm phase12:static
PHASE12_HOST_KIND=local-development pnpm phase12:host
pnpm phase12:dmr
```

Prawdziwy DNS, zaufany certyfikat publiczny, HSTS i publiczne sondy sprawdza:

```bash
PHASE12_PUBLIC_BASE_URL=https://zglosto.example.org pnpm phase12:edge
```

Testy integracyjne usuwają wyłącznie izolowane projekty i wolumeny o nazwach Fazy 12,
ale celowo niszczą dane wewnątrz nich. Wymagają jawnej zgody:

```bash
PHASE12_ALLOW_DESTRUCTIVE=1 pnpm phase12:integration:minimal
PHASE12_ALLOW_DESTRUCTIVE=1 pnpm phase12:integration:recommended
PHASE12_ALLOW_DESTRUCTIVE=1 pnpm phase12:load
PHASE12_ALLOW_DESTRUCTIVE=1 pnpm phase12:observability
```

Lokalny pomiar zasobów uruchamia te same izolowane scenariusze, ale dodatkowo próbkuje
`docker stats`. Profil `minimal` mierzy prawdziwy Docker Model Runner, a oba profile
wykluczają testowy `model_runner_stub`:

```bash
PHASE12_ALLOW_DESTRUCTIVE=1 pnpm phase12:resources:minimal
PHASE12_ALLOW_DESTRUCTIVE=1 pnpm phase12:resources:recommended
PHASE12_ALLOW_DESTRUCTIVE=1 pnpm phase12:resources:observability
```

Raporty trafiają do `.state/phase-12/resources/`. Są podstawą wstępnego sizingu, ale wynik
macOS/ARM64 z OrbStack nie zastępuje certyfikacji Ubuntu/AMD64 i nie obejmuje narzutu demona
Dockera, cache systemu plików ani hosta. Izolowany sizing podnosi limity zapisu wyłącznie
wewnątrz projektu testowego, aby mierzyć przepustowość zamiast ponownie testować osobną
bramkę rate limitingu.

Aktualny wynik, wymagania per konfiguracja oraz reguły interpretacji zawiera
[raport lokalnego sizingu](phase-12-local-resource-sizing.md).

Godzinny soak wykonuje się przeciwko już działającemu wdrożeniu akceptacyjnemu:

```bash
PHASE12_BASE_URL=https://zglosto.example.org pnpm phase12:soak
```

Dowody trafiają do prywatnego `.state/phase-12/<UTC>/`. Nie zawierają sekretów i nie są
commitowane.

## Produkcyjny host akceptacyjny

Na natywnym Ubuntu Server:

```bash
PHASE12_HOST_KIND=ubuntu-production \
PHASE12_EVIDENCE_FILE=/var/lib/zglosto-compose/evidence/host.json \
  node scripts/phase12-host-audit.ts
```

Następnie, na czystym zatwierdzonym tagu:

```bash
pnpm build:production -- --version <tag>
PRODUCTION_ENV_FILE=/etc/zglosto/production.env \
  ./scripts/production-compose.sh validate

PHASE12_ALLOW_DESTRUCTIVE=1 \
PHASE12_HOST_KIND=ubuntu-production \
PRODUCTION_GATE_RESTORE=1 \
  pnpm phase12:production
```

Ostatnie polecenie może wykonać restore i wolno je uruchamiać wyłącznie na stagingu albo
w zatwierdzonym oknie utrzymaniowym.

## Dowody wymagane do zamknięcia

- raport hosta Ubuntu;
- dokładny tag/revision i manifest ośmiu obrazów;
- wynik kontroli źródeł, zależności i kontraktów docelowych obrazów;
- log instalacji obu profili;
- publiczny certyfikat oraz test DNS/HTTPS bez prywatnego klucza w raporcie;
- wynik DMR z Gemma 3 1B;
- backup przechowywany poza hostem oraz udany restore;
- pomiary RPO i RTO;
- test upgrade, błędu kandydata i restartu hosta;
- testy awarii zależności i transportu;
- raport public-read, distributed incident-write, media backlog i 60-minutowy soak; realny
  DMR jest mierzony na prywatnej granicy, ponieważ klasyfikator nie ma publicznego endpointu;
- zaakceptowane wartości PgBouncera i limitów kontenerów;
- podpis operatora z datą.

## Interpretacja awarii

Redis może dać kontrolowany stan `degraded`, ale publiczny odczyt i lokalny rate limiting
muszą działać. LLM może zwrócić fallback, ale zgłoszenie musi zostać przyjęte. Niedostępny
RabbitMQ zatrzymuje publikację outboxa bez utraty rekordu, a po powrocie kolejki rekord jest
publikowany. Niedostępny RustFS może zablokować zapis zdjęcia, lecz nie może uszkodzić już
przechowywanych metadanych. Awaria PostgreSQL/PgBouncera powoduje `not ready` i nie może
prowadzić do potwierdzenia niezapisanego zgłoszenia.

Wewnętrzne certyfikaty są krótkotrwałe. Odwołanie awaryjne jest realizowane przez wymianę
CA/certyfikatów i kontrolowany recreate, ponieważ usługi Node nie polegają na zewnętrznym
OCSP. Test musi potwierdzić odrzucenie starej CA po rotacji.

## K3s

K3s rozpoczynamy dopiero po podpisaniu certyfikacji Compose. Import lokalnych obrazów opisuje
`docs/k3s-local-images-handoff.md`. Rozbudowany Kubernetes pozostaje zamrożony.
