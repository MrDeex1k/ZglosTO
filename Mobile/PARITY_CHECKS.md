# Kontrole parytetu

Każdy scenariusz ma dowód dla iOS i Androida: build, urządzenie/system, nagranie lub
zrzuty, log request ID, wynik i reviewer. Parytet oznacza zgodność zachowania i
kontraktu, nie identyczne piksele.

Stan Fazy 3 jest zapisany w [PHASE_3_ACCEPTANCE.tsv](PHASE_3_ACCEPTANCE.tsv).
`PASS-CONDITIONAL` zamyka lokalną niewiadomą architektoniczną, ale nie zaznacza
poniższej kontroli parytetu jako wykonanej. Pozycje wymagające urządzenia fizycznego
lub iPada pozostają odroczone zgodnie z D-16.

## Środowisko

- [ ] publiczny HTTPS działa z fizycznego urządzenia;
- [ ] development/preview build wskazuje poprawne środowisko;
- [ ] konto mieszkańca, służby i admina ma kontrolowane dane testowe;
- [ ] White-Label version/checksum są zapisane;
- [ ] po każdym teście prywatne dane są usuwane.

## Start i White-Label

- [ ] poprawna nazwa, herb/logo i kolory;
- [ ] aktywne usługi w poprawnej kolejności;
- [ ] `pl-PL` i `en`, trwały wybór języka;
- [ ] konfiguracja z ETag daje 304 i używa cache;
- [ ] brak sieci używa ostatniej poprawnej konfiguracji;
- [ ] błędna konfiguracja nie uruchamia częściowo aplikacji;
- [ ] root-relative asset URL jest rozwiązany względem originu.

## Publiczny feed

- [ ] loading;
- [ ] empty;
- [ ] dane rozwiązanych incydentów;
- [ ] error + retry;
- [ ] pull-to-refresh;
- [ ] status, usługa, opis, adres, daty i zdjęcie;
- [ ] szczegóły otwierają się i wracają do właściwej pozycji listy;
- [ ] publiczna odpowiedź nie ujawnia e-maila.

## Auth

- [ ] poprawne i niepoprawne logowanie;
- [ ] rate limit ma czytelny komunikat bez ujawniania szczegółów;
- [ ] sesja przeżywa cold restart;
- [ ] session role i `serviceKey` są poprawne;
- [ ] `401` wylogowuje lokalnie bez pętli;
- [ ] `403` nie usuwa bez potrzeby ważnej sesji;
- [ ] sign-out usuwa cookie, prywatne query i prywatne pliki;
- [ ] zmiana konta nie pokazuje cache poprzedniego użytkownika;
- [ ] deep link weryfikacji e-maila działa po instalacji i przez fallback web.

## Rejestracja

- [ ] imię, e-mail, hasło i zgody mają ten sam kontrakt;
- [ ] błędy inline są dostępne dla screen readera;
- [ ] istniejący użytkownik i słabe hasło mają poprawny komunikat;
- [ ] po sukcesie route zależy od zweryfikowanej roli, nie lokalnego założenia;
- [ ] wcześniejsze anonimowe zgłoszenia są przypisywane dopiero po weryfikacji e-maila.

## Zgłoszenie

- [ ] ostrzeżenie 112 jest widoczne i czytane;
- [ ] wymagane: usługa, adres, opis, poprawny e-mail;
- [ ] e-mail sesji nie może zostać podmieniony;
- [ ] bez zdjęcia;
- [ ] zdjęcie JPEG i PNG z biblioteki;
- [ ] zdjęcie z aparatu;
- [ ] dokładnie 5 MiB;
- [ ] ponad 5 MiB odrzucone przed uploadem;
- [ ] nieobsługiwany MIME odrzucony;
- [ ] poprawny SHA-256, rozmiar i presigned headers;
- [ ] anulowanie i retry nie tworzą duplikatu;
- [ ] offline zachowuje dane formularza w pamięci;
- [ ] sukces invaliduje publiczny/prywatny cache zgodnie z kontraktem.

## Panel mieszkańca

- [ ] tylko zgłoszenia przypisane do `user.id`;
- [ ] empty i lista;
- [ ] nieweryfikowany e-mail ma ostrzeżenie;
- [ ] szczegóły prywatnego zgłoszenia;
- [ ] prywatne zdjęcie wymaga sesji;
- [ ] wylogowanie podczas otwartego szczegółu zamyka dane.

## Panel służby

- [ ] tylko incydenty zgodne z `serviceKey`;
- [ ] filtry all/reported/in_progress/resolved i liczniki;
- [ ] brak `serviceKey` ma bezpieczny stan;
- [ ] checked i status są walidowane;
- [ ] zdjęcie rozwiązania przechodzi presigned upload;
- [ ] cudzy incydent zwraca bezpieczny 404;
- [ ] invalidacja pokazuje stan serwera;
- [ ] słaba sieć nie powoduje podwójnej mutacji.

## Admin

- [ ] wszystkie i nieprzypisane;
- [ ] przypisanie usługi;
- [ ] checked/status;
- [ ] nadanie roli mieszkaniec/służby;
- [ ] `serviceKey` wymagany tylko dla służby;
- [ ] akcje mają potwierdzenie i wynik audytowalny;
- [ ] admin nie może nadać nieaktywnej usługi.

## Accessibility

- [ ] VoiceOver;
- [ ] TalkBack;
- [ ] duży tekst i maksymalna skala wspierana przez wymagania;
- [ ] reduce motion;
- [ ] kontrast jasny/ciemny, jeśli dark mode wejdzie do zakresu;
- [ ] targets ≥ 44;
- [ ] status nie polega tylko na kolorze;
- [ ] poprawna kolejność focusu i powrót po modalu;
- [ ] klawiatura nie zasłania aktywnego pola/submit;
- [ ] orientacja i split-screen, jeśli objęte macierzą.

## Wydajność i stabilność

- [ ] cold start mierzony na ustalonych urządzeniach;
- [ ] lista 100+ elementów bez zauważalnego janku;
- [ ] brak nieograniczonego wzrostu pamięci po obrazach i nawigacji;
- [ ] obrazy mają kontrolowany rozmiar/cache;
- [ ] brak ciężkiej pracy SHA-256 na JS thread bez pomiaru;
- [ ] app/bundle size zapisane;
- [ ] brak crasha przy odmowie uprawnień aparatu/biblioteki;
- [ ] tryb airplane → online poprawnie wznawia query.

## Release

- [ ] development, preview i production mają odrębne identyfikatory/środowiska;
- [ ] EAS runtime version i update channel są kontrolowane;
- [ ] rollout/rollback OTA sprawdzony;
- [ ] staged store rollout i rollback binary opisane;
- [ ] privacy manifest/declarations pokrywają aparat, zdjęcia, storage i telemetrykę;
- [ ] support zna wersję aplikacji, config version i correlation ID;
- [ ] końcowy reviewer jest niezależny od autora przepływu.
