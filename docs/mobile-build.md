# Build Mobile dla instancji klienta

Każdy klient buduje własną aplikację wskazującą jego własny origin API. Repozytorium
nie dostarcza wspólnej domeny, podpisanego pliku instalacyjnego ani kont sklepowych.
Na prezentację bez domeny wybierz [lokalne demo](../Mobile/QUICK_START.md).

## 1. Przygotuj środowisko i konfigurację

Polecenia poniżej wykonuj z katalogu głównego repozytorium. Wymagane są Bun przypięty
w `.bun-version` i Node dla Expo/Metro zgodnie z [polityką zależności](dependency-policy.md).
Build iOS wymaga macOS i Xcode; Android wymaga Java 17 i Android SDK.

```bash
bun install --frozen-lockfile
bun run --cwd Mobile deps:build
```

Przygotuj [konfigurację klienta](../Mobile/CLIENT_CONFIGURATION.md) i działającą instancję
WEB/API. YAML miasta jest montowany na serwerze, a Mobile pobiera publiczną reprezentację
z `/api/config/public`; YAML nie zastępuje natywnej konfiguracji aplikacji.

W swojej powłoce ustaw publiczne wartości dla wybranego klienta. Poniższa domena jest
wyłącznie przykładem — zastąp ją rzeczywistym adresem instancji:

```bash
export EXPO_PUBLIC_APP_ENV=production
export EXPO_PUBLIC_API_ORIGIN=https://zgloszenia.miasto.example
export EXPO_PUBLIC_ALLOW_HTTP_ORIGIN=false
```

Origin nie zawiera `/api`, ścieżki, query, hasła ani tokena. Wartości `EXPO_PUBLIC_*`
trafiają do bundla i nie mogą zawierać sekretów. HTTP jest dopuszczone tylko w jawnym
środowisku `development` dla hostów dozwolonych przez
[`Mobile/src/config/env.ts`](../Mobile/src/config/env.ts).

W [`Mobile/app.config.ts`](../Mobile/app.config.ts) klient dostosowuje nazwę, scheme,
`ios.bundleIdentifier`, `android.package` i pozostałą tożsamość natywną. Aktualny kod
zawiera referencyjne identyfikatory `pl.zglosto.app`; nie ma automatycznego przełącznika
identyfikatorów per miasto. Nie traktuj ich jako gotowej konfiguracji klienta.

`MOBILE_APP_LINK_HOST` ustaw dopiero po przygotowaniu własnej domeny i plików weryfikacji
zgodnie z [kontraktem linków aplikacji](../Mobile/APP_LINK_CONTRACT.md). Samo ustawienie
hosta nie aktywuje poprawnie Universal Links ani App Links.

## 2. Sprawdź kod i eksport JavaScript

```bash
bun run check:mobile-client-configs
bun run test:white-label-builds
bun run --cwd Mobile quality
bun run --cwd Mobile build
```

`quality` obejmuje lint, typecheck, testy i Expo Doctor. `build` wykonuje `expo export`
dla obu platform do `Mobile/dist/android` i `Mobile/dist/ios`. To kontrola bundli JS
i assetów, **nie kompilacja APK/AAB/IPA i nie podpisany release**. Zaliczenie tych
komend nie zastępuje testu na urządzeniach ani odbioru konkretnej instancji.

## 3. Zbuduj lokalnego klienta natywnego

Wybierz platformę na przygotowanej maszynie:

```bash
bun run --cwd Mobile ios
# albo
bun run --cwd Mobile android
```

Te skrypty wykonują `expo run:ios` / `expo run:android`, kompilują lokalnego development
clienta i instalują go na wybranym symulatorze, emulatorze lub urządzeniu. Nie są
publikacją sklepową. W razie potrzeby uruchom Metro dla już zainstalowanego klienta:

```bash
bun run --cwd Mobile dev --lan
```

Metro musi być osiągalne z urządzenia. Po zmianie zależności natywnej, identyfikatorów,
uprawnień lub konfiguracji App Links wykonaj ponowny build natywny. Zmiana samego YAML-a
serwerowego nie zmienia bundle ID ani signingu aplikacji.

## 4. Przygotuj dystrybucję i odbiór

Repozytorium nie definiuje gotowego pipeline'u EAS ani wspólnego procesu podpisywania
release. Klient wybiera kanał dystrybucji, przygotowuje konfigurację release w swoim
toolchainie Xcode/Android, zabezpiecza signing i ewentualne konta Apple Developer/Google
Play. Nie zapisuj kluczy, provisioning profiles ani haseł w repozytorium.

Przed przekazaniem zapisz wersję źródeł, wariant miasta, origin API, identyfikatory
aplikacji i wyniki testów. Zweryfikuj logowanie, wylogowanie, właściwe role, zgłoszenie
ze zdjęciem, obsługę błędu sieci i powrót z tła na fizycznych urządzeniach obu platform.
Sprawdź, że aplikacja nie używa kont demo ani innej instancji klienta.

Pełna checklista, ograniczenia produktu i odpowiedzialności operatora znajdują się w
[przekazaniu Mobile](../Mobile/CLIENT_HANDOFF.md). Brak wspólnej domeny jest zamierzony;
gotowość hostingu, linków aplikacji i dystrybucji ocenia się osobno dla każdego klienta.
