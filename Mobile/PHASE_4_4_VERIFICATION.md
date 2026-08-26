# Faza 4.4 — stany danych i reconnect

Data weryfikacji: 2026-08-21.

## Zakres

- jawne stany `loading`, `empty`, `error`, `offline` i `retry` dla publicznego
  feedu, panelu mieszkańca oraz ich szczegółów;
- odróżnienie pierwszego ładowania bez sieci od danych dostępnych w cache;
- zachowanie ostatnich danych podczas nieudanego odświeżenia;
- automatyczne wznowienie zapytań TanStack Query po reconnect;
- brak niejawnej kolejki mutacji offline;
- formularz zgłoszenia zachowuje pola w pamięci, ale wymaga świadomego ponownego
  wysłania po odzyskaniu połączenia;
- prywatne zdjęcie nie pozostaje w nieskończonym stanie ładowania bez sieci.

## Decyzja dotycząca mutacji

Domyślna polityka mutacji ma `networkMode: "always"` i `retry: false`. W efekcie
żądanie rozpoczęte przy utracie sieci kończy się kontrolowanym błędem zamiast
pozostać wstrzymane i wykonać się później bez ponownej akcji użytkownika. Jest to
zgodne z decyzją D-09: pełna kolejka offline pozostaje poza MVP bez kontraktu
idempotency i retencji.

## Testy automatyczne

- klasyfikacja `online / offline / unknown` na podstawie NetInfo;
- transport rozłączony i brak osiągalności internetu dają stan offline;
- nierozstrzygnięty stan startowy nie powoduje fałszywego komunikatu offline;
- Query Client nie ponawia mutacji i nie kolejkuje ich do późniejszego wykonania;
- Mobile: 26 plików testowych i 92 testy zakończone powodzeniem;
- typecheck i lint Mobile zakończone powodzeniem.

## Android Emulator

Sprawdzone na `emulator-5554`:

1. feed online pobrał i wyświetlił dane;
2. po włączeniu trybu samolotowego lista pozostała widoczna, a aplikacja pokazała
   komunikat o ostatnich danych zapisanych na urządzeniu;
3. formularz offline pozostał edytowalny i nie oferował automatycznej wysyłki;
4. testowa treść `Draft_4.4_offline` pozostała w polu po wyłączeniu trybu
   samolotowego;
5. komunikat offline zniknął po reconnect bez restartu aplikacji.

Po teście tryb samolotowy został wyłączony.

## iPhone Simulator

Na iPhone 16 Pro Simulator sprawdzono:

- poprawne renderowanie feedu i danych z istniejącego cache;
- przejście do formularza przez custom scheme;
- brak regresji formularza i nawigacji po wdrożeniu obserwacji NetInfo.

`simctl` w używanej wersji Xcode nie udostępnia bezpiecznego przełącznika całej
sieci symulatora. Nie deklarujemy więc ręcznego testu prawdziwego offline na iOS.
Współdzielona klasyfikacja NetInfo ma testy automatyczne, a pełny scenariusz offline
iOS pozostaje pozycją regresyjną przed betą. Nie używano iPada ani fizycznego
urządzenia.

## Wynik

Implementacja 4.4 jest gotowa. Aplikacja nie udaje pełnego trybu offline: odczyt
może korzystać z bieżącego cache, formularz zachowuje niezapisane pola tylko w
pamięci, a każda mutacja wymaga dostępnej sieci i jawnej akcji użytkownika.
