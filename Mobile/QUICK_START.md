# Quick Start ZgłosTO Mobile

Ta ścieżka uruchamia lokalne demo z syntetycznymi danymi. Nie wymaga własnej domeny,
Cloudflare Quick Tunnel, Apple Developer, Google Play, EAS ani agent-device.

## Wymagania

- macOS z Xcode dla iOS Simulator;
- Node.js co najmniej 26.5 i PNPM w wersji zapisanej w `package.json`;
- Docker Desktop albo OrbStack;
- Java 17 i Android SDK dla Android Emulator;
- co najmniej jeden skonfigurowany symulator lub emulator dla wybranej platformy.

## Uruchomienie

Z katalogu głównego świeżego klona:

```bash
pnpm install --frozen-lockfile
pnpm mobile:demo:check
pnpm mobile:demo:up
```

`mobile:demo:up`:

1. sprawdza wymagania i konfigurację Compose;
2. generuje ignorowane lokalne certyfikaty;
3. buduje i uruchamia izolowany projekt `zglosto-mobile-demo`;
4. czeka na healthcheck;
5. tworzy trzy syntetyczne konta: mieszkańca, służby `roads` i administratora;
6. dodaje osiem realistycznie opisanych, syntetycznych incydentów do prezentacji;
7. zapisuje losowe hasła z prawami `0600` w ignorowanym
   `.state/mobile-demo/credentials.env`.

Nie commituj wygenerowanego pliku credentials. Aby wyświetlić dane w swojej powłoce:

```bash
source .state/mobile-demo/credentials.env
printf '%s\n' "$DEMO_RESIDENT_EMAIL" "$DEMO_SERVICE_EMAIL" "$DEMO_ADMIN_EMAIL"
```

Następnie uruchom wybraną platformę:

```bash
pnpm mobile:demo:ios
# albo
pnpm mobile:demo:android
```

iOS łączy się z `http://127.0.0.1:1236`, a Android Emulator z
`http://10.0.2.2:1236`. Izolowany port można zmienić przez `MOBILE_DEMO_HTTP_PORT`.
HTTP jest dopuszczone wyłącznie dla jawnego środowiska
`development` i lokalnych hostów.

## Status i ponowne utworzenie danych

```bash
pnpm mobile:demo:status
pnpm mobile:demo:seed
```

`mobile:demo:seed` usuwa wyłącznie trzy konta `demo.*@example.test` i incydenty seedowane
przez demo, tworzy je ponownie oraz zastępuje lokalny plik credentials. Nie modyfikuje
innych kont ani incydentów. Incydenty demo mają stałe UUID-y, aby wersjonowane deep linki
były powtarzalne. Publiczny feed jest cache'owany przez nginx do 15 minut; pełny Quick Start
tworzy świeży cache, natomiast po ręcznym reseedzie natychmiastowy test może wymagać
odtworzenia kontenera nginx albo odczekania na wygaśnięcie cache.

Krótki przebieg prezentacji oraz opcjonalne zanonimizowane zdjęcie formularza opisuje
[SHOWCASE_DEMO.md](SHOWCASE_DEMO.md).

## Zatrzymanie i cleanup

```bash
pnpm mobile:demo:down
```

Zatrzymanie zachowuje wolumeny i credentials. Pełny, nieodwracalny cleanup izolowanego
demo wykonuje:

```bash
pnpm mobile:demo:clean
```

Polecenie usuwa wyłącznie projekt Compose `zglosto-mobile-demo`, jego wolumeny oraz
`.state/mobile-demo`.

## Najczęstsze problemy

- Port `1236` jest zajęty: ustaw inny, np. `MOBILE_DEMO_HTTP_PORT=1237`.
- Docker nie odpowiada: uruchom Docker Desktop lub OrbStack i ponów `demo:check`.
- Aktywny kontekst wskazuje wyłączony Docker Desktop: skrypt automatycznie wybierze
  działający kontekst `orbstack`; można go też wskazać przez
  `MOBILE_DEMO_DOCKER_CONTEXT=orbstack`.
- Brak urządzenia Android: utwórz AVD w Android Studio i uruchom emulator.
- Brak symulatora iOS: doinstaluj runtime w Xcode i wybierz aktualny iPhone Simulator.
- Metro lub development client są nieaktualne: ponów odpowiednio `demo:ios` albo
  `demo:android`; polecenie wykonuje lokalny build natywny.
- Pełna diagnoza środowiska znajduje się w [READINESS_CHECKLIST.md](READINESS_CHECKLIST.md).
