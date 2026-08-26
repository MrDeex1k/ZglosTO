# Faza 4.2 — konto mieszkańca i język

Data weryfikacji: 2026-08-21.

## Zakres

- chroniona trasa `/account` w grupie mieszkańca;
- profil z nazwą, e-mailem, rolą i stanem weryfikacji adresu;
- wejścia do języka, kontaktu i informacji prawnych;
- diagnostyka bez sekretów: wersja aplikacji, config version, środowisko i locale;
- wylogowanie korzystające z istniejącego czyszczenia sesji oraz prywatnego cache;
- trasa `/settings/language` dostępna niezależnie od roli;
- natychmiastowa zmiana PL/EN i trwały zapis w AsyncStorage;
- role i stany accessibility dla wyboru języka.

## Weryfikacja

Android Emulator:

- konto poprawnie odczytało aktywną sesję mieszkańca;
- stan zweryfikowanego e-maila i diagnostyka były zgodne z serwerem/runtime;
- zmiana `en → pl-PL` natychmiast przetłumaczyła ekran;
- cold restart uruchomił publiczny start po polsku, potwierdzając trwałość wyboru.

iPhone 16 Pro Simulator, iOS 18.6:

- ekran języka wyrenderował poprawny układ i polskie tłumaczenia;
- konto pozostało chronione przez stan sesji; nie wstrzykiwano testowej sesji.

Nie testowano iPada ani urządzeń fizycznych.

## Wynik

Krok 4.2 jest zrealizowany. Wspólny ekran konta służby pozostaje zakresem Fazy 5.
