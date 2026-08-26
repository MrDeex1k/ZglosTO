# Weryfikacja kroku 3.8 — deep linki i kontrakt linków produkcyjnych

Data: 2026-08-20

## Zakres

Krok 3.8 dostarcza bezpieczne wejścia do publicznych i prywatnych szczegółów
incydentu oraz neutralny powrót po weryfikacji e-maila. Na obecnym etapie aktywny
jest custom scheme `zglosto://`. Powiązania Universal Links i Android App Links są
gotowe konfiguracyjnie, ale świadomie wyłączone do czasu pozyskania własnego hosta
HTTPS i publikacji plików `.well-known`.

Nie testowano iPada ani urządzeń fizycznych zgodnie z decyzją D-16.

## Implementacja

- wejście `/open/incidents/:id` przyjmuje wyłącznie UUID oraz target z allowlisty
  `public`, `resident`, `service`;
- prywatny intent ma format `role:uuid` i nie może zawierać URL, ścieżki ani
  arbitralnego `returnTo`;
- anonimowa sesja przechodzi do logowania, zgodna rola do prywatnego szczegółu, a
  inna rola do własnego panelu bez ujawniania danych;
- callback `/auth/email-verified` nie przyjmuje tokenu i nie ogłasza sukcesu na
  podstawie samego URL — wynik zależy od odświeżonej sesji i serwerowej flagi
  `emailVerified`;
- `MOBILE_APP_LINK_HOST` jest opcjonalny i walidowany jako ścisła nazwa DNS;
- bez hosta build nie deklaruje Associated Domains ani Android intent filters;
- po ustawieniu hosta konfiguracja ogranicza HTTPS do `/open/*` oraz
  `/auth/email-verified`.

Pełny kontrakt, wymagania fallbacku web i instrukcja aktywacji znajdują się w
[APP_LINK_CONTRACT.md](APP_LINK_CONTRACT.md). Wzorce plików serwerowych znajdują się
w `linking/apple-app-site-association.example.json` i `linking/assetlinks.example.json`.

## Wynik Android Emulator

Na Pixel 9 / Android API 37 potwierdzono:

1. publiczny link otwiera właściwy szczegół istniejącego incydentu;
2. target spoza allowlisty pokazuje bezpieczny stan „Nieprawidłowy link”;
3. prywatny target mieszkańca z aktywną sesją otwiera autoryzowany szczegół;
4. target służby dla sesji mieszkańca wraca do panelu mieszkańca;
5. callback weryfikacji bez potwierdzonej flagi serwera pokazuje neutralne
   polecenie zalogowania, a nie fałszywy sukces.

## Wynik iPhone Simulator

Na iPhone 16 Pro Simulator / iOS 18.6 zbudowano i zainstalowano konfigurację
Release z osadzonym bundle. Potwierdzono:

1. uruchomienie aplikacji i komunikację z lokalnym API;
2. publiczny custom link i właściwy szczegół incydentu;
3. odrzucenie niepoprawnego UUID;
4. neutralny ekran callbacku weryfikacji e-maila.

Pełne logowanie obu ról oraz prywatne ścieżki na iOS pozostają częścią bramki
przed betą, a nie warunkiem lokalnego checkpointu.

## Bramki automatyczne

- testy obejmują parser/serializer intentów, dopasowanie roli, odrzucenie URL i
  niepoprawnych UUID oraz konfigurację hosta produkcyjnego;
- parser sesji zachowuje serwerową flagę `emailVerified`;
- publiczna konfiguracja Expo ładuje się bez domeny;
- konfiguracja z przykładowym hostem generuje oczekiwane Associated Domains i
  ograniczone Android intent filters;
- błędny `MOBILE_APP_LINK_HOST` zatrzymuje konfigurację zamiast tworzyć zbyt
  szerokie powiązanie.

## Stan kroku

Krok 3.8 jest zakończony dla custom scheme i bieżącej macierzy emulatorów.
Universal Links, Android App Links i fallback web są kontraktem gotowym do
aktywacji, lecz nie mogą zostać uczciwie uznane za wdrożone bez własnej domeny,
plików `.well-known` i produkcyjnych danych podpisu.
