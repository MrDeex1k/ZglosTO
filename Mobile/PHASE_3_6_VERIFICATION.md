# Weryfikacja kroku 3.6 — prywatne obrazy

Data: 2026-08-20

## Zakres

Krok 3.6 dodaje prywatne szczegóły zgłoszenia mieszkańca oraz autoryzowane
pobieranie zdjęcia zgłoszenia i zdjęcia rozwiązania. Obraz nie otrzymuje cookie w
URL: jest pobierany przez chroniony klient, walidowany i zapisywany w kontrolowanym
katalogu użytkownika, a następnie renderowany z lokalnego URI.

Nie testowano iPada ani fizycznego iPhone'a zgodnie z decyzją D-16.

## Implementacja

- ścieżka `resident/incidents/:id` pozostaje za granicą roli mieszkańca;
- URL obrazu musi wskazywać dokładnie `/api/images/:imageId` zgodny z kontraktem;
- dozwolone odpowiedzi to AVIF, JPEG, PNG i WebP, maksymalnie 5 MiB;
- query key zawiera użytkownika, obraz, checksum i origin;
- prywatne query nie są utrwalane i są usuwane przy `401` oraz wylogowaniu;
- pliki trafiają do `zglosto-private-images/<userId>` i mają nazwę powiązaną z ID
  oraz checksumą;
- `expo-image` renderuje lokalny URI z `cachePolicy="none"`, bez drugiej,
  niekontrolowanej kopii dyskowej;
- brak obrazu, przetwarzanie, błąd workera, loading, błąd pobrania i retry mają
  osobne stany UI;
- błąd sprzątania plików jest logowany, ale nie może zatrzymać wylogowania.

## Dowody API i bezpieczeństwa

Na lokalnym środowisku integracyjnym potwierdzono:

- logowanie mieszkańca — HTTP `200`;
- prywatną historię z jednym przypisanym zgłoszeniem — HTTP `200`;
- pobranie przypisanego zdjęcia — HTTP `200` i `Cache-Control: private, no-store`;
- anonimowe pobranie tego samego obrazu — HTTP `401`;
- media workera dla zdjęcia zgłoszenia i rozwiązania mają stan `ready`.

## Wynik Android Emulator

Na Pixel 9 / Android API 37 wykonano:

1. logowanie lokalnego konta mieszkańca;
2. pobranie prywatnej historii;
3. otwarcie szczegółów zgłoszenia;
4. wyrenderowanie zdjęcia zgłoszenia i zdjęcia rozwiązania;
5. powrót do historii i wylogowanie;
6. sprawdzenie prywatnego katalogu aplikacji — katalog
   `zglosto-private-images` po wylogowaniu nie istnieje.

## Wynik iPhone Simulator

Na iPhone 16 Pro Simulator / iOS 18.6 potwierdzono finalny build, instalację,
uruchomienie i aktualny bundle zawierający krok 3.6. Pełne logowanie, renderowanie
prywatnych obrazów oraz inspekcja cache na iOS pozostają testem ręcznym.

## Bramki jakości

- testy klienta obrazu obejmują zgodność ID, statusy HTTP, MIME i limit rozmiaru;
- testy Mobile: 20 plików, 65 testów;
- Mobile typecheck i lint: zaliczone;
- pełne `pnpm check`, łącznie z eksportem bundle Android/iOS: zaliczone;
- React Doctor: 96/100, bez nowych problemów; 5 wcześniejszych ostrzeżeń o
  ręcznej memoizacji w providerach;
- Expo Doctor: 20/21; osiem patchy Expo oczekuje na okno polityki
  `minimumReleaseAge`, bez błędu zgodności użytych modułów;
- lokalne buildy Android i iOS: zaliczone.

Krok 3.6 jest zaimplementowany. B-03 pozostaje otwarty wyłącznie do powtórzenia
pełnego scenariusza prywatnego obrazu i czyszczenia cache na iPhone Simulator.
