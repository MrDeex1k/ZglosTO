# Bun — odbiór fazy 1

Data: 2026-09-12. Branch: `chore/bun-migration`.
Baza: `61fdc8b` (dokumentacja) / `40cd505` (kod aplikacji).

## Decyzja

**Faza 1 zakończona jako weryfikacja wykonalności. Można przejść do fazy 2.**
Wybrany pin: **Bun 1.4.2**. Obraz prób:
`oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895`.

Wykryte różnice mają sprawdzone warianty rozwiązania opisane poniżej.
Zostały zastosowane w izolowanej kopii, a nie w aktywnych usługach.
PackageManager, pnpm-lock.yaml, produkcyjne Dockerfile i serwery projektu pozostają
na bazowej konfiguracji. Próby nie są certyfikacją całej aplikacji po migracji.

Faza 0 została wcześniej zakończona na podstawie potwierdzenia użytkownika.
Nie powtarzano pełnej certyfikacji stanu bazowego.

## Macierz wyników

| Obszar              | Wynik końcowy fazy 1                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pin Bun             | 1.4.2; wydanie z 2026-09-05, zgodne z lokalnym narzędziem                                                                          |
| Import lockfile     | 1417 zewnętrznych pakietów: te same wersje i integrity, bez nowych zewnętrznych pakietów                                           |
| Pełna instalacja    | PASS w osobnej kopii przez SFW; 1238 pakietów na macOS arm64; lifecycle scripts wyłączone                                          |
| Polecenia CLI       | PASS po uzupełnieniu pominiętych przez importer metadanych bin; sam import był niewystarczający                                    |
| Powtarzalność       | Ponowny frozen/offline install bez zmiany poprawionego lockfile                                                                    |
| Web/Mobile          | Oddzielne React 19.2.8 / 19.2.3 oraz TypeScript 7.0.2 / 6.0.3; importy contracts/i18n działają                                     |
| Overrides           | Babel 7.29.7 oraz 9 kontroli rzeczywistego resolution reguł rodzic → zależność: PASS                                               |
| Kompilacja          | 7 pakietów wspólnych i backend/authorization/gateway: PASS w obrazach Bun obu architektur                                          |
| mTLS                | Prototyp adaptera: 13 przypadków na każdą z 2 usług, PASS na macOS oraz Linux arm64/amd64                                          |
| sharp               | Rzeczywisty SharpImageProcessor: PASS na macOS i obu architekturach Linux                                                          |
| AsyncLocalStorage   | 100 współbieżnych kontekstów: PASS na macOS i obu architekturach Linux                                                             |
| OTLP/HTTP           | Ślady, metryki, logi i automatyczny traceparent: PASS; na obu architekturach Linux także flush po SIGTERM                          |
| Wiek pakietów       | Bun przepuszcza brak daty; dodatkowy walidator blokuje brak/błędną datę, przyszłość i zbyt nowe wydanie                            |
| SFW                 | Kontrolowana odmowa pobrania tarballa crossenv 0.0.2-security: 403, jawny powód malware; PASS                                      |
| Vitest              | 4/4 testy procesora pod Bun po inline Zod, macOS i Linux arm64/amd64                                                               |
| Staging produkcyjny | Offline, 34 importy zależności usług, bez zewnętrznych symlinków i bez bezpośredniego toolchainu: PASS na obu architekturach Linux |

Źródło wydania: [Bun 1.4.2](https://bun.sh/blog/bun-v1.4.2).
Linux uruchomiono w OrbStack / Docker 29.4.0. ARM64 jest natywną architekturą VM,
AMD64 działa w emulacji — wyniki AMD64 potwierdzają zgodność funkcjonalną, nie wydajność.
Kontrola porównawcza mTLS na macOS używała Node v24.20.0, starszego niż deklarowane
w repo >=26.8.1. Nie jest dowodem certyfikacji wersji Node wymaganej przez projekt.

## 1. Konwersja lockfile i instalacja

Bun zaimportował pnpm-lock.yaml w kopii git archive, bez dostępu do sieci.
Porównanie identyfikatorów i integrity dało 1417 zgodnych pakietów zewnętrznych.
Dwa dodatkowe wpisy pnpm to lokalne contracts/i18n w formacie file:.
Bun reprezentuje je jako workspace; sprawdzono ich rzeczywiste importy po buildzie.

Importer pomijał metadane bin: po instalacji brakowało tsc i vitest w .bin.
Ponowny install --force nie pomagał. Uzupełnienie bin z manifestów pakietów
zainstalowanych z tego samego lockfile i kolejny frozen/offline install przywróciło CLI.
Pomocnik [bun-phase1-lockfile-bins.ts](../scripts/bun-phase1-lockfile-bins.ts) uwzględnia
również katalogi z sufiksem peer dependencies. Operuje tylko na jawnej kopii poza repo.
Nie zmienia wersji ani integrity; w fazie 2 potrzebny jest przegląd całego diff lockfile.

Próby używały install --ignore-scripts, a więc nie wykonywały dowolnych lifecycle scripts.
Docelową listę trustedDependencies oraz działanie Husky i lifecycle należy podłączyć
i odebrać podczas zmiany managera.

Hash SHA-256 lockfile po uzupełnieniu bin i po kolejnym frozen/offline install:

```text
360babf8a46a807b29c89e890377963f4a92fe006c9b0a71fe15d3cd3c7e1012
```

[Kontrola workspace](../scripts/bun-phase1-workspace-probe.ts) sprawdza wersje React,
TypeScript, Babel, importy contracts/i18n i selektywne overrides. Resolver używa
rzeczywistej ścieżki manifestu pakietu, odpowiadającej wykonywaniu modułu za symlinkiem.

## 2. mTLS: prototyp zgodnego adaptera

Pierwotny node:https pod Bun zwracał socket niespełniający instanceof TLSSocket
i bez oczekiwanego getPeerCertificate().raw. Poprawny klient otrzymywał 403.
Ten sam test pod Node przechodził. Nie wolno naprawiać tego przez wyłączenie
kontroli tożsamości ani samą kontrolę authorized.

Sprawdzony wariant używa node:http2.createSecureServer z allowHTTP1 i ALPN
ograniczonym do http/1.1. Zachowuje TLS 1.3, własne CA, weryfikację klienta,
jedno URI SAN i uprawnienia do ścieżek. Typy odpowiedzi i żądań dostosowano
do API adaptera. Kompilacja obu usług przechodzi.

Gotowy prototyp to [http2.patch](../scripts/bun-phase1/http2.patch).
Patch zastosowano wyłącznie w kopii prób. Integracja z usługami przypada na fazę 3.

[Probe mTLS/sharp](../scripts/bun-phase1-probe.ts) generuje własne tymczasowe certyfikaty.
Dla każdej usługi sprawdza:

- poprawnego klienta i dozwoloną ścieżkę;
- zabronioną ścieżkę, złą tożsamość, kilka URI SAN oraz brak URI SAN;
- dozwolone i zabronione ścieżki tożsamości healthcheck i nginx;
- brak certyfikatu, obce CA, certyfikat wygasły oraz TLS 1.2.

Wynik: 13/13 na usługę, razem 26/26, na macOS Bun/Node oraz Linux Bun arm64/amd64.
To obejmuje rzeczywisty handshake i kod adapterów. Pełne scenariusze auth/gateway,
klienta KEDA oraz ruch HTTP/2 pozostają poza tą próbą; prototyp negocjuje HTTP/1.1.

## 3. sharp, runtime i telemetria

Probe uruchamia rzeczywisty SharpImageProcessor: JPEG z orientacją EXIF →
WebP, poprawny obrót, usunięte EXIF i zgodny SHA-256. Na Linux zainstalowano
własne zależności danej architektury; nie kopiowano node_modules z macOS.
Dodatkowo 100 operacji AsyncLocalStorage zachowuje odrębne konteksty.

[Probe OTLP](../scripts/bun-phase1-otel-probe.ts) ładuje istniejące dist/register
przed instrumentowanym HTTP. Lokalny odbiornik potwierdza markery śladów,
metryk i logów w payloadach OTLP oraz traceparent żądania. Tryb --sigterm
wysyła sygnał do dziecka i sprawdza eksport przez shutdownObservability przed exit 0.

```json
{
  "code": 0,
  "traces": true,
  "metrics": true,
  "logs": true,
  "autoHttpPropagation": true,
  "sigterm": true
}
```

Nie testowano jeszcze SQL/AMQP spanów, topologii pełnego trace, rzeczywistego Collectora,
długotrwałego obciążenia ani zamykania całej produkcyjnej usługi. Są to bramki faz 3 i 5.

## 4. Polityka wieku i SFW

Bun poprawnie blokuje wydanie sprzed sekundy, ale przepuszcza brak czasu publikacji.
[Walidator](../scripts/lib/package-release-age.ts) odrzuca brak/błędną datę, przyszłość
i wydanie młodsze niż 24 godziny. Dokładnie 24 godziny jest dozwolone.
Pięć deterministycznych kontroli granicznych oraz lokalny rejestr w
[probe wieku](../scripts/bun-phase1-age-probe.ts) potwierdziły zachowanie.

```sh
bun scripts/bun-phase1-age-probe.ts
# Oczekiwany kod 1: odtwarza lukę samego Bun.
bun scripts/bun-phase1-age-probe.ts --guarded
# Kod 0: dodatkowa walidacja zachowuje wymaganą odmowę.
```

Walidator nie jest jeszcze podłączony do aktywnych wrapperów instalacji.
W fazie 2 należy zastosować go do wszystkich pakietów objętych nowym resolution
i obsługiwać błędy pobierania metadanych jako odmowę; nie ograniczać się do zależności
bezpośrednich ani samego sprawdzania, czy data istnieje.

SFW 2.0.6 uruchomił pełną instalację kopii. Osobna próba ze świeżym cache i wyłączonymi
skryptami została zablokowana przy tarballu crossenv 0.0.2-security:

```text
GET https://registry.npmjs.org/crossenv/-/crossenv-0.0.2-security.tgz - 403
blocked npm package: name: crossenv; version: 0.0.2-security; reason: malware (critical)
```

To pakiet wskazywany przez Socket do kontroli odmowy.
[Socket: pakiety testowe](https://docs.socket.dev/docs/sample-malware-packages).
Próba potwierdza działanie bieżącego wrappera na tym hoście; nie jest gwarancją
producenta dla wszystkich platform. Oficjalna lista SFW Free nadal wymienia
npm/yarn/pnpm. [SFW Free](https://docs.socket.dev/docs/socket-firewall-free).
Docelowe wrappery i ich użycie w środowiskach developerskich wymagają odbioru w fazie 2.

## 5. Vitest i produkcyjny staging

Domyślny Vitest pod Bun zatrzymywał się przed testami na z.object.
Bezpośredni import Zod działał. Konfiguracja próbna
[vitest.config.ts](../scripts/bun-phase1/vitest.config.ts) z server.deps.inline: ['zod']
dała 4/4 PASS na macOS, Linux arm64 i Linux amd64.
To sprawdzony wariant dla tej regresji, nie wynik pełnej macierzy testów monorepo.

[Staging](../scripts/bun-phase1/staging.sh) w pustym katalogu kopiuje manifesty i dist
trzech usług oraz pakietów wspólnych, instaluje produkcyjny podgraf z zamrożonym
lockfile offline i sprawdza:

- importy 34 bezpośrednich zależności usług;
- brak typescript/vitest/expo w root i bezpośrednich node_modules usług;
- wszystkie symlinki prowadzą do istniejących plików wewnątrz stagingu.

Obie architektury: 926 pakietów, PASS. Frontend/Mobile nie są instalowane.
To wspólny podgraf usług do próby wykonalności. W fazie 2 trzeba przygotować osobne,
minimalne artefakty per usługa oraz uruchomić istniejące kontrole obrazów i sekretów.
Sam staging nie certyfikuje finalnego obrazu produkcyjnego.

## Powtórzenie prób

Próby wykonywano w /private/tmp/zglosto-bun-phase1-20260912/source.
Logi znajdują się w katalogu nadrzędnym; są tymczasowe. Wyniki powyżej są zapisem trwałym.
Skrypty i [Dockerfile prób](../scripts/bun-phase1/Dockerfile) pozostają w repo.

Przygotowanie nowej kopii:

1. Wykonać git archive bazowego commita do nowego katalogu poza repo.
2. Skopiować bieżące scripts/bun-phase1*.ts, scripts/bun-phase1/ i
   scripts/lib/package-release-age.ts do tej kopii.
3. W kopii wykonać bun install --lockfile-only --ignore-scripts --offline,
   ustawić linker isolated w bunfig.toml i minimumReleaseAge = 86400.
4. Wykonać pełny frozen install przez SFW z --ignore-scripts i oddzielnym cache.
5. Z root repo uruchomić bun scripts/bun-phase1-lockfile-bins.ts KOPIA --write,
   następnie frozen/offline install w kopii. Nie używać tego pomocnika na aktywnym repo.
6. W kopii zastosować scripts/bun-phase1/http2.patch przez git apply.
7. Zbudować obrazy z scripts/bun-phase1/Dockerfile dla linux/arm64 i linux/amd64.
   Dockerfile kompiluje pakiety wspólne i trzy usługi, bez zmiany ich startu w repo.
8. Uruchomić w każdym obrazie, z --network none:
   bun scripts/bun-phase1-probe.ts,
   bun scripts/bun-phase1-otel-probe.ts --sigterm,
   bun scripts/bun-phase1-age-probe.ts --guarded,
   sh scripts/bun-phase1/staging.sh.
9. Z /app/backend uruchomić bun --bun run vitest run
   nest/media-worker/sharp-image.processor.test.ts
   --config ../scripts/bun-phase1/vitest.config.ts.
10. Po lokalnym buildzie pakietów wspólnych uruchomić workspace probe na kopii.

Obrazy prób są celowo developerskie i zawierają OpenSSL oraz toolchain.
Nie należy ich wdrażać produkcyjnie.

## Przekazanie do kolejnych faz

Faza 2: konwersja z uzupełnieniem bin, jeden bun.lock, wrappery SFW + rygor wieku,
trustedDependencies, Turbo i skrypty, powtarzalne instalacje i obrazy per usługa.
Usługi mogą w tym etapie nadal wykonywać się na Node.

Faza 3: zastosowanie i odbiór prototypu mTLS, start Bun/preload, pełne integracje
I/O i shutdown. Faza 4: pełna macierz Vitest i narzędzi, Mobile/Expo i przyszłe docs-site.
Faza 5: docelowe profile wdrożenia, obciążenie, realny Collector, awarie i rollback.
