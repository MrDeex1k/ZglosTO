# Faza 4.3 — kontakt, informacje prawne i diagnostyka

Data weryfikacji: 2026-08-21.

## Zakres

- publiczna trasa `/support/contact`;
- adres, godziny pracy, e-mail, telefon i witryna pobierane wyłącznie ze
  zwalidowanego kontraktu White-Label;
- bezpieczne linki `mailto:`, `tel:` i HTTP(S) otwierane przez Expo Linking;
- normalizacja numeru telefonu z testami jednostkowymi;
- publiczna trasa `/legal` z lokalizowanym komunikatem prawnym miasta;
- developerskie ostrzeżenie o brakującym źródle regulaminu i polityki prywatności;
- przejście z informacji prawnych do danych operatora.

## Weryfikacja

Ekrany kontaktu i informacji prawnych wyrenderowano po polsku na Android Emulatorze
oraz iPhone 16 Pro Simulatorze. Dane zgadzały się z aktywną konfiguracją
`zglosto-2026-07-24-phase8-step14`.

Nie utworzono fikcyjnego regulaminu ani polityki prywatności. Obecny kontrakt
White-Label nie zawiera ich treści ani URL-i. Dostarczenie zatwierdzonych dokumentów
i rozszerzenie kontraktu pozostaje obowiązkową bramką przed betą.

## Wynik

Krok 4.3 jest zrealizowany w granicach dostępnego kontraktu. Brak dokumentów
prawnych nie blokuje dalszej implementacji developerskiej, ale blokuje betę.
