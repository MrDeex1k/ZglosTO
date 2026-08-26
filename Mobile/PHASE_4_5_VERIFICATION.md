# Faza 4.5 — dostępność i regresja MVP mieszkańca

Data weryfikacji: 2026-08-21.

## Zakres

- semantyczne role, stany i etykiety kontrolek;
- minimalny cel dotykowy 44 pt/dp;
- dostępne komunikaty walidacji i błędów;
- Dynamic Type oraz powiększenie tekstu;
- respektowanie systemowego ograniczenia ruchu;
- kontrola nawigacji, formularzy i list po zmianach dostępności;
- jawne oddzielenie dowodów automatycznych od odsłuchu screen readera.

## Zmiany

- przyciski przekazują stan `disabled` do platformowego accessibility tree;
- pola tekstowe przekazują stan `disabled` i mają skalowalny bazowy rozmiar tekstu;
- wybór języka i służby używa roli `radio` oraz stanu `checked`;
- checkbox ma nazwę dostępną niezależnie od wizualnego znacznika;
- błędy formularzy mają wspólny komponent z rolą `alert` i live region;
- przejścia obrazów są wyłączane przy systemowym `reduce motion`;
- tytuły tras logowania i rejestracji są lokalizowane;
- przyciski centrują wielowierszowe etykiety i rosną wraz z tekstem.

## Testy automatyczne

- polityka przejścia obrazu ma test dla zwykłego i ograniczonego ruchu;
- Mobile: 28 plików testowych i 96 testów zakończone powodzeniem;
- typecheck i lint Mobile zakończone powodzeniem;
- pełny `pnpm check` obejmuje eksport Android i iOS.

## Android Emulator

Na `emulator-5554` sprawdzono:

- font scale `1.5`: feed, przyciski, badge, statusy i karty pozostają czytelne,
  a lista przewijalna;
- accessibility tree po przeładowaniu wystawia wybór języka jako natywne
  `RadioButton`, z `checkable=true` oraz poprawnym `checked`;
- przyciski i wybory mają wysokość przekraczającą 44 dp;
- karty zgłoszeń mają scaloną etykietę opis, adres i służba oraz są klikalne;
- TalkBack został tymczasowo włączony i był związany jako usługa z feedbackiem
  spoken/haptic/audible.

Nie deklarujemy odsłuchu syntezatora mowy: dowodem jest stan usługi i drzewo
dostępności, nie subiektywna ocena audio. Po teście TalkBack wyłączono, a font scale
przywrócono do `1.0`.

## iPhone Simulator

Na iPhone 16 Pro Simulator sprawdzono:

- maksymalną kategorię
  `accessibility-extra-extra-extra-large` na formularzu rejestracji;
- formularz pozostaje przewijalny, kontrolki nie są ucięte i zachowują kolejność;
- po przywróceniu kategorii `large` tytuł trasy i formularz renderują się poprawnie;
- lokalizowany tytuł `Rejestracja` jest używany zamiast surowej nazwy trasy.

Terminal nie ma dostępu do interaktywnego Accessibility Inspector ani sterowania
VoiceOver. Ręczny odsłuch VoiceOver pozostaje kontrolą przed betą i nie jest w tym
raporcie oznaczony jako wykonany. Nie używano iPada ani fizycznego urządzenia.

## Wynik

Implementacja 4.5 jest gotowa: usunięto wykryte problemy semantyki, dużego tekstu i
reduce motion. Faza nie zastępuje niezależnego, ręcznego przeglądu VoiceOver oraz
TalkBack wymaganego przed betą.

## Końcowa regresja Fazy 4

Po implementacji 4.5 dodano wspólny scenariusz Maestro 2.8.0. Przeszedł on w
całości na iPhone 17 Pro Simulator (iOS 26.5) i Pixel 9 Android Emulator, obejmując
PL/EN, walidację i rejestrację, sesję mieszkańca, konto, dokumenty, kontakt i
wylogowanie. Scenariusz nie zastępuje odsłuchu czytników ekranu.
