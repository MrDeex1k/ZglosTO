# Audyt istniejących widoków

## Źródła

Widoki zostały przeanalizowane w:

- `frontend/src/app/route-views.tsx`;
- `frontend/src/components/AppViews.tsx`;
- formularzach logowania, rejestracji i zgłoszenia;
- kartach oraz dialogach mieszkańca, służb i admina;
- `frontend/src/App.css`;
- konfiguracji White-Label i i18n.

Uruchomiono także frontend w przeglądarce. Bez backendu/auth możliwe było
zweryfikowanie shellu, brandingu, stopki oraz stanu błędu. Pełna inspekcja danych i
widoków chronionych wymaga środowiska integracyjnego.

## Charakter obecnego UI

- layout jest responsywny i card-based;
- mobile web używa zwartego nagłówka z menu;
- desktop/tablet rozwijają nawigację i miniatury zdjęć;
- główne operacje są zamknięte w dialogach;
- statusy i usługi są rozpoznawalne przez badge, kolor i ikonę;
- white-label dostarcza herb, nazwy, kolory, kontakt i lokalne treści;
- istotne stany: loading, empty, error, success, brak weryfikacji e-maila;
- formularze mają walidację Zod i komunikaty inline;
- publiczny ekran eksponuje CTA zgłoszenia oraz ostatnio rozwiązane incydenty.

## Co zachować

- hierarchię informacji na karcie: usługa, status, opis, adres, daty i zdjęcie;
- ostrzeżenie, że system nie zastępuje numeru alarmowego 112;
- role i zakresy danych;
- wszystkie stany pustki, błędu i ładowania;
- rozróżnienie zdjęcia zgłoszenia i zdjęcia rozwiązania;
- wskazanie nieweryfikowanego e-maila;
- języki `pl-PL` i `en`;
- linki do mapy, telefonu i e-maila;
- semantyczne statusy: `reported`, `in_progress`, `resolved`.

## Czego nie kopiować 1:1

| Web                           | Mobile                                                 |
| ----------------------------- | ------------------------------------------------------ |
| header z trzema breakpointami | natywne tabs + stack header + account menu             |
| dialog formularza             | route modalny/pełnoekranowy z obsługą klawiatury       |
| dialog szczegółów             | ekran szczegółów w stosie                              |
| `<img>`                       | `expo-image`                                           |
| `<input type=file>` i `File`  | `expo-image-picker`/aparat i `SelectedMedia`           |
| `window.location.reload()`    | `refetch()` i retry state                              |
| `localStorage` locale         | AsyncStorage/preferences                               |
| `<a href=mailto/tel>`         | `Linking.openURL` po walidacji scheme                  |
| link Google Maps `_blank`     | `Linking` z fallbackiem do URL                         |
| webowy CSS/Tailwind/shadcn    | NativeWind + lokalne komponenty React Native Reusables |
| automatyczne cookie           | SecureStore + jawny `Cookie` header                    |
| preload route loader          | TanStack Query w ekranie/feature                       |

## Adaptacja ekranów

### Start

- natywny tytuł i branding miasta;
- CTA „Zgłoś incydent” widoczny bez scrollowania na typowych telefonach;
- publiczna lista jako `FlatList`;
- pull-to-refresh i retry bez przeładowania całej aplikacji;
- miniatura ładowana przez `expo-image`;
- szczegóły jako push.

### Zgłoszenie

- `KeyboardAvoidingView`/właściwe zachowanie klawiatury;
- scroll do pierwszego błędu;
- wybór usługi z aktywnego katalogu;
- osobne akcje „Zrób zdjęcie” i „Wybierz z biblioteki”;
- preview, usuń i ponów upload;
- czytelny postęp: przygotowanie → upload → zapis;
- ochrona przed wielokrotnym submit;
- zachowanie draftu po błędzie sieci w pamięci; trwały draft dopiero po decyzji
  prywatności.

### Szczegóły incydentu

- sekcje Informacje, Lokalizacja i Zdjęcia;
- porównanie „przed/po” pionowo na telefonie;
- adres jako akcja otwarcia mapy;
- ważne identyfikatory/dane selectable;
- prywatne zdjęcia pobierane autoryzowanym klientem.

### Panel mieszkańca

- karta profilu i stan weryfikacji;
- wirtualizowana lista „Moje zgłoszenia”;
- CTA nowego zgłoszenia w headerze lub floating action, jeśli testy dostępności to
  zaakceptują;
- nie wyświetla danych po wylogowaniu ani zmianie użytkownika.

### Panel służby

- kolejka jako główny tab;
- segment/filter chips statusów;
- pull-to-refresh i paginacja, gdy backend ją udostępni;
- szczegóły z kontrolowanym statusem, checked i zdjęciem rozwiązania;
- konflikty aktualizacji i utrata uprawnień mają jawny komunikat;
- nie używać optymistycznej aktualizacji dla zdjęcia bez potwierdzenia serwera.

### Panel admina

- osobne taby/ekrany: przegląd, wszystkie/nieprzypisane zgłoszenia, uprawnienia;
- obecne duże dialogi rozbić na ekrany z sekcjami;
- formularz nadawania ról wymaga potwierdzenia destrukcyjnych zmian;
- zakres admina nie powinien blokować pierwszego wydania mieszkańca/służb.

### Konto i ustawienia

- profil, rola, przypisana służba;
- język;
- kontakt i informacje prawne;
- wylogowanie jako destrukcyjna akcja z czyszczeniem prywatnego cache;
- wersja aplikacji/config version w sekcji diagnostycznej.

## Accessibility

- minimalny target dotykowy 44×44 pt/dp;
- screen reader labels nie mogą polegać wyłącznie na kolorze lub ikonie;
- status zawsze ma tekst;
- font scaling i bardzo duży tekst nie mogą ucinać badge ani przycisków;
- formularz ma jawne etykiety, hints i `accessibilityLiveRegion` dla błędów/postępu;
- animacje respektują reduce motion;
- kolejność focusu po zamknięciu modala wraca do triggera;
- zdjęcia mają zlokalizowany opis;
- testy VoiceOver i TalkBack są obowiązkowe w checkpointcie.

## Wniosek wizualny

Istniejący język wizualny jest wystarczająco prosty, by odtworzyć go natywnie:
jasne tło, białe karty, brand primary, akcent, semantyczne statusy i niewielkie
zaokrąglenia. Największą zmianą nie będzie styl, lecz przekształcenie dialogowego
modelu interakcji w nawigację ekranową oraz poprawna obsługa zdjęć, klawiatury i
sesji.
