# Plan wdrożenia aplikacji mobilnej

> **Status dokumentu:** archiwum wykonawcze Faz 0–7 i backlog po `1.0.0`. Bieżącym
> źródłem prawdy jest [CURRENT_STATE.md](CURRENT_STATE.md), a ścieżkę klienta opisuje
> [CLIENT_HANDOFF.md](CLIENT_HANDOFF.md). Mobile 1.0 ma status
> `SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED`.

Plan jest oparty na bramkach, nie na z góry ustalonych terminach. Każda faza kończy
się działającym przyrostem, dowodem urządzeniowym i decyzją o przejściu dalej.

> Polityka wykonawcza od 2026-08-20: do odwołania testy uruchamiamy wyłącznie na
> iPhone Simulator i Android Emulator. iPad i urządzenia fizyczne są odroczone i
> wymagają wyraźnego polecenia właściciela projektu.

## Mapa faz

| Faza | Nazwa                            | Główny rezultat                                   | Status              |
| ---- | -------------------------------- | ------------------------------------------------- | ------------------- |
| 0    | Decyzje i baseline               | zaakceptowany kierunek, zakres i ryzyka           | zakończona          |
| 1    | Bootstrap Expo                   | uruchamialny projekt na iOS, iPadOS i Androidzie  | zakończona          |
| 2    | Fundament aplikacji              | stabilny shell, dane, konfiguracja, UI i routing  | wdrożona            |
| 3    | Checkpoint techniczno-produktowy | jeden pionowy przepływ przez auth, role i zdjęcia | zakończona lokalnie |
| 4    | MVP mieszkańca                   | kompletne przepływy publiczne i mieszkańca        | zakończona lokalnie |
| 5    | MVP służb                        | kompletna obsługa pracy służby w terenie          | zakończona lokalnie |
| 6    | Granice ról 1.0                  | rozłączne obszary mieszkańca, służby i admina     | zakończona          |
| 7    | Source Ready / Client-Built      | gotowe źródła i powtarzalne wdrożenie klienta     | zakończona          |
| 8    | Stabilizacja instancji klienta   | obserwacja i poprawki po rzeczywistym wdrożeniu   | per klient          |

## Faza 0 — decyzje i baseline

Status: zakończona dla zakresu kodu źródłowego Mobile 1.0. Kontrakty auth, deep linków oraz
mediów zostały zweryfikowane w Fazie 3. Przypisanie lokalnych właścicieli, KPI i procedur
operacyjnych odbywa się osobno dla każdej instancji klienta.

Następujące działania są wykonywane dopiero dla konkretnej instancji klienta i nie
otwierają ponownie Fazy 0 kodu źródłowego:

- przypisać role z `OWNERS.tsv`;
- ustalić mierzalny cel produktu i sposób pomiaru bez włączania analityki;
- zapewnić środowisko testowe i konta mieszkańca, służby oraz admina;
- potwierdzić, które elementy backendowej Fazy 12 blokują betę i produkcję mobile;
- przywrócić dostępność fizycznego iPhone'a dla testów auth, Keychain i aparatu.

## Faza 1 — bootstrap Expo

Status: zakończona. Projekt Expo SDK 57, React Native 0.86, Expo Router, lokalne
development buildy, importy workspace, test jednostkowy i Turborepo są gotowe.

Dowody:

- build, instalacja i uruchomienie na iPhone Simulator oraz Android Emulator;
- dodatkowy smoke test aplikacji na iPad Pro 11-inch Simulator;
- eksport bundle dla iOS i Androida;
- Expo Doctor 21/21, React Doctor bez problemów i pełne `pnpm check`.

## Faza 2 — fundament aplikacji

Stan implementacji 2026-08-19: kod, testy automatyczne, exporty i lokalne buildy są
gotowe; `pnpm check`, Expo Doctor 21/21 oraz React Doctor bez błędów przechodzą.
Smoke test zaliczono na iPhone 17, iPad Pro 11″ i Pixel 9, łącznie z cache offline
i rewalidacją ETag/`304`. Formalne zamknięcie pełnej bramy urządzeniowej wymaga
jeszcze ręcznego przejścia VoiceOver/TalkBack, dużego tekstu, iPad resize/landscape
oraz fizycznego iPhone'a. Dowody: [PHASE_2_VERIFICATION.md](PHASE_2_VERIFICATION.md).

### Cel

Zbudować produkcyjnie ukierunkowany shell aplikacji, na którym kolejne funkcje mogą
powstawać bez wymiany routingu, transportu, cache, stylowania lub obsługi błędów.
Faza nie dostarcza jeszcze kompletnego logowania ani zgłoszenia ze zdjęciem.

### Rezultat demonstracyjny

Po zakończeniu fazy aplikacja:

1. uruchamia się z poprawnie zwalidowanym środowiskiem;
2. pobiera publiczną konfigurację White-Label przez HTTPS;
3. waliduje ją kontraktem, buduje motyw i pokazuje dane miasta;
4. działa z ostatnią poprawną konfiguracją po odłączeniu sieci;
5. prezentuje stany loading, empty, error, offline i retry;
6. przełącza język polski/angielski i zachowuje wybór;
7. posiada docelowe granice routingu public/auth/resident/service;
8. nie zapisuje prywatnych danych ani PII w logach.

### Warunki wejścia

- działający bootstrap z Fazy 1;
- dostępny testowy publiczny origin HTTPS lub kontrolowany fixture HTTP dla testów;
- aktualny parser `/api/config/public` w `@zglosto/contracts`;
- zaakceptowana decyzja NativeWind v4 + mały, lokalny zestaw komponentów UI;
- brak wymagania pełnego offline submit — pozostaje poza MVP.

### Kolejność prac

#### 2.1 — higiena konfiguracji i quality gate

Zakres:

- dodać walidację `EXPO_PUBLIC_API_ORIGIN` jako absolutnego URL HTTPS;
- dopuścić lokalny wyjątek developerski wyłącznie jawnie, bez osłabiania produkcji;
- dodać `EXPO_PUBLIC_API_ORIGIN` do wejść środowiskowych Turborepo, aby cache nie
  mieszał bundle między środowiskami;
- rozdzielić development, preview i production na poziomie publicznej konfiguracji;
- nie umieszczać sekretów w `EXPO_PUBLIC_*`, `extra` ani kodzie klienta;
- ujednolicić komendy: lint, typecheck, test, Expo Doctor, React Doctor i export;
- zapisać krótką procedurę regeneracji development builda po zmianie native/config.

Artefakty:

- `src/config/env.ts` i testy;
- uzupełnione `.env.example` oraz `turbo.json`;
- jednoznaczne komendy developerskie w `README.md`.

Kryteria:

- brak originu i niepoprawny URL kończą start kontrolowanym błędem;
- żadna konfiguracja klienta nie zawiera sekretu;
- zmiana originu unieważnia właściwe zadanie build w Turbo.

#### 2.2 — design tokens, NativeWind i komponenty bazowe

Zakres:

- zainstalować dokładnie przypiętą, zgodną z Expo SDK 57 linię NativeWind v4;
- nie wdrażać NativeWind v5, dopóki pozostaje pre-release;
- utworzyć mobilne tokeny: kolory semantyczne, spacing, radius, typography i statusy;
- zachować osobną implementację web/mobile, współdzieląc tylko semantykę tokenów;
- dodać wyłącznie używane elementy inspirowane React Native Reusables;
- zacząć od `Text`, `Button`, `Card`, `Badge`, `Input`, `Label`, `Separator`;
- dla dynamicznych wartości White-Label pozostawić możliwość używania `style`;
- przygotować wspólne stany `Loading`, `Empty`, `Error`, `Offline` i `Retry`;
- zapewnić minimum 44 pt/dp dla celów dotykowych i brak komunikacji wyłącznie kolorem.

Artefakty:

- `src/theme/`, `src/styles/global.css`, `src/lib/cn.ts`;
- mały katalog `src/components/ui/`;
- ekran katalogowy lub kontrolowany fixture pokazujący wszystkie stany.

Kryteria:

- komponenty wyglądają poprawnie na iPhone, Android i iPad;
- duży tekst nie ucina treści ani głównych akcji;
- VoiceOver/TalkBack otrzymują etykiety, role i właściwą kolejność;
- React Doctor nie zgłasza regresji.

#### 2.3 — klient API i model błędów

Zakres:

- utworzyć jeden klient oparty o `expo/fetch`, bez Axios;
- budować URL wyłącznie z walidowanego originu i kontrolowanej ścieżki;
- sprawdzać `response.ok` przed parsowaniem sukcesu;
- rozróżnić błędy: konfiguracji, offline/network, timeout, abort, HTTP i kontraktu;
- mapować `401`, `403`, `404`, `409`, `422`, `429` i `5xx` na typowany `ApiError`;
- wspierać `AbortSignal` i anulowanie requestów;
- walidować odpowiedzi parserami `@zglosto/contracts`;
- przenosić correlation ID bez logowania body, cookie, e-maila lub zdjęć;
- oddzielić requesty publiczne od przyszłych requestów uwierzytelnionych.

Artefakty:

- `src/api/client.ts`, `errors.ts`, `request-context.ts`;
- adapter `src/api/white-label.ts`;
- testy statusów HTTP, błędnego JSON, błędu kontraktu, timeout i abort.

Kryteria:

- żaden konsument nie wywołuje `fetch` bezpośrednio poza warstwą transportową;
- UI nie interpretuje surowych statusów HTTP;
- anulowany request nie jest pokazywany jako awaria użytkownika;
- logi diagnostyczne nie zawierają PII.

#### 2.4 — TanStack Query i zachowanie sieciowe

Zakres:

- utworzyć jeden `QueryClient` z jawnie dobranym `staleTime`, retry i backoff;
- wyłączyć retry dla błędów trwałych, np. większości `4xx`;
- podłączyć `onlineManager` do NetInfo;
- przekazywać `signal` z query do klienta API;
- zdefiniować fabrykę stabilnych query keys;
- rozdzielić przyszłe klucze publiczne i prywatne przez user ID/rolę;
- nie utrwalać prywatnego cache w tej fazie;
- zdefiniować operację czyszczenia prywatnych query przy zmianie sesji;
- obsłużyć przejście airplane mode → online bez pętli requestów.

Artefakty:

- `src/queries/query-client.ts`, `query-keys.ts`, `network-manager.ts`;
- provider w root layout;
- test integracyjny retry, cancellation i reconnect.

Kryteria:

- brak sieci pauzuje request zamiast generować serię błędów;
- powrót online wykonuje kontrolowaną rewalidację;
- ten sam zasób nie jest pobierany równolegle przez kilku konsumentów;
- prywatne query mogą być usunięte jednym, testowalnym wywołaniem.

#### 2.5 — White-Label, cache publiczny i start aplikacji

Zakres:

- pobierać `/api/config/public` z obsługą ETag/`If-None-Match`;
- walidować każdą nową konfigurację przed zapisem;
- zapisywać wyłącznie ostatnią poprawną konfigurację publiczną i jej metadane;
- użyć AsyncStorage tylko dla publicznego cache i preferencji;
- rozwiązywać root-relative asset URL względem API originu;
- budować theme i listę aktywnych usług z konfiguracji;
- określić stan startu: initializing, ready, stale-offline lub blocking-error;
- nie uruchamiać częściowo aplikacji przy pierwszym starcie z błędną konfiguracją.

Artefakty:

- `src/config/runtime-config.ts`;
- `src/api/white-label.ts` i query/hook konfiguracji;
- publiczny adapter cache z migracją wersji;
- ekran blokującego błędu konfiguracji z retry.

Kryteria:

- odpowiedź `200` aktualizuje cache, a `304` zachowuje dane;
- cold start offline korzysta z ostatniej poprawnej konfiguracji;
- pierwszy start offline bez cache pokazuje jednoznaczny błąd i retry;
- uszkodzony lub niezgodny cache jest odrzucany bez crasha.

#### 2.6 — i18n i preferencje użytkownika

Zakres:

- podłączyć wspólne katalogi `@zglosto/i18n` do runtime React Native;
- wykryć locale urządzenia przez `expo-localization`;
- normalizować nieobsługiwane locale do języka bazowego;
- zapisywać preferencję języka w AsyncStorage;
- przełączać język bez restartu;
- używać wspólnych formatterów dat i strefy `Europe/Warsaw` zgodnie z kontraktem;
- nie przechowywać tłumaczeń jako tekstów zaszytych w route files.

Kryteria:

- polski i angielski przechodzą na wszystkich ekranach fundamentu;
- wybór przeżywa cold restart;
- długie tłumaczenia i duży tekst nie psują layoutu;
- brak klucza ma kontrolowane zachowanie developerskie.

#### 2.7 — routing i granice dostępu

Zakres:

- pozostawić `src/app` wyłącznie dla tras i `_layout.tsx`;
- zapewnić zawsze działającą trasę `/` oraz `+not-found.tsx`;
- zdefiniować grupy `(auth)`, `(resident)` i `(service)` oraz wspólne szczegóły;
- umieścić stosy w `_layout.tsx`, a logikę ekranów w `src/screens`/`src/features`;
- przygotować model stanów sesji: unknown, anonymous, authenticated i stale;
- przygotować role-aware redirect bez traktowania routingu jako zabezpieczenia;
- zachować bezpieczny redirect intent dla przyszłego `401`/logowania;
- nie implementować jeszcze finalnego Better Auth ani deep linków produkcyjnych.

Kryteria:

- brak migotania prywatnego ekranu podczas inicjalizacji sesji;
- anonimowy użytkownik nie wchodzi w shell roli;
- zmiana modelowej roli przebudowuje shell bez pozostawienia historii poprzedniej roli;
- każda trasa jest cienkim adapterem dla ekranu/feature.

#### 2.8 — diagnostyka, accessibility i dowody

Zakres:

- dodać lokalny logger z allowlistą pól i redakcją wartości wrażliwych;
- pokazywać w ekranie diagnostycznym wersję aplikacji, środowisko, config version i
  stan sieci, bez sekretów;
- pozostawić analitykę i zewnętrzny crash reporting wyłączone;
- sprawdzić VoiceOver, TalkBack, duży tekst, reduce motion i klawiaturę;
- wykonać smoke test na iPhone Simulator, iPad 11-inch i Android Emulator;
- wykonać test offline/reconnect oraz cold restart;
- zapisać wyniki, urządzenia i znane ograniczenia.

### Plan testów Fazy 2

Testy jednostkowe:

- walidacja env i URL;
- mapowanie `ApiError`;
- parser i migracja publicznego cache;
- query keys oraz reguły retry;
- locale fallback i zapis preferencji;
- decyzje dostępu do tras.

Testy integracyjne:

- konfiguracja `200 → 304 → offline cache`;
- timeout, abort i reconnect;
- błędny kontrakt nie nadpisuje poprawnego cache;
- czyszczenie prywatnej przestrzeni query;
- inicjalizacja providerów i routingu.

Macierz ręczna:

- iPhone Simulator: start, locale, duży tekst, offline/retry;
- iPad 11-inch: portrait, landscape i podstawowy resize;
- Android Emulator API 36: start, back gesture, TalkBack i reconnect;
- fizyczny iPhone: wymagany najpóźniej przed rozpoczęciem Fazy 3.

### Brama wyjścia Fazy 2

Faza jest zakończona dopiero, gdy:

- rezultat demonstracyjny działa na iOS, iPadOS i Androidzie;
- wszystkie testy jednostkowe/integracyjne Fazy 2 przechodzą;
- `pnpm check`, Expo Doctor i React Doctor przechodzą;
- export obu platform oraz lokalne development buildy nie mają regresji;
- nie ma PII ani sekretów w logach, storage i publicznej konfiguracji;
- NativeWind i lokalne komponenty UI przeszły checkpoint platformowy;
- dokumentacja zawiera dowody i listę otwartych ryzyk;
- zespół akceptuje rozpoczęcie spike'ów auth i media w Fazie 3.

### Poza zakresem Fazy 2

- kompletne logowanie i rejestracja;
- trwała sesja Better Auth;
- publiczny feed produkcyjny;
- wysyłanie zgłoszenia i upload zdjęć;
- prywatne obrazy;
- pełna kolejka offline;
- push notifications, mapa natywna i analityka;
- konfiguracja EAS, TestFlight oraz Google Play.

## Faza 3 — checkpoint techniczno-produktowy

Cel: udowodnić najtrudniejsze granice technologiczne jednym pionowym przepływem,
zanim powstanie pełne MVP.

Zakres ogólny:

- publiczny feed i szczegóły incydentu;
- Better Auth Expo: logowanie, restart, `401`, `403` i wylogowanie;
- historia jednego mieszkańca;
- zgłoszenie bez zdjęcia i ze zdjęciem;
- presigned upload, checksum, anulowanie i retry;
- autoryzowany podgląd prywatnego obrazu i czyszczenie cache;
- służbowa aktualizacja tego samego zgłoszenia;
- custom deep link w development oraz kontrakt universal/app links;
- wykonanie krytycznej części `PARITY_CHECKS.md`.

Stan 2026-08-20: krok 3.1, czyli publiczny feed i szczegóły incydentu, został
zaimplementowany. Lista działa na iPhone Simulator i Android Emulator, a szczegóły
przeszły przez deep link na Androidzie. Dowody i ograniczenie jednorazowego dialogu
custom scheme na iOS opisuje [PHASE_3_1_VERIFICATION.md](PHASE_3_1_VERIFICATION.md).

Krok 3.2 jest zaimplementowany: Authorization używa pluginu Expo, klient przechowuje
cookie sesji w SecureStore, jawnie dołącza je do chronionych requestów i centralnie
obsługuje `401`, `403` oraz wylogowanie. Android przeszedł logowanie, cold restart,
odtworzenie sesji i wylogowanie. Na iOS potwierdzono build, połączenie z lokalnym API
i ekran logowania; automatyczne wypełnienie formularza w iPhone Simulator pozostaje
otwartym testem ręcznym. Szczegóły: [PHASE_3_2_VERIFICATION.md](PHASE_3_2_VERIFICATION.md).

Krok 3.3 jest zaimplementowany: panel mieszkańca pobiera przez autoryzowany klient
wyłącznie zgłoszenia powiązane z `user.id`, waliduje odpowiedź wspólnym kontraktem i
przechowuje ją tylko w prywatnej przestrzeni TanStack Query. Android przeszedł
logowanie, listę, cold restart, ponowne pobranie i wylogowanie. Na iOS potwierdzono
aktualny bundle i komunikację z API; pełne logowanie pozostaje testem ręcznym.
Szczegóły: [PHASE_3_3_VERIFICATION.md](PHASE_3_3_VERIFICATION.md).

Krok 3.4 jest zaimplementowany: anonimowy użytkownik lub zalogowany mieszkaniec może
utworzyć zgłoszenie bez zdjęcia. Formularz korzysta z aktywnej konfiguracji służb,
waliduje request i response wspólnymi kontraktami, obsługuje `429` oraz błędy sieci,
a po sukcesie invaliduje publiczny feed i prywatną historię mieszkańca. Pełny zapis
`201` przeszedł na Androidzie, a aktualny formularz i bundle zweryfikowano na iOS.
Szczegóły: [PHASE_3_4_VERIFICATION.md](PHASE_3_4_VERIFICATION.md).

Krok 3.5 jest zaimplementowany: formularz przyjmuje jedno zdjęcie z biblioteki lub
aparatu, waliduje MIME i limit 5 MiB, liczy SHA-256 bez base64, wykonuje presigned
PUT z postępem i anulowaniem, a dopiero po sukcesie tworzy zgłoszenie z `uploadId`.
Android przeszedł pełny przepływ wraz z retry i przetworzeniem obrazu przez worker.
iPhone Simulator przeszedł finalny build, instalację, aktualny bundle oraz kontrolę
opisów uprawnień; interakcja z pickerem i aparat pozostają testem ręcznym/sprzętowym.
Szczegóły: [PHASE_3_5_VERIFICATION.md](PHASE_3_5_VERIFICATION.md).

Krok 3.6 jest zaimplementowany: prywatne szczegóły mieszkańca pobierają obrazy
przez autoryzowany klient do kontrolowanego katalogu użytkownika, nie przekazują
cookie w URL i wyłączają wtórny cache `expo-image`. Android przeszedł renderowanie
zdjęcia zgłoszenia i rozwiązania oraz potwierdzenie usunięcia katalogu po
wylogowaniu. iOS przeszedł aktualny build; pełny scenariusz pozostaje ręczny.
Szczegóły: [PHASE_3_6_VERIFICATION.md](PHASE_3_6_VERIFICATION.md).

Krok 3.7 jest zaimplementowany: służba otrzymuje przypisaną kolejkę, statystyki,
filtry i szczegóły oraz może zmienić status, weryfikację i dodać zdjęcie rozwiązania
przez presigned upload. Android przeszedł pełny interfejs obu ról, a sekwencje
mutacji i uploadu potwierdzono także przez API, storage i media workera. iOS
przeszedł aktualny build; pełny panel służb pozostaje testem ręcznym.
Szczegóły: [PHASE_3_7_VERIFICATION.md](PHASE_3_7_VERIFICATION.md).

Krok 3.8 jest zaimplementowany: publiczne i prywatne wejścia do incydentu korzystają
z walidowanego UUID, zamkniętej allowlisty targetów i bezpiecznego intentu logowania.
Callback weryfikacji e-maila ufa wyłącznie odświeżonej sesji i serwerowej fladze
`emailVerified`. Custom scheme przeszedł na Android Emulator i iPhone Simulator.
Konfiguracja Universal/App Links pozostaje nieaktywna bez własnej domeny, ale ma
gotowy kontrakt i wzorce `.well-known`. Szczegóły:
[PHASE_3_8_VERIFICATION.md](PHASE_3_8_VERIFICATION.md).

Krok 3.9 zakończył checkpoint decyzją **CONTINUE**. Fundament nadaje się do wejścia
w Fazę 4; nie oznacza to gotowości do bety ani release. Ręczne prywatne przepływy
na iOS oraz domena/fallback web zostały przeniesione do jawnych bramek, zamiast
uznane za wykonane. Szczegóły: [PHASE_3_9_VERIFICATION.md](PHASE_3_9_VERIFICATION.md)
i [PHASE_3_ACCEPTANCE.tsv](PHASE_3_ACCEPTANCE.tsv).

Brama:

- B-01–B-05 nie blokują dalszego rozwoju; ich pozostałe wymagania są bramkami
  przed betą lub release zgodnie z `RISKS_AND_DECISIONS.md`;
- backend pozostaje źródłem prawdy dla sesji, roli i zakresu danych;
- brak obejść przez query string, niezabezpieczony storage lub rozszerzony CORS;
- decyzja terminalna: **CONTINUE — rozpocząć Fazę 4**.

## Faza 4 — MVP mieszkańca

Cel: dostarczyć kompletną ścieżkę anonimową i mieszkańca.

Status: **zakończona lokalnie** — decyzja **CONTINUE** i dowody znajdują się w
[PHASE_4_CHECKPOINT.md](PHASE_4_CHECKPOINT.md) oraz
[PHASE_4_ACCEPTANCE.tsv](PHASE_4_ACCEPTANCE.tsv).

### 4.0 — baseline i kontrakt akceptacyjny

- zamrozić semantykę rejestracji, weryfikacji, zgód i anonimowych zgłoszeń;
- opisać lokalny testowy outbox bez prawdziwej wysyłki e-mail;
- ustalić scenariusz E2E oraz granice urządzeń i środowisk;
- zapisać odroczone bramki przed betą.

Status: **zrealizowane** — [PHASE_4_0_BASELINE.md](PHASE_4_0_BASELINE.md).

### 4.1 — rejestracja i weryfikacja e-maila

- natywny formularz z walidacją i wymaganymi zgodami;
- utworzenie mieszkańca i aktywnej sesji przez Better Auth;
- informacja o niezweryfikowanym adresie i resend;
- kontrolowany lokalny outbox oraz callback aplikacji;
- testy kontraktu, proxy i przepływu na iOS/Android.

Status: **zrealizowane** — [PHASE_4_1_VERIFICATION.md](PHASE_4_1_VERIFICATION.md).

### 4.2 — konto mieszkańca i ustawienia języka

- profil, rola i stan weryfikacji e-maila;
- diagnostyka wersji aplikacji, konfiguracji, środowiska i locale;
- wylogowanie z istniejącym czyszczeniem prywatnych danych;
- dedykowana trasa języka z natychmiastową zmianą i trwałym zapisem PL/EN.

Status: **zrealizowane** — [PHASE_4_2_VERIFICATION.md](PHASE_4_2_VERIFICATION.md).

### 4.3 — kontakt i informacje prawne

- kontakt oparty na zwalidowanej konfiguracji White-Label;
- akcje e-mail, telefon i witryna przez natywne linkowanie;
- lokalizowany komunikat prawny miasta;
- jawna bramka dla brakującego regulaminu i polityki prywatności.

Status: **zrealizowane** — [PHASE_4_3_VERIFICATION.md](PHASE_4_3_VERIFICATION.md).

### 4.4 — stany danych, offline i reconnect

- komplet stanów loading, empty, error, offline i retry w ścieżce mieszkańca;
- ostatnie dane z cache widoczne z jawnym oznaczeniem offline;
- automatyczne wznowienie zapytań po reconnect;
- formularz zachowuje pola w pamięci bez niejawnego kolejkowania mutacji;
- kontrolowany stan prywatnego zdjęcia bez nieskończonego ładowania offline.

Status: **zrealizowane** — [PHASE_4_4_VERIFICATION.md](PHASE_4_4_VERIFICATION.md).

### 4.5 — dostępność i regresja MVP mieszkańca

- platformowe role i stany kontrolek oraz dostępne błędy formularzy;
- cele dotykowe co najmniej 44 pt/dp i skalowalne etykiety;
- duży tekst na iOS/Android oraz systemowe ograniczenie ruchu;
- kontrola accessibility tree, TalkBack i regresji ścieżki mieszkańca;
- jawna bramka ręcznego odsłuchu VoiceOver/TalkBack przed betą.

Status: **zrealizowane** — [PHASE_4_5_VERIFICATION.md](PHASE_4_5_VERIFICATION.md).

Zakres ogólny:

- publiczny start, feed, filtry i szczegóły;
- formularz zgłoszenia bez/z sesją oraz obsługa aparatu i biblioteki;
- rejestracja, logowanie, weryfikacja e-maila i wylogowanie;
- panel „Moje zgłoszenia”, prywatne szczegóły i statusy;
- konto, ustawienia języka, kontakt i treści prawne;
- komplet loading/empty/error/offline/retry;
- testy jednostkowe, integracyjne, E2E i accessibility.

Brama:

- scenariusze mieszkańca przechodzą na urządzeniach;
- prywatny cache i pliki są czyszczone przy wylogowaniu/zmianie konta;
- nie ma krytycznych problemów dostępności ani utraty danych formularza;
- deklaracje prywatności mają pokrycie w rzeczywistym zachowaniu aplikacji.

Wynik bramy: **PASS-CONDITIONAL / CONTINUE**. Kroki 4.0–4.5 i regres E2E są
zakończone na iPhone Simulator i Android Emulator. Otwarte wymagania prawne,
screen readery, stały origin i pełne prywatne przepływy iOS pozostają bramkami
przed betą lub release, a nie niedokończonym zakresem Fazy 4.

## Faza 5 — MVP służb

Cel: umożliwić bezpieczną i odporną na słabą sieć pracę służby w terenie.

### 5.0 — baseline i kontrakt akceptacyjny

- zinwentaryzować istniejący pionowy przepływ z 3.7;
- zamrozić rolę, `serviceKey`, statusy, filtry i semantykę błędów;
- zdefiniować fixture funkcjonalny i wydajnościowy;
- zapisać scenariusz E2E oraz aktywną macierz urządzeń;
- ujawnić brak backendowego kontraktu `409` dla równoczesnej edycji.

Status: **zrealizowane** — [PHASE_5_0_BASELINE.md](PHASE_5_0_BASELINE.md),
[PHASE_5_TEST_DATA.tsv](PHASE_5_TEST_DATA.tsv) i
[PHASE_5_ACCEPTANCE.tsv](PHASE_5_ACCEPTANCE.tsv).

### 5.1 — routing, sesja i granice służby

- chronić route group zweryfikowaną rolą i osobno bramkować dane przez niepusty
  `serviceKey`;
- normalizować zakres z sesji oraz nie wykonywać requestów bez przypisania;
- izolować query przez origin, użytkownika i zakres;
- czyścić prywatne query, obrazy i robocze media po zmianie konta, roli lub
  `serviceKey`;
- zachować rozdzielną obsługę `401` i `403`.

Status: **zrealizowane** — negatywny test `serviceKey=NULL` potwierdził brak
dostępu do kolejki.

### 5.2 — kolejka zgłoszeń

- utrzymać `FlatList` do pomiaru 5.8;
- wdrożyć kontraktowe filtry i liczniki z fallbackiem przy częściowym błędzie;
- zachować wybrany filtr podczas refetch i reconnect;
- rozróżniać initial loading, empty, error, cached offline oraz refresh error;
- odświeżać kolejkę i statystyki razem;
- zapewnić radiową semantykę filtrów oraz live region liczby wyników.

Status: **zrealizowane** — [PHASE_5_1_2_VERIFICATION.md](PHASE_5_1_2_VERIFICATION.md).

### 5.3 — szczegóły i mutacje

- typować reakcje na `401`, `403`, `404`, `409`, timeout, brak sieci, `429` i `5xx`;
- nie wykonywać automatycznego retry ani trwałego kolejkowania mutacji;
- blokować duplikaty oraz działania wymagające sieci w trybie offline;
- po sukcesie odświeżać kolejkę i statystyki oraz pokazywać dostępne potwierdzenie;
- zachować świadomą, ręczną decyzję operatora po błędzie lub konflikcie.

Status: **zrealizowane** — [PHASE_5_3_4_VERIFICATION.md](PHASE_5_3_4_VERIFICATION.md).

### 5.4 — zdjęcie rozwiązania

- wykonać natywny wybór obrazu, walidację MIME/5 MiB, SHA-256 i presigned PUT;
- dołączać `uploadId` dopiero po udanym PUT i odświeżać prywatne zdjęcie;
- zachować wybrany plik po błędzie sieci, bez automatycznego ponowienia;
- umożliwić anulowanie i czyścić roboczy plik po sukcesie, usunięciu lub unmount;
- testować pełny przepływ na referencyjnym Androidzie oraz najnowszym iOS.

Status: **zrealizowane** — [PHASE_5_3_4_VERIFICATION.md](PHASE_5_3_4_VERIFICATION.md).

### 5.5 — konflikty i słaba sieć

- każda pozycja kolejki służby zawiera dodatnią `revision`;
- zmiana statusu, weryfikacji i przypisanej służby wymaga silnego
  `If-Match: "incident-N"`;
- zapis atomowo sprawdza `incidentId + serviceKey + revision`, zwiększa rewizję i
  zwraca `409` dla starego widoku;
- klient po `409` odświeża rekord, ale nie ponawia mutacji bez nowej decyzji;
- mutacje nie mają automatycznego retry ani trwałej kolejki offline.

Status: **zrealizowane** — [PHASE_5_5_6_VERIFICATION.md](PHASE_5_5_6_VERIFICATION.md).

### 5.6 — bezpieczeństwo i prywatność

- zakres odczytu i zapisu pochodzi wyłącznie ze zweryfikowanej sesji;
- rekord spoza zakresu daje `404`, bez ujawniania jego istnienia;
- query keys izolują origin, użytkownika i `serviceKey`;
- zmiana prywatnego zakresu oraz wylogowanie czyszczą query, obrazy i robocze media;
- allowlista loggera odrzuca cookie, e-mail, identyfikatory, `serviceKey` i body;
- negatywny test dwóch kont potwierdza rozdzielenie `roads` oraz `other`.

Status: **zrealizowane** — [PHASE_5_5_6_VERIFICATION.md](PHASE_5_5_6_VERIFICATION.md).

### 5.7 — dostępność i ergonomia

- zapewnić duże cele dotykowe dla podstawowych akcji terenowych;
- wystawić role, nazwy i stany zaznaczenia filtrów, statusów i weryfikacji;
- opisać obraz rozwiązania i postęp uploadu;
- zweryfikować drzewo dostępności na referencyjnym Androidzie oraz iOS.

Status: **zrealizowane**. Ręczny odsłuch VoiceOver/TalkBack pozostaje bramką
przed betą w Fazie 7.

### 5.8 — wydajność

- zmierzyć 200-elementowy fixture LOAD-A, przewijanie, pamięć i mutacje;
- ustalić mierzalne progi lokalnego checkpointu;
- zdecydować na podstawie wyników, czy `FlatList` wymaga zastąpienia FlashList;
- nie uznawać ograniczeń symulatora za pomiar urządzenia fizycznego.

Status: **zrealizowane** — progi lokalne spełnione, pozostaje `FlatList`. Pomiary
fizycznych urządzeń i buildów Release są bramką Fazy 7.

### 5.9 — E2E i checkpoint

- przejść pełny przepływ terenowy na aktywnej macierzy urządzeń;
- potwierdzić izolację zakresów, mutacje, upload zdjęcia i cleanup po wylogowaniu;
- usunąć syntetyczne fixture po teście i zapisać decyzję checkpointu.

Status: **zrealizowane** — [PHASE_5_7_9_VERIFICATION.md](PHASE_5_7_9_VERIFICATION.md).
Decyzja Fazy 5: **PASS / CONTINUE**.

## Faza 6 — decyzja o administratorze Mobile

### 6.0 — zgodność granic ról z WEB

- zamrozić rozłączną macierz ról dla wersji 1.0;
- dopuścić publiczny feed tylko anonimowo i mieszkańcowi;
- kierować pracownika wyłącznie do Panelu Służb;
- pokazać administratorowi wyłącznie komunikat o wymaganym komputerze i wylogowanie;
- nie oferować administratorowi linku WEB ani Panelu Mieszkańca;
- chronić publiczne szczegóły, formularz i deep linki przed montowaniem query;
- przejść test sesji, cold startu i nawigacji na aktywnej macierzy urządzeń.

Status: **zrealizowane — PASS / CONTINUE (2026-08-25)** —
[PHASE_6_0_ROLE_BOUNDARIES.md](PHASE_6_0_ROLE_BOUNDARIES.md) i
[PHASE_6_ACCEPTANCE.tsv](PHASE_6_ACCEPTANCE.tsv).

### 6.1–6.9 — mobilny Panel Administratora

Status: **SKIPPED / OUT OF SCOPE dla 1.0**. Panel Administratora pozostaje funkcją
aplikacji webowej uruchamianej na komputerze. Decyzja może zostać otwarta ponownie
w późniejszej wersji bez osłabiania obecnych granic ról.

## Faza 7 — Source Ready / Client-Built

Cel: pozostawić Mobile jako bezpieczną, reprezentacyjną i łatwą do uruchomienia część
monorepo ZgłosTO. Wynikiem Fazy 7 jest wydanie repozytorium, a nie publikacja w App Store
lub Google Play.

Mobile podlega dokładnie tej samej licencji i zasadom co WEB oraz pozostałe komponenty.
Jedynymi źródłami prawdy są główne [LICENSE](../LICENSE), [SECURITY.md](../SECURITY.md),
[CONTRIBUTING.md](../CONTRIBUTING.md), [CLA.md](../CLA.md) i pliki `.github/`. Nie tworzymy
ich kopii w `Mobile/`. Pomysły i niewrażliwe propozycje trafiają do GitHub Issues, większe
zmiany są najpierw omawiane w issue, a podatności wyłącznie kanałem prywatnym opisanym w
`SECURITY.md`.

### 7.0 — kontrakt Repository Ready

- zamrozić zakres funkcjonalny Mobile 1.0 oraz jawnie wypisać elementy poza zakresem;
- utworzyć macierz akceptacyjną Fazy 7 z bramką
  `SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED`;
- potwierdzić dziedziczenie wspólnych zasad licencji, SECURITY, CONTRIBUTING, CLA, PR,
  Conventional Commits, SFW, karencji zależności i użycia AI;
- rozdzielić wykonywaną teraz Fazę 7 od odroczonego wdrożenia produkcyjnego/sklepowego;
- zapisać podział narzędzi: agent-device do pracy interaktywnej i diagnostyki, Maestro do
  deterministycznej regresji E2E.

Status: **zrealizowane — PASS (2026-08-25)** —
[PHASE_7_0_BASELINE.md](PHASE_7_0_BASELINE.md).

### 7.1 — bezpieczeństwo publikacji na GitHubie

- przeskanować bieżące drzewo i historię Git pod kątem sekretów, PII i prawdziwych danych;
- sprawdzić `.gitignore`, pliki `*.example`, logi, artefakty natywne, screenshoty i fixture;
- zweryfikować licencje zależności, assetów, ikon oraz innych materiałów zewnętrznych;
- przygotować centralne GitHub Issue Templates dla błędu, pomysłu i pytania z wyborem
  obszaru `Mobile`, `WEB`, `Backend`, `Infrastructure` lub `Shared`;
- kierować raporty bezpieczeństwa wyłącznie do GitHub Private Vulnerability Reporting;
- rozważyć centralny `CODEOWNERS`, bez osobnego procesu dla Mobile.

Status: **zrealizowane — PASS (2026-08-25)**. `CODEOWNERS` pozostaje jawnie odroczony do
przypisania osób w `OWNERS.tsv`.

### 7.2 — konfiguracja White-Label klienta

- oddzielić konfigurację klienta od logiki aplikacji: marka, kolory, dane kontaktowe,
  teksty prawne, endpointy, identyfikatory aplikacji i zakresy usług;
- dostarczyć wyłącznie sztuczne konfiguracje demonstracyjne i bezpieczne wartości domyślne;
- zbudować co najmniej dwa przykładowe warianty bez zmian w kodzie domenowym;
- opisać procedurę dodania klienta oraz listę danych, które musi on dostarczyć.

Status: **zrealizowane — PASS (2026-08-25)** —
[CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md).

### 7.3 — powtarzalny Quick Start

- przygotować krótką ścieżkę clone → install → kontenery → seed → iOS/Android;
- dodać kontrolę Node, PNPM, Xcode, JDK, Android SDK, Docker/OrbStack i wymaganych portów;
- zapewnić jeden wersjonowany zestaw przykładowych zmiennych oraz syntetyczne konta demo;
- nie wymagać domeny, Cloudflare Quick Tunnel, kont Apple/Google ani agent-device do
  podstawowego uruchomienia;
- dodać troubleshooting i procedurę pełnego cleanup środowiska demonstracyjnego.

Status: **zrealizowane — PASS (2026-08-25)** — pełny lokalny start, healthcheck, seed i
cleanup zweryfikowano; próba na świeżym klonie pozostaje końcową bramką 7.9.

### 7.4 — prezentacja projektu

- przebudować główny README w materiał produktowo-techniczny z funkcjami, stackiem,
  architekturą, bezpieczeństwem, ograniczeniami i instrukcją uruchomienia;
- przygotować zanonimizowane screenshoty i krótki scenariusz demonstracyjny Android/iOS;
- pokazać rozłączne role mieszkańca, służby i administratora Mobile 1.0;
- opisać różnicę między stanem demonstracyjnym a wdrożeniem produkcyjnym.

Status: **zrealizowane — PASS (2026-08-25)** — główny README, profesjonalny seed,
scenariusz demo, zanonimizowany asset i sześć screenshotów iOS/Android opisuje
[PHASE_7_4_VERIFICATION.md](PHASE_7_4_VERIFICATION.md).

### 7.5 — automatyczne bramki GitHub

- uruchamiać instalację z lockfile, polityki źródeł, format, lint, TypeScript, testy,
  White-Label builds, Expo Doctor i build/export Mobile;
- dodać kontrolę sekretów, zależności i spójności przykładowych konfiguracji;
- utrzymać szybkie bramki na PR, a kosztowne E2E emulatorów uruchamiać ręcznie, okresowo
  lub przed tagiem wydania;
- nie wymagać płatnych usług ani prywatnych credentiali do podstawowej walidacji PR.

Status: **NOT REQUIRED** — referencyjny model dostarcza źródła, a każdy klient buduje
własny wariant lokalnie. Klient może wdrożyć własne CI, ale centralne buildy GitHub Actions
nie są warunkiem gotowości Mobile.

### 7.6 — regresja i narzędzia Mobile

- zachować scenariusze Maestro jako czytelne, wersjonowane i niezależne od modelu testy E2E;
- używać agent-device CLI/MCP do eksploracji, diagnostyki, dostępności i zbierania dowodów;
- sprawdzić zgodność istniejących YAML-i z `agent-device test --maestro`, bez usuwania
  samodzielnego Maestro przed pełnym potwierdzeniem parytetu;
- objąć regresją mieszkańca, służbę, administratora, deep linki, media, offline/reconnect,
  cold start i cleanup sesji na iPhone Simulator oraz Android Emulator.

Status: **zrealizowane — PASS (2026-08-25)** — końcowy smoke ról i deep linków ma 3/3
PASS na Pixel 9 oraz iPhone 17 Pro / iOS 26.5; pozostałe obszary mają skumulowane dowody
fazowe opisane w [PHASE_7_6_VERIFICATION.md](PHASE_7_6_VERIFICATION.md).

### 7.7 — lokalny build demonstracyjny

- przygotować powtarzalny Android APK i iOS Simulator build bez publikacji sklepowej;
- potwierdzić brak debugowych originów, sekretów i danych testowych w wariancie demo/release;
- zmierzyć rozmiar, cold start, pamięć i podstawowe zachowanie background/resume;
- publikować binaria wyłącznie jako kontrolowane artefakty workflow lub GitHub Release,
  nigdy jako przypadkowe pliki w repozytorium.

Status: **NOT REQUIRED** — właściciel wybrał gotowy kod bez wspólnego artefaktu binarnego.
Binaria powstają dopiero w środowisku klienta z jego identyfikatorami i signingiem.

### 7.8 — dokument przekazania klientowi

- opisać konfigurację White-Label, architekturę, środowiska, dane, backup i utrzymanie;
- przygotować checklistę od `Repository Ready` do produkcji: domena, hosting, certyfikaty,
  signing, privacy, crash reporting, urządzenia fizyczne i konta sklepowe;
- jawnie oznaczyć, że PolyForm Internal Use License 1.0.0 jest licencją source-available,
  a inne użycie lub komercyjne warunki wymagają osobnego uzgodnienia z licencjodawcą;
- wskazać znane ograniczenia oraz odroczone decyzje bez przedstawiania demo jako produkcji.

Status: **zrealizowane — PASS (2026-08-25)** —
[CLIENT_HANDOFF.md](CLIENT_HANDOFF.md).

### 7.9 — checkpoint repozytorium bez release'u

- przejść Quick Start na czystym środowisku oraz pełną aktywną macierz jakości;
- potwierdzić brak sekretów, PII, nielegalnych assetów i krytycznych regresji;
- pozostawić changelog produktu, tag i GitHub Release do wspólnego wydania monorepo;
- uzyskać decyzję `SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED`.

Status: **zrealizowane — SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED (2026-08-25)** — nie
utworzono tagu ani release'u; decyzję i odroczone bramki opisuje
[PHASE_7_CHECKPOINT.md](PHASE_7_CHECKPOINT.md).

### Wdrożenie i dystrybucja konkretnego klienta

Każdy klient uruchamia własną instancję całego systemu i buduje własny wariant Mobile.
Wdrożenie wymaga jego domeny, produkcyjnego edge, konfiguracji White-Label, sekretów,
signingu oraz testów fizycznych urządzeń. Universal Links/App Links, crash reporting i
dystrybucja sklepowa są konfigurowane wyłącznie wtedy, gdy klient ich potrzebuje. Konta
Apple Developer/Google Play, deklaracje privacy, TestFlight/Internal Testing i rollout
sklepowy należą do klienta i nie blokują gotowości repozytorium źródłowego.

## Faza 8 — stabilizacja instancji po wdrożeniu klienta

Status: **PER CLIENT** — rozpoczyna się dopiero po rzeczywistym wdrożeniu danej instancji.
Publikacja źródeł ani sam GitHub Release nie uruchamiają Fazy 8.

Cel: po wdrożeniu produkcyjnym potwierdzić jakość i podejmować dalsze decyzje na podstawie
danych, bez automatycznego rozszerzania zakresu.

Zakres ogólny:

- obserwacja crash-free sessions, wydajności i błędów API bez PII;
- triage opinii użytkowników oraz problemów urządzeniowych;
- szybkie poprawki z kontrolowanym rolloutem i rollbackiem;
- przegląd retencji cache, prywatnych plików i uprawnień;
- decyzja o adminie, push, mapie, trwałym drafcie i szerszym offline;
- regularne aktualizacje Expo/RN wykonywane osobną, testowaną zmianą.

Brama stabilizacji:

- brak nierozwiązanych incydentów krytycznych;
- metryki techniczne mieszczą się w zaakceptowanym baseline;
- istnieje zatwierdzony backlog kolejnego wydania albo decyzja o utrzymaniu zakresu.

## Standard pracy w każdej fazie

1. Ustal mierzalny baseline i scenariusz demonstracyjny.
2. Wprowadź minimalny pionowy przyrost.
3. Dodaj testy na poziomie właściwym dla ryzyka.
4. Uruchom lint, typecheck, test, Expo Doctor i React Doctor.
5. Sprawdź iPhone Simulator i Android Emulator oraz wymaganą dostępność; iPad i
   urządzenia fizyczne tylko po jawnym rozszerzeniu bieżącej macierzy.
6. Zmierz ponownie i zapisz dowody.
7. Zamknij ryzyka albo jawnie przenieś je z właścicielem i terminem.
8. Podejmij decyzję o wejściu do następnej fazy.
