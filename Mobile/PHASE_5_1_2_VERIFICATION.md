# Faza 5.1–5.2 — routing służby i kolejka

Data weryfikacji: 2026-08-21.

## Zakres 5.1

- route group `(service)` pozostaje chroniony zweryfikowaną rolą `sluzby`;
- dostęp do danych wymaga dodatkowo niepustego, znormalizowanego `serviceKey`;
- pusty lub składający się z białych znaków `serviceKey` jest traktowany jako brak
  przypisania i nie uruchamia requestu kolejki;
- query keys zawierają origin, `userId` oraz `serviceKey`;
- zmiana użytkownika, roli albo `serviceKey` czyści prywatne query, pliki obrazów i
  robocze media bez usuwania nadal ważnej sesji;
- `401` nadal usuwa całą sesję i stan prywatny, a `403` odświeża sesję oraz
  pozwala routingowi opuścić nieaktualny zakres;
- konto służby bez przypisania otrzymuje kontrolowany ekran i możliwość
  wylogowania, bez dostępu do kolejki.

## Zakres 5.2

- kolejka korzysta z wirtualizowanej `FlatList`; decyzja o FlashList pozostaje do
  pomiaru w 5.8;
- dostępne filtry są dokładnie zgodne z kontraktem: `all`, `reported`,
  `in_progress`, `resolved`;
- filtr jest lokalnym stanem widoku i nie resetuje się przy refetch/reconnect;
- liczniki pochodzą ze statystyk służby, a przy ich niedostępności są bezpiecznie
  wyliczane z już pobranej kolejki;
- częściowy błąd statystyk nie usuwa listy;
- pull-to-refresh odświeża kolejkę i statystyki razem;
- brak sieci bez danych pokazuje pełny stan offline, a brak sieci z danymi
  pozostawia kolejkę i oznacza ją jako cache;
- powrót sieci uruchamia kontrolowaną rewalidację przez TanStack Query;
- filtry są grupą radiową z jawnym stanem zaznaczenia, a liczba widocznych
  rekordów jest ogłaszana przez live region.

## Automatyzacja

- model sesji i zakresu: `session-model.test.ts`, `route-access.test.ts`;
- cleanup prywatnego runtime: `session-cleanup.test.ts`;
- filtry i liczniki: `service-queue.test.ts`;
- scenariusz główny: `e2e/phase5-service-journey.yaml`;
- negatywny brak zakresu: `e2e/phase5-service-missing-scope.yaml`;
- offline i reconnect: `e2e/phase5-service-offline.yaml` oraz
  `e2e/phase5-service-reconnect.yaml`.

Hasło SVC-A jest przekazywane do `scripts/run-phase5-e2e.sh` wyłącznie przez
`PHASE5_SERVICE_PASSWORD`. Nie jest zapisane w repozytorium ani logowane przez
aplikację.

## Wyniki

| Kontrola                   | Wynik                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| lint Mobile                | PASS                                                                                               |
| typecheck Mobile           | PASS                                                                                               |
| testy Mobile               | PASS — 30 plików, 115 testów                                                                       |
| React Doctor               | PASS-CONDITIONAL — brak nowych uwag, 5 wcześniejszych ostrzeżeń providerów                         |
| Pixel 9 / Android Emulator | PASS — logowanie, zakres roads, liczniki, filtry, empty, brak serviceKey, offline cache, reconnect |
| iPhone 17 Pro / iOS 26.5   | PASS — logowanie, zakres roads, liczniki, filtry i empty                                           |

Nie uruchamiano starszego iOS, iPada, tabletu Android ani urządzenia fizycznego.

## Wynik bramy

Kroki 5.1 i 5.2: **PASS**. Następny krok to 5.3 — szczegóły i typowane mutacje.
