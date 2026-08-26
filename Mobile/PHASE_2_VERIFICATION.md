# Faza 2 — raport implementacji i weryfikacji

Data: 2026-08-19

## Zaimplementowany zakres

- walidowane środowiska `development`, `preview` i `production`, z HTTPS jako
  domyślnym wymaganiem oraz jawnym wyjątkiem dla lokalnego developmentu;
- NativeWind 4.2.6 z Tailwind CSS 3.4.19, tokenami White-Label i lokalnymi,
  source-owned komponentami UI;
- jeden klient `expo/fetch` z timeout, abort, błędami network/HTTP/contract i
  correlation ID;
- TanStack Query z NetInfo, AppState, retry/backoff, stabilnymi query keys i
  czyszczeniem prywatnej przestrzeni cache;
- `/api/config/public` z ETag, `304`, walidacją kontraktu i publicznym cache
  AsyncStorage;
- wspólne katalogi `pl-PL`/`en`, wykrywanie locale i trwała preferencja języka;
- cienkie trasy Expo Router oraz granice `(auth)`, `(resident)` i `(service)`;
- logger z allowlistą pól, bez request/response body, cookie, e-maili i zdjęć.

## Wyniki automatyczne

| Bramka                    | Wynik               |
| ------------------------- | ------------------- |
| Mobile unit/integration   | 8 plików, 32 testy  |
| Mobile typecheck          | zaliczony           |
| Mobile lint               | zaliczony           |
| Android export            | zaliczony           |
| iOS export                | zaliczony           |
| iOS development build     | zaliczony, 0 błędów |
| Android development build | zaliczony           |
| Expo Doctor               | 21/21               |
| React Doctor              | 0 błędów            |
| Pełne `pnpm check`        | zaliczone           |

React Doctor pozostawia 8 przejrzanych ostrzeżeń: 6 memoizacji zachowanych celowo
zgodnie z kanoniczną regułą narzędzia oraz dwa bazowe komponenty `Input`/`Label`,
które są przygotowane dla następnych ekranów, ale nie występują jeszcze w shellu.

## Macierz urządzeń

| Urządzenie                      | System         | Wynik                                           |
| ------------------------------- | -------------- | ----------------------------------------------- |
| iPhone 17 Simulator             | iOS 26.5       | start, White-Label, NativeWind, PL, diagnostyka |
| iPad Pro 11-inch (M4) Simulator | iPadOS 18.6    | instalacja tego samego builda i layout 11″      |
| Pixel 9 Emulator                | Android API 36 | start, zachowane EN, White-Label i diagnostyka  |

## Offline i rewalidacja

1. Aplikacja pobrała poprawną konfigurację i zapisała ETag oraz zwalidowany payload.
2. Kontrolowany endpoint został wyłączony.
3. Cold start Androida zakończył się stanem `Source: cache` i widocznym komunikatem
   o ostatniej poprawnej konfiguracji.
4. Endpoint został przywrócony.
5. Kolejny cold start wysłał `If-None-Match`, otrzymał `304` i pokazał
   `Source: not-modified` bez ostrzeżenia offline.

## Znane ograniczenia i następne ręczne kontrole

- publiczny origin HTTPS dla development/preview nadal nie jest dostępny; test używał
  kontrolowanego fixture HTTP ograniczonego do emulatorów;
- VoiceOver i TalkBack wymagają pełnego ręcznego przejścia; Android UIAutomator
  potwierdził obecność tekstów i elementów w drzewie accessibility;
- duży tekst, reduce motion, iPad landscape/Split View oraz Android API 31 wymagają
  rozszerzenia macierzy przed checkpointem funkcjonalnym;
- fizyczny iPhone powinien przejść test najpóźniej przed Fazą 3, a fizyczny Android
  pozostaje wymaganiem przed produkcją;
- ostrzeżenia Gradle pochodzą z manifestów AsyncStorage/NetInfo; build jest zielony,
  ale należy je ponownie ocenić przy aktualizacji tych bibliotek.
