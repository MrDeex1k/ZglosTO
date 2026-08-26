# Scenariusz prezentacyjny Mobile

Scenariusz służy do krótkiej, powtarzalnej prezentacji aplikacji potencjalnemu klientowi.
Korzysta wyłącznie z lokalnego środowiska oraz syntetycznych kont i danych.

## Przygotowanie

```bash
pnpm mobile:demo:check
pnpm mobile:demo:up
pnpm mobile:demo:ios
# albo: pnpm mobile:demo:android
```

Losowe hasła są zapisywane z prawami `0600` w ignorowanym
`.state/mobile-demo/credentials.env`. Nie należy ich kopiować do dokumentacji ani logów.

## Przebieg prezentacji

1. Otwórz publiczny feed i pokaż rozwiązane sprawy z realistycznymi opisami, adresami,
   służbami oraz datami.
2. Otwórz szczegóły zgłoszenia i pokaż bezpieczne przejście do mapy oraz rozdział zdjęć
   publicznych od prywatnych.
3. Zaloguj konto mieszkańca. Pokaż własną historię ze stanami `zgłoszony`, `w trakcie`
   i `naprawiony`, a następnie konto, język, kontakt i informacje prawne.
4. Otwórz formularz zgłoszenia, wybierz Zarząd Dróg i dołącz
   `demo/assets/bus-roadworks-anonymized.png`. Nie trzeba wysyłać formularza podczas
   prezentacji portfolio.
5. Zaloguj konto służby. Pokaż kolejkę przypisaną do `roads`, liczniki, filtry i szczegóły.
6. Zaloguj konto administratora. Mobile powinien pokazać wyłącznie komunikat o wymaganym
   komputerze oraz przycisk wylogowania — bez danych i bez linku do WEB.
7. Zakończ przez `pnpm mobile:demo:clean`, jeśli środowisko nie jest już potrzebne.

## Zakres danych

Nazwy kont, adresy e-mail w domenie `example.test`, adresy ulic, współrzędne oraz opisy
incydentów są fikcyjne. Treści techniczne typu `Phase3.5_image_upload_test` nie są częścią
seedu prezentacyjnego i nie mogą pojawić się na publicznych screenshotach.

## Demo a wdrożenie produkcyjne

Demo udowadnia funkcjonalność, role, kontrakty i powtarzalny start lokalny. Produkcja
wymaga osobno zatwierdzonej domeny HTTPS, legalnych dokumentów operatora, sekretów,
monitoringu, kopii zapasowych, konfiguracji sklepów, testów fizycznych urządzeń i procesu
wydaniowego. Materiał prezentacyjny nie zastępuje tych bramek.
