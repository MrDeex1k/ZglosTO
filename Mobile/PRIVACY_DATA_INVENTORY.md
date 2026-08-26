# Inwentarz prywatności aplikacji Mobile

Data przeglądu: 2026-08-21.

## Deklaracja techniczna

- aplikacja nie śledzi użytkownika, nie zawiera SDK analitycznego ani reklamowego;
- dane są używane wyłącznie do funkcjonalności konta i obsługi zgłoszeń;
- iOS `PrivacyInfo.xcprivacy` deklaruje imię i nazwisko, e-mail, identyfikator
  użytkownika, adres zdarzenia, zdjęcia/wideo oraz inną treść użytkownika;
- wszystkie zadeklarowane typy są oznaczone jako powiązane z użytkownikiem lub
  zgłoszeniem, niewykorzystywane do trackingu i służące `App Functionality`;
- wymagane powody użycia UserDefaults, timestampów plików i czasu startu systemu
  pochodzą z agregacji manifestów Expo/React Native;
- Android prosi tylko o uprawnienia potrzebne do sieci, aparatu/biblioteki i
  działania development clienta; uprawnienie mikrofonu jest jawnie usunięte.

## Dane i retencja

| Dane                           | Źródło             | Cel                         | Lokalnie                            | Usunięcie lokalne                                  |
| ------------------------------ | ------------------ | --------------------------- | ----------------------------------- | -------------------------------------------------- |
| imię i nazwisko, e-mail        | rejestracja/konto  | konto i kontakt             | sesja/SecureStore przez Better Auth | wylogowanie, `401`, zmiana konta                   |
| adres i opis zdarzenia         | formularz          | przyjęcie zgłoszenia        | pamięć formularza                   | anulowanie, sukces, opuszczenie ekranu             |
| wybrane zdjęcie                | aparat/biblioteka  | załącznik zgłoszenia        | kontrolowany katalog cache          | usunięcie, sukces, opuszczenie ekranu, wylogowanie |
| prywatne zdjęcia zgłoszeń      | backend            | podgląd właściciela         | kontrolowany cache per sesja        | wylogowanie, `401`, zmiana konta                   |
| język i publiczna konfiguracja | użytkownik/backend | preferencje i start offline | AsyncStorage                        | reset aplikacji lub zastąpienie konfiguracji       |

Backendowa retencja, usunięcie konta, podmioty przetwarzające oraz zatwierdzone URL
regulaminu i polityki prywatności muszą zostać określone przez właściciela produktu
przed betą. Ten dokument jest inwentarzem implementacji, a nie poradą prawną ani
gotową treścią polityki prywatności.

## Dowód zgodności implementacji

- `clearLocalPrivateState` próbuje niezależnie usunąć SecureStore, prywatne query,
  cache obrazów i robocze media; awaria jednej warstwy nie blokuje pozostałych;
- formularz kopiuje media do `zglosto-selected-media` zamiast polegać na
  niekontrolowanym czasie życia URI pickera;
- logowanie zdarzeń ma allowlistę i nie przyjmuje body, cookie, e-maila ani zdjęcia;
- `extra.analyticsEnabled` pozostaje `false`;
- w aplikacji nie ma lokalizacji, kontaktów, push tokenów, reklam ani analityki.
