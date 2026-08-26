# API, auth, media i konfiguracja

## Publiczny origin

Mobile nie może używać webowych ścieżek względnych. Każde środowisko dostarcza
absolutny publiczny origin HTTPS, np.:

```text
EXPO_PUBLIC_API_ORIGIN=https://example-city.invalid
```

To nie jest sekret. Wszystkie requesty przechodzą przez Nginx/Ingress:

- `${origin}/api/auth/*` → Authorization;
- `${origin}/api/*` → Backend;
- aplikacja nie łączy się bezpośrednio z portami usług;
- aplikacja nie otrzymuje certyfikatów mTLS.

Na etapie buildów lokalnych źródłem wartości jest lokalny plik `Mobile/.env`
utworzony na podstawie wersjonowanego `Mobile/.env.example`. Każde środowisko musi
mieć osobną wartość. `EXPO_PUBLIC_*` jest osadzane w kliencie i nigdy nie może
zawierać sekretów. EAS environments można dodać dopiero wraz z decyzją o EAS Build.

## Auth — stan kroku 3.2

Źródłem prawdy pozostaje Better Auth. Zaimplementowany przepływ:

1. Authorization włącza oficjalny plugin `@better-auth/expo`.
2. Aplikacja tworzy klienta Better Auth z `expoClient`.
3. Cookie/cache sesji trafia do Expo SecureStore.
4. Wywołania Better Auth korzystają z absolutnego publicznego `baseURL`.
5. Chronione wywołania backendu pobierają `authClient.getCookie()` i ustawiają
   `Cookie`; `credentials` ma wartość `omit`.
6. Backend przekazuje cookie do Authorization i sam nie interpretuje sesji.
7. Role i `serviceKey` są odczytywane wyłącznie ze zweryfikowanej sesji.

Authorization ma plugin `@better-auth/expo` i ufa schematowi `zglosto://`. Klient
używa tej samej, dokładnie przypiętej wersji Better Auth, a adapter SecureStore ma
prefiks `zglosto`. Requesty domenowe korzystają z osobnej warstwy
`authenticated-fetch`, która pobiera cookie z klienta i nie polega na webowym
mechanizmie `credentials: include`.

Lokalny checkpoint na symulatorach używa ograniczonego proxy loopback. Proxy
udostępnia tylko publiczną konfigurację/feed/obrazy oraz trzy wymagane endpointy
sesji (`get-session`, `sign-in/email`, `sign-out`); rejestracja i pozostałe ścieżki
są blokowane. Zewnętrzny Quick Tunnel nie jest używany do przesyłania danych logowania.

### Zachowanie błędów

- `401`: unieważnij sesję lokalną, wyczyść prywatny cache, zachowaj bezpieczny
  redirect intent i pokaż logowanie;
- `403`: pozostaw sesję, pokaż brak uprawnień i odśwież session/role;
- `404` w roli służby: nie ujawniaj, czy incydent istnieje poza zakresem;
- network error: nie traktuj jako wylogowania;
- sign-out: wywołaj serwer, a następnie niezależnie wyczyść lokalne sekrety/cache.

### Historia mieszkańca — krok 3.3

`GET /api/mieszkaniec/incydenty` przechodzi przez `authenticated-fetch`, który
ustawia cookie z klienta Better Auth oraz `credentials: omit`. Odpowiedź jest
walidowana przez `parseCurrentIncidentList`. Query key zawiera rolę, `userId` i
origin, nie jest utrwalany oraz należy do przestrzeni usuwanej przy `401` i
wylogowaniu. `403` odświeża rolę bez automatycznego kasowania poprawnej sesji.

## Deep links — stan kroku 3.8

Custom scheme `zglosto://` obsługuje dokładnie `/open/incidents/:uuid` oraz
`/auth/email-verified`. Target incydentu ma zamkniętą allowlistę `public`,
`resident`, `service`; prywatny login intent zawiera tylko rolę i UUID. Nie można
przekazać arbitralnego URL, `returnTo`, tokenu sesji ani tokenu weryfikacji.

Callback e-maila nie potwierdza wyniku na podstawie samego otwarcia linku. Token
zużywa Better Auth po HTTPS, a aplikacja dostaje URL bez tokenu, odświeża sesję i
ufa wyłącznie serwerowej fladze `emailVerified`. Niezgodna rola wraca do własnego
panelu zamiast próbować otwierać cudze dane.

Opcjonalny `MOBILE_APP_LINK_HOST` generuje Associated Domains i Android intent
filters wyłącznie dla `/open/*` oraz `/auth/email-verified`. Bez własnego hosta
deklaracje są nieaktywne. Szczegóły aktywacji, AASA, `assetlinks.json` i fallbacku
web opisuje [APP_LINK_CONTRACT.md](APP_LINK_CONTRACT.md). Ich wdrożenie pozostaje
bramką przed release.

## Warstwa klienta API

Jeden klient:

- buduje URL z walidowanego originu;
- wybiera request publiczny lub chroniony;
- ustawia `Accept`, JSON i correlation ID, jeśli kontrakt go dopuszcza;
- sprawdza `response.ok`;
- mapuje błędy HTTP do typowanego `ApiError`;
- parsuje odpowiedź przez `@zglosto/contracts`;
- nie loguje body zawierającego PII;
- wspiera `AbortSignal`;
- używa `expo/fetch`.

Nie przenosić `frontend/src/services/api.ts` wprost. Ten plik używa
`credentials: include`, przeglądarkowego `File` i `crypto.subtle`.

## Macierz API

Pełna macierz znajduje się w `SCREENS.tsv` i kontrakcie repozytorium. Minimalny
checkpoint wykorzystuje:

| Metoda    | Publiczna ścieżka                              | Rola                                        |
| --------- | ---------------------------------------------- | ------------------------------------------- |
| GET       | `/api/config/public`                           | public                                      |
| GET       | `/api/mieszkaniec/incydenty/glowna`            | public                                      |
| POST      | `/api/mieszkaniec/incydenty`                   | public/optional session                     |
| GET       | `/api/mieszkaniec/incydenty`                   | mieszkaniec                                 |
| POST      | `/api/mieszkaniec/obrazy/uploads`              | public/optional session zgodnie z backendem |
| GET       | `/api/sluzby/incydenty`                        | służby                                      |
| GET       | `/api/sluzby/statystyki`                       | służby                                      |
| PATCH     | `/api/sluzby/incydenty/:id/status`             | służby                                      |
| PATCH     | `/api/sluzby/incydenty/:id/sprawdzenie`        | służby                                      |
| POST      | `/api/sluzby/incydenty/:id/obrazy/uploads`     | służby                                      |
| POST      | `/api/sluzby/incydenty/:id/zdjecie_rozwiazane` | służby                                      |
| GET       | `/api/images/:id`                              | właściciel lub przypisana służba            |
| GET/PATCH | `/api/admin/*`                                 | admin                                       |

Mutacje służby zmieniające status, weryfikację albo przypisanie wymagają nagłówka
`If-Match: "incident-N"`, gdzie `N` pochodzi z ostatniej odpowiedzi kolejki.
Backend sprawdza rewizję atomowo razem z `incidentId` i zakresem sesji. Sukces
zwraca nową `revision`; stara rewizja zwraca `409`, brak lub niepoprawny nagłówek
`400`, a rekord spoza zakresu `404`. Klient po `409` odświeża dane i nie ponawia
zapisu automatycznie.

Krok 3.5 rozszerza `POST /api/mieszkaniec/incydenty` o opcjonalny upload zdjęcia.
Request i response inicjacji oraz utworzenia są walidowane przez
`@zglosto/contracts`. Dla mieszkańca authenticated fetch przekazuje cookie, a dla
zgłoszenia anonimowego używany jest klient publiczny. Po sukcesie aplikacja
invaliduje właściwe query keys.

Przed implementacją należy wygenerować tę tabelę ponownie z aktywnych kontrolerów i
testów integracyjnych, ponieważ dokument baseline zawiera także historyczne opisy
base64 obok wdrożonego presigned uploadu.

## Upload zdjęcia

Zaimplementowany przepływ:

1. użytkownik wybiera zdjęcie lub uruchamia aparat;
2. aplikacja waliduje MIME i limit `INCIDENT_IMAGE_MAX_BYTES`;
3. aplikacja uzyskuje rozmiar pliku i SHA-256 bez base64;
4. `POST .../uploads` zwraca `uploadUrl`, metodę, nagłówki i `uploadId`;
5. aplikacja wykonuje presigned PUT dokładnie z nagłówkami kontraktu;
6. do utworzenia/aktualizacji incydentu wysyła tylko `uploadId`;
7. TanStack Query invaliduje odpowiednie listy;
8. aplikacja prezentuje etapy przygotowania, uploadu i zapisu oraz zachowuje formularz
   do ponowienia po błędzie.

Lokalny endpoint storage ma postać `http://uploads.127.0.0.1.nip.io:1235`. Alias
rozwiązuje się do loopback zarówno na iOS, jak i Androidzie; Android Emulator używa
`adb reverse tcp:1235 tcp:1235`. Nie wolno przepisywać hosta już podpisanego URL.

Po kroku 3.5 potwierdzono na Android Emulator:

- URI z systemowego photo pickera, odczyt bytes i SHA-256;
- automatyczny `Content-Length` podpisany przez provider;
- retry całego przepływu tworzące nowy presigned URL bez duplikatu incydentu;
- przetworzenie uploadu przez media worker.

Nadal trzeba potwierdzić:

- zachowanie URI z aparatu i biblioteki na iOS;
- ręczne anulowanie dłuższego uploadu na obu platformach;
- orientację i metadane zdjęcia;
- odmowę i ponowne nadanie uprawnień.

## Pobieranie zdjęć — stan kroku 3.6

Publiczne zdjęcie rozwiązania jest ładowane bez sesji tylko wtedy, gdy backend
oznacza je jako publiczne. Dla prywatnych obrazów wdrożono drugi z analizowanych
wzorców:

1. chroniony klient pobiera `/api/images/:id` z cookie w nagłówku;
2. odpowiedź przechodzi kontrolę statusu, MIME, rozmiaru i zgodności ID;
3. bytes trafiają do katalogu `zglosto-private-images/<userId>` pod nazwą z ID i
   checksumą;
4. `expo-image` renderuje lokalny URI z wyłączonym własnym cache dyskowym;
5. prywatne query i cały katalog są usuwane przy `401` oraz wylogowaniu.

Cookie nie trafia do query string, logów ani komponentu obrazu. Pliki nie są
utrwalane pomiędzy sesjami użytkowników.

## Panel służb — stan kroku 3.7

Lista i statystyki używają osobnych query keys zawierających `userId`, `serviceKey`
i origin. Mutacje statusu oraz weryfikacji po sukcesie invalidują oba zasoby.
Zdjęcie rozwiązania powtarza bezpieczny pipeline z kroku 3.5, ale po PUT wywołuje
endpoint dołączenia `uploadId` do istniejącego incydentu. UI blokuje równoległe
wysłanie tej samej mutacji, a retry rozpoczyna nową inicjację presigned uploadu.

## White-Label

Odpowiedź `/api/config/public`:

- jest publiczna;
- ma `configVersion`, `checksum`, konfigurację i ETag;
- jest walidowana parserem współdzielonym;
- może być cache'owana i rewalidowana;
- nie zawiera sekretów.

Mobile przekształca kolory na theme, rozwiązuje ścieżki assetów względem originu i
filtruje tylko aktywne usługi. Zmiana wdrożenia miasta nie jest wyborem użytkownika w
działającej aplikacji.

## Offline

Pierwsze wydanie:

- odczyt publicznej konfiguracji z ostatniego poprawnego cache;
- opcjonalny cache publicznego feedu;
- network status i czytelne retry;
- brak automatycznego kolejkowania zgłoszeń ze zdjęciami;
- formularz zachowany w pamięci po błędzie.

Pełna kolejka offline jest osobnym projektem: wymaga idempotency key, szyfrowanego
storage, retencji zdjęć, limitów i strategii konfliktów backendu.
