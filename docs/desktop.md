# ZgłosTO Desktop

ZgłosTO Desktop otwiera panel operacyjny wybranej instancji miasta na macOS i Windows. Logowanie wymaga konta administratora albo konta przypisanego do aktywnej służby. Administrator korzysta z panelu administracyjnego, a pracownik służby widzi kolejkę swojej jednostki. Konto mieszkańca oraz konto bez aktywnego przypisania do służby otrzymują odmowę dostępu.

## Dostęp do panelu

Po uruchomieniu aplikacji zaloguj się kontem służbowym z tej samej instancji, której używasz w przeglądarce. Desktop ładuje pod ścieżką `/operacje` te same widoki, kolejki, filtry i akcje, które obsługuje WEB. Zasady pracy opisują [instrukcja służb](using-web-service.md) i [instrukcja administratora](using-web-admin.md).

Panel wymaga połączenia z instancją. Po wznowieniu pracy lub odświeżeniu sesji w aktywnym oknie sprawdza aktualną rolę i przypisanie w Better Auth. API stosuje własną kontrolę uprawnień przy każdym żądaniu. Sesja jest zapisywana w osobnym profilu Electron dla źródła danej instancji. Polecenie wylogowania kończy sesję w panelu.

## Uruchomienie lokalne

Uruchom [lokalny Docker Compose](local-development.md), zainstaluj zależności repozytorium i przygotuj konto testowe właściwej roli. Wykonaj poniższe polecenia z katalogu głównego repozytorium.

```bash
cd desktop
bun run install:runtime
ZGLOSTO_DESKTOP_ORIGIN=http://127.0.0.1:1235 bun run dev
```

HTTP jest dostępne dla adresów loopback w trybie deweloperskim. Spakowana aplikacja wymaga originu HTTPS z zaufanym certyfikatem. Aplikacja sama dopisuje `/operacje`. Origin nie może zawierać ścieżki, parametrów ani danych uwierzytelniających.

## Paczka dla instancji

Na macOS uruchom poniższe polecenia z katalogu `desktop`, podając publiczny origin instancji.

```bash
ZGLOSTO_DESKTOP_ORIGIN=https://zglosto.example.com bun run make:mac
ZGLOSTO_DESKTOP_ORIGIN=https://zglosto.example.com bun run package --platform=win32 --arch=x64
```

Pierwsza komenda tworzy obraz DMG dla architektury hosta w `desktop/out/`. Używa lokalnego podpisu ad hoc. Do dystrybucji poza środowiskiem testowym klient przygotowuje podpis Developer ID i notaryzację Apple. Druga komenda tworzy przenośny katalog Windows x64 z plikiem EXE. Przed dystrybucją Windows trzeba sprawdzić uruchomienie na docelowym systemie i przygotować podpis dystrybucyjny.

## Weryfikacja

Test macOS uruchamia spakowaną aplikację Flashwrightem przeciwko lokalnej instancji testowej HTTPS. Sprawdza logowanie, granice ról, brak dostępu z okna do Node.js, blokadę nowych okien i utrzymanie sesji po ponownym uruchomieniu. Wykonaj poniższe polecenia z katalogu głównego repozytorium.

```bash
bun run test:browser:install
bun run test:browser
(cd desktop && ZGLOSTO_DESKTOP_ORIGIN=https://localhost:14435 bun run make:mac)
BROWSER_DESKTOP_EXECUTABLE="$PWD/desktop/out/ZgłosTO Desktop-darwin-arm64/ZgłosTO Desktop.app/Contents/MacOS/ZgłosTO Desktop" \
  FLASHWRIGHT_SESSION=0 bun run --bun playwright test
```

Na Macu z procesorem Intel użyj katalogu `ZgłosTO Desktop-darwin-x64`. Flashwright uruchamia też scenariusz `/operacje` z rzeczywistym logowaniem i zmianą statusu na odseparowanym Compose.

```bash
INTEGRATION_BROWSER=1 INTEGRATION_OBSERVABILITY=1 bun run test:integration
```

Raporty znajdują się w `output/browser-desktop/` i `output/browser-compose/`.
