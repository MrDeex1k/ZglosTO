# Weryfikacja kroku 3.7 — pionowy przepływ służb

Data: 2026-08-20

## Zakres

Krok 3.7 dostarcza minimalny, kompletny przepływ pracownika służby: przypisaną
kolejkę, liczniki i filtry, szczegóły zgłoszenia, prywatne zdjęcia, oznaczenie
weryfikacji, zmianę statusu oraz zdjęcie rozwiązania wysyłane przez presigned PUT.

Nie testowano iPada ani fizycznego iPhone'a zgodnie z decyzją D-16.

## Implementacja

- lista i statystyki są pobierane tylko w granicy roli `sluzby`;
- filtry obejmują wszystkie, zgłoszone, w toku i rozwiązane;
- lista używa `FlatList`, pull-to-refresh oraz stanów loading/empty/error/retry;
- szczegóły pokazują dane zgłoszenia i autoryzowane zdjęcia report/resolution;
- akcje statusu i weryfikacji są blokowane podczas mutacji, aby nie wysłać
  duplikatu, a po sukcesie invalidują listę i statystyki;
- `403` odświeża rolę, a `401` usuwa sesję oraz dane prywatne;
- zdjęcie rozwiązania korzysta ze wspólnego pickera, walidacji 5 MiB/MIME,
  SHA-256, nowej inicjacji uploadu, binarnego PUT z postępem/anulowaniem i
  dołączenia `uploadId` do zgłoszenia;
- ograniczony lokalny proxy dopuszcza wyłącznie dokładnie wymagane ścieżki służb.

## Dowody API i storage

Na lokalnym środowisku integracyjnym potwierdzono:

- logowanie służby, listę i statystyki — HTTP `200`;
- prywatny obraz zgłoszenia przypisanego do `serviceKey` — HTTP `200`;
- aktualizację weryfikacji i statusu — HTTP `200`;
- inicjację zdjęcia rozwiązania — HTTP `201`;
- podpisany PUT — HTTP `200`;
- dołączenie uploadu i ustawienie statusu `resolved` — HTTP `200`;
- media worker przetworzył oba obrazy do stanu `ready`.

## Wynik Android Emulator

Na Pixel 9 / Android API 37 wykonano:

1. logowanie lokalnego konta służb z `serviceKey=other`;
2. pobranie czterech przypisanych zgłoszeń i liczników;
3. zmianę filtra na `Resolved (1)`;
4. otwarcie szczegółów rozwiązanej sprawy;
5. wyrenderowanie prywatnego zdjęcia zgłoszenia i rozwiązania;
6. sprawdzenie kontrolek `REPORTED`, `IN PROGRESS`, `RESOLVED` i weryfikacji;
7. sprawdzenie wyboru zdjęcia z biblioteki i aparatu dla rozwiązania;
8. wylogowanie i przejście do przepływu mieszkańca.

## Wynik iPhone Simulator

Na iPhone 16 Pro Simulator / iOS 18.6 potwierdzono finalny build, instalację,
uruchomienie i aktualny bundle zawierający krok 3.7. Pełne logowanie oraz ręczne
przejście panelu służb na iOS pozostają do wykonania.

## Bramki jakości

- testy klienta obejmują listę, statystyki, zmianę statusu i weryfikacji;
- test sekwencji zdjęcia rozwiązania obejmuje inicjację, PUT i dołączenie uploadu;
- testy Mobile: 20 plików, 65 testów;
- Mobile typecheck i lint: zaliczone;
- pełne `pnpm check`, łącznie z eksportem bundle Android/iOS: zaliczone;
- React Doctor: 96/100, bez nowych problemów; 5 wcześniejszych ostrzeżeń o
  ręcznej memoizacji w providerach;
- Expo Doctor: 20/21; osiem patchy Expo oczekuje na okno polityki
  `minimumReleaseAge`, bez błędu zgodności użytych modułów;
- lokalne buildy Android i iOS: zaliczone.

Krok 3.7 jest zaimplementowany. Kolejnym krokiem checkpointu jest 3.8: bezpieczne
deep linki w development oraz kontrakt universal links/app links.
