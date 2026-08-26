# Weryfikacja kroku 3.4 — utworzenie zgłoszenia bez zdjęcia

Data: 2026-08-20

## Zakres

Krok dostarcza pierwszy kompletny zapis domenowy z aplikacji mobilnej:

- modalny route `/report/new`, dostępny z publicznego startu i panelu mieszkańca;
- jeden responsywny formularz z opisem, adresem, e-mailem i wyborem aktywnej służby;
- widoczną informację, że aplikacja nie obsługuje sytuacji alarmowych;
- walidację i normalizację przez `CurrentCreateIncidentRequestSchema`;
- `POST /api/mieszkaniec/incydenty` przez wspólny klient oparty o `expo/fetch`;
- zgłoszenie anonimowe albo sesję mieszkańca dołączaną przez authenticated fetch;
- zablokowany e-mail zalogowanego mieszkańca zgodny z e-mailem sesji;
- walidację odpowiedzi przez `parseCurrentCreateIncidentResponse`;
- komunikaty dla błędu sieci, timeoutu, limitu `429` i błędu ogólnego;
- ekran sukcesu z numerem zgłoszenia;
- invalidację publicznego feedu oraz prywatnej historii zalogowanego mieszkańca.

Zdjęcie, lokalizacja urządzenia, checksum i presigned upload nie należą do kroku
3.4. Formularz wysyła dla nich jawne wartości `null` zgodne z kontraktem.

## Granice dostępu i prywatności

Backend pozostaje źródłem prawdy dla sesji oraz roli. Konto służby lub administratora
nie może użyć formularza mieszkańca. Gdy konfiguracja miasta wyłącza anonimowe
zgłoszenia, aplikacja kieruje anonimowego użytkownika do logowania.

Treść zgłoszenia, adres i e-mail nie są logowane ani utrwalane w lokalnym cache.
Lokalne proxy nasłuchuje wyłącznie na `127.0.0.1:18135`; jego allowlista została
rozszerzona dokładnie o `POST /api/mieszkaniec/incydenty`. Cloudflare Quick Tunnel
nie był używany.

## Macierz urządzeń

| Platforma | Urządzenie                            | Wynik                                                                                                                                                   |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android   | Pixel 9 Emulator, Android 17 / API 37 | pełny anonimowy przepływ: formularz, walidacja, wybrana służba, `201` i ekran sukcesu z numerem zgłoszenia                                              |
| iOS       | iPhone 16 Pro Simulator, iOS 18.6     | aktualny bundle, publiczna konfiguracja i modalny formularz po polsku wyrenderowane poprawnie; zapis korzysta z tej samej przetestowanej warstwy JS/API |

Nie testowano iPada ani urządzeń fizycznych, zgodnie z bieżącym zakresem.

## Test HTTP i Android

Proxy odrzuciło pusty request jako `400`, potwierdzając dostępność endpointu bez
tworzenia rekordu. Następnie aplikacja Android wysłała jedno anonimowe zgłoszenie
kontrolne. Backend zarejestrował `POST /mieszkaniec/incydenty` ze statusem `201`, po
czym aplikacja pokazała ekran `Report received` i identyfikator utworzonego rekordu.
Publiczny feed został zrewalidowany po mutacji.

## Testy automatyczne

- poprawny formularz jest trimowany i mapowany na aktualny kontrakt backendu;
- brak wymaganych pól i błędny e-mail zwracają błędy na poziomie pól;
- klient wysyła właściwą metodę, ścieżkę i JSON;
- niezgodna odpowiedź jest zatrzymywana jako błąd kontraktu;
- status `429` pozostaje dostępny dla warstwy prezentacji;
- Mobile: 14 plików testowych, 50 testów.

Pełne `CI=true pnpm check` przechodzi, włącznie z testami wszystkich workspace'ów i
eksportem bundle Mobile dla Androida oraz iOS. React Doctor nie wykazuje nowych
problemów; pozostaje pięć wcześniejszych ostrzeżeń o ręcznej memoizacji w providerach
fundamentu. Expo Doctor przechodzi 20/21 kontroli. Jedyna niezaliczona kontrola nadal
wskazuje sześć patchy SDK 57 opublikowanych tego samego dnia i blokowanych przez
repozytoryjne `minimumReleaseAge`; nie obchodzono kwarantanny ani nie wyciszano
diagnostyki.

## Decyzja

Krok 3.4 realizuje utworzenie zgłoszenia bez zdjęcia. Następny krok powinien dodać
wybór zdjęcia z biblioteki/aparatu, walidację pliku, SHA-256, presigned upload,
anulowanie i retry, a dopiero potem przekazać jednorazowy `upload_id` przy tworzeniu
zgłoszenia.
