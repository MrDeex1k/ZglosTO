# Weryfikacja kroku 3.3 — prywatna historia mieszkańca

Data: 2026-08-20

## Zakres

Krok dostarcza pierwszą funkcję domenową po zalogowaniu mieszkańca:

- `GET /api/mieszkaniec/incydenty` przez autoryzowany `expo/fetch`;
- jawne cookie Better Auth i `credentials: omit`;
- walidację odpowiedzi przez `parseCurrentIncidentList` z `@zglosto/contracts`;
- prywatny query key rozdzielony `userId`, rolą, zasobem i originem;
- nieutrwalany cache usuwany przy `401` oraz wylogowaniu;
- wirtualizowaną listę `FlatList` ze statusami zgłoszeń;
- loading, empty, error, retry i pull-to-refresh;
- opis służby z aktywnej konfiguracji White-Label;
- datę zgłoszenia/rozwiązania oraz stan weryfikacji służby.

Prywatne szczegóły i obrazy, utworzenie nowego zgłoszenia oraz panel służb nie
należą do kroku 3.3.

## Granice bezpieczeństwa i prywatności

Backend wybiera dane na podstawie zweryfikowanego `user.id`; Mobile nie wyszukuje
historii po adresie e-mail. Query ma prefiks `private` i nie jest zapisywane w
AsyncStorage. Logi zawierają wyłącznie nazwę zdarzenia oraz stan sukces/błąd — bez
e-maila, treści zgłoszenia, cookie i odpowiedzi API.

Lokalne proxy loopback dopuszcza teraz także wyłącznie
`GET /api/mieszkaniec/incydenty`. Nie udostępnia endpointu rejestracji ani tworzenia
zgłoszenia. Quick Tunnel nie był używany; dane logowania i historia pozostały na
lokalnym Macu oraz emulatorach.

## Fixture i HTTP

Utworzono lokalne konto mieszkańca i jedno przypisane do niego zgłoszenie kontrolne.
Konto oraz dane istnieją wyłącznie w zachowanych wolumenach developerskich. Hasło i
cookie nie są zapisane w dokumentacji ani logach aplikacji.

Wyniki testu przez ograniczone proxy:

- logowanie Better Auth: `200`;
- pobranie prywatnej historii z cookie: `200`;
- liczba zgłoszeń kontrolnego mieszkańca: `1`;
- parser kontraktu zaakceptował pełny rekord historii.

## Macierz urządzeń

| Platforma | Urządzenie                            | Wynik                                                                                                                                                                             |
| --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS       | iPhone 16 Pro Simulator, iOS 18.6     | aktualny bundle uruchomiony; publiczna konfiguracja i feed pobrane przez lokalne API; pełne wprowadzenie danych logowania pozostaje testem ręcznym                                |
| Android   | Pixel 9 Emulator, Android 17 / API 37 | aktualny development client z SecureStore zbudowany i zainstalowany; logowanie, prywatna lista, status, cold restart, ponowne pobranie historii i wylogowanie zakończone sukcesem |

Nie testowano iPada ani urządzeń fizycznych, zgodnie z bieżącym zakresem.

## Scenariusz Android

1. anonimowy start pokazał akcję logowania;
2. lokalne konto mieszkańca zalogowało się przez Better Auth;
3. chroniony panel pobrał dokładnie jedno przypisane zgłoszenie;
4. karta pokazała status `reported`, adres, czas oraz oczekiwanie na weryfikację;
5. cold restart zachował cookie w SecureStore, ale nie prywatne dane query;
6. ponowne otwarcie panelu wykonało świeży request historii;
7. wylogowanie usunęło dostęp do panelu i przywróciło akcję logowania.

## Testy automatyczne

- poprawna historia przechodzi wspólny parser kontraktu;
- błędny status jest odrzucany jako błąd kontraktu;
- warstwa authenticated fetch dołącza cookie i obsługuje `401`/`403`;
- czyszczenie prywatnych query nie usuwa publicznej konfiguracji;
- Mobile: 12 plików testowych, 44 testy.
- pełne `CI=true pnpm check`: sukces, łącznie z testami wszystkich workspace'ów i
  eksportem bundle Mobile dla Androida oraz iOS.

React Doctor nie wykazuje nowych błędów; pozostaje pięć wcześniejszych ostrzeżeń o
ręcznej memoizacji w providerach fundamentu. Expo Doctor przechodzi 20/21 kontroli.
Jedyna niezaliczona kontrola wskazuje sześć patchy SDK 57 opublikowanych tego samego
dnia. Repozytorium prawidłowo blokuje je przez `minimumReleaseAge`, dlatego nie
obchodzono kwarantanny zależności i nie wyciszano diagnostyki. Aktualizację należy
ponowić po osiągnięciu wymaganego wieku paczek.

## Decyzja

Krok 3.3 spełnia cel prywatnej historii jednego mieszkańca. Następny krok Fazy 3
powinien rozpocząć przepływ utworzenia zgłoszenia bez zdjęcia, zanim zostaną dodane
wybór pliku, checksum i presigned upload.
