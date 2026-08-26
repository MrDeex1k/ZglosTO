# Faza 5.3–5.4 — szczegóły, mutacje i zdjęcie rozwiązania

Data weryfikacji: 2026-08-21.

## Zakres 5.3

- ekran szczegółów korzysta z zamrożonej klasyfikacji błędów
  `serviceMutationFailureAction`;
- `401`, `403`, `404`, `409`, brak sieci, timeout, `429`, `5xx`, anulowanie i
  pozostałe błędy mają rozdzielne, bezpieczne reakcje UI;
- `404` i `409` odświeżają zakres danych, ale nie powtarzają decyzji operatora;
- mutacje nie mają automatycznego retry ani kolejki offline;
- przyciski statusu i weryfikacji są blokowane podczas zapisu oraz offline;
- każda udana zmiana ma komunikat live region widoczny zarówno przy początku
  ekranu, jak i przy kontrolkach niezależnie od pozycji przewinięcia;
- odświeżane są kolejka oraz statystyki, a aktywny status nie jest ponownie
  klikalny.

## Zakres 5.4

- zachowano przepływ `picker -> walidacja -> SHA-256 -> initiate -> presigned PUT
-> attach uploadId`;
- dołączenie obrazu nie następuje, jeśli PUT zakończy się błędem;
- brak sieci zachowuje wybrany obraz i wymaga jawnego, ręcznego ponowienia;
- upload ma postęp, ochronę przed duplikacją i `AbortController`;
- roboczy plik jest usuwany po sukcesie, ręcznym usunięciu oraz unmount; aktywny
  upload jest anulowany przy unmount;
- po sukcesie odświeżany jest prywatny obraz rozwiązania;
- lokalny build iOS otrzymał warunkowy, wąski wyjątek ATS dla
  `*.127.0.0.1.nip.io` wyłącznie przy `EXPO_PUBLIC_ALLOW_HTTP_ORIGIN=true`.
  `NSAllowsArbitraryLoads` pozostaje wyłączone.

## Automatyzacja

- polityka błędów: `service-phase5-policy.test.ts`;
- kolejność uploadu, brak attach po błędzie i anulowanie przed inicjacją:
  `submit-resolution-image.test.ts`;
- mutacje urządzeniowe: `e2e/phase5-service-details-mutations.yaml`;
- picker i upload: `e2e/phase5-service-resolution-open-picker.yaml`,
  `phase5-service-resolution-finish-android.yaml`,
  `phase5-service-resolution-finish-ios.yaml` oraz
  `phase5-service-resolution-submit.yaml`.

## Wyniki urządzeniowe

| Kontrola                                 | Pixel 9 / Android Emulator | iPhone 17 Pro / iOS 26.5 |
| ---------------------------------------- | -------------------------- | ------------------------ |
| zmiana statusu i powrót do `in_progress` | PASS                       | PASS                     |
| dwukrotna zmiana weryfikacji             | PASS                       | PASS                     |
| spójne potwierdzenia mutacji             | PASS                       | PASS                     |
| wybór obrazu z biblioteki                | PASS                       | PASS                     |
| presigned PUT i attach                   | PASS                       | PASS                     |
| ręczne ponowienie po błędzie sieci       | PASS                       | N/A                      |
| odświeżenie prywatnego zdjęcia           | PASS                       | PASS                     |

Na Androidzie pierwsza próba bez `adb reverse tcp:1235 tcp:1235` zakończyła się
typowanym błędem. Obraz pozostał wybrany, a ręczne ponowienie po przywróceniu
transportu zakończyło się sukcesem. Nie doszło do automatycznego retry.

Na iOS pierwsza próba ujawniła brak wyjątku ATS dla lokalnego hosta presigned.
Po dodaniu końcowego config pluginu, prebuildzie i instalacji nowej binarki pełny
przepływ zakończył się sukcesem. W wygenerowanym `Info.plist` potwierdzono dokładny
wyjątek `127.0.0.1.nip.io` z subdomenami.

Nie uruchamiano starszego iOS, iPada, tabletu Android ani urządzenia fizycznego.

## Walidacja końcowa

- Expo SDK `57.0.15` i Expo Router `57.0.15`; oba development buildy zostały
  przebudowane, zainstalowane i uruchomione po aktualizacji patch;
- Expo Doctor: `21/21`;
- testy Mobile: `30/30` plików i `117/117` testów;
- pełne `pnpm check`, łącznie z typecheckiem, testami i eksportem Android/iOS:
  **PASS**;
- React Doctor nie wykrył nowego błędu funkcjonalnego. Zgłosił pięć istniejących
  ostrzeżeń o ręcznej memoizacji oraz fałszywie dodatni `unused-file` dla pluginu
  ATS ładowanego dynamicznie przez `app.config.ts`.

## Wynik bramy

Kroki 5.3 i 5.4: **PASS**. Następny krok to 5.5 — konflikty i słaba sieć. Jego
pełna bramka `409` pozostaje zależna od backendowego version/ETag/`If-Match` lub
równoważnego warunku atomowego opisanego w baseline fazy 5.
