# Weryfikacja kroku 3.2 — Better Auth i sesja mieszkańca

Data: 2026-08-20

## Zakres

Krok dostarcza pierwszy rzeczywisty przepływ uwierzytelnienia aplikacji mobilnej:

- plugin `@better-auth/expo` po stronie Authorization i klienta;
- przechowywanie cookie/cache sesji przez `expo-secure-store`;
- ekran logowania e-mail/hasło z walidacją, stanem oczekiwania i bezpiecznym błędem;
- mapowanie backendowych ról na role nawigacji Mobile;
- jawne przekazywanie cookie w chronionych requestach przez `expo/fetch`;
- obsługę `401`, `403`, błędu sieci i wylogowania;
- czyszczenie sesji SecureStore i prywatnych query przy wylogowaniu lub `401`;
- trasę mieszkańca chronioną stanem sesji.

Rejestracja, odzyskiwanie hasła, weryfikacja e-maila, historia zgłoszeń mieszkańca
oraz funkcjonalny panel służb nie należą do kroku 3.2.

## Konfiguracja serwera i klienta

Obie strony używają dokładnie `better-auth`/`@better-auth/expo` `1.6.29`.
Authorization ma plugin Expo oraz zaufany schemat `zglosto://`. Mobile używa
`expo-secure-store` i `expo-network` `57.0.1`, a klient Better Auth otrzymuje pełny
URL `/api/auth` z walidowanego originu runtime.

Do testów lokalnych uruchomiono proxy `scripts/restricted-phase3-proxy.mjs` na
loopback Maca. Allowlista obejmuje wyłącznie:

- `GET /api/auth/get-session`;
- `POST /api/auth/sign-in/email`;
- `POST /api/auth/sign-out`;
- publiczną konfigurację, feed oraz publiczne obrazy wymagane przez start aplikacji.

Proxy blokuje m.in. rejestrację. iPhone Simulator używa
`http://127.0.0.1:18135`, a Android Emulator `http://10.0.2.2:18135`. Quick Tunnel
nie został uruchomiony dla auth, dzięki czemu dane logowania i cookie nie opuściły
lokalnego Maca.

## Dowody HTTP i automatyczne

- utworzenie lokalnego konta testowego przez bezpośredni endpoint serwera: `200`;
- logowanie Better Auth przez ograniczone proxy: `200`;
- pobranie sesji z otrzymanym cookie: `200`, rola `mieszkaniec`;
- niedozwolony endpoint rejestracji przez proxy: `404`;
- testy warstwy auth obejmują mapowanie ról i zachowanie requestów dla `401`/`403`;
- testy pakietów Authorization, Mobile i wspólnego i18n przechodzą.

Konta użyte w checkpointcie istnieją wyłącznie w lokalnej bazie developerskiej.
Hasła i cookie nie są zapisane w dokumentacji ani logach aplikacji.

## Macierz urządzeń

| Platforma | Urządzenie                            | Wynik                                                                                                                                |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| iOS       | iPhone 16 Pro Simulator, iOS 18.6     | natywny build i instalacja zakończone sukcesem; publiczny feed, połączenie z lokalnym API i ekran logowania wyświetlone poprawnie    |
| Android   | Pixel 9 Emulator, Android 17 / API 37 | natywny build, rzeczywiste logowanie mieszkańca, panel mieszkańca, cold restart, odtworzenie sesji i wylogowanie zakończone sukcesem |

Pełnego wpisania danych logowania nie automatyzowano na iPhone Simulator z powodu
braku uprawnień do automatyzacji wejścia. Nie testowano fizycznego iPhone'a, iPada
ani fizycznego urządzenia Android — zgodnie z bieżącym zakresem właściciela projektu.

## Zachowanie sesji potwierdzone na Androidzie

1. anonimowy użytkownik widzi akcję logowania;
2. poprawne dane otwierają chroniony ekran mieszkańca;
3. zatrzymanie procesu i cold restart zachowują sesję w SecureStore;
4. start publiczny rozpoznaje sesję i udostępnia przejście do panelu;
5. wylogowanie usuwa lokalne auth data i prywatne query;
6. po wylogowaniu ekran publiczny ponownie pokazuje akcję logowania.

## Quality gate i ograniczenia

- Expo Doctor: `21/21`;
- React Doctor: brak nowych błędów; pięć wcześniejszych ostrzeżeń o ręcznej
  memoizacji w providerach fundamentu pozostaje poza zakresem 3.2;
- pełne `CI=true pnpm check`: sukces, łącznie z testami wszystkich workspace'ów i
  eksportem bundle Mobile na obie platformy;
- lokalny build iOS: sukces;
- lokalny build Android: sukces.

Pełny build wszystkich obrazów Compose ujawnił istniejący, niezwiązany z Mobile
problem obrazu `llm_gateway`: brak rozwiązywania pakietu
`@zglosto/observability`. Obraz Authorization został zbudowany osobno, a usługi
wymagane przez checkpoint uruchomiły się poprawnie i były zdrowe.

## Decyzja

Krok 3.2 spełnia techniczny cel integracji Better Auth i trwałej sesji na lokalnych
symulatorach. Można przejść do kroku 3.3: prywatnej historii jednego mieszkańca,
z zachowaniem testu pełnego logowania na iOS jako jawnego testu ręcznego przed
zamknięciem całej Fazy 3.
