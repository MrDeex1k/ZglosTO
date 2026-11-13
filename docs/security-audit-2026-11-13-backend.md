# Audyt bezpieczeństwa API backendu — 2026-11-13

## Wynik

Sektor 2: potwierdzono i naprawiono dwa problemy o istotności **Medium**: przyjmowanie mutacji formularzowych bez bariery CSRF oraz przenoszenie URL-i i treści wyjątków do logów. Nie potwierdzono obejścia ról, izolacji mieszkańca ani izolacji usług w przejrzanych ścieżkach biznesowych. Nie jest to certyfikacja OWASP ani wynik testów penetracyjnych wdrożenia.

Praca we wspólnym checkoutcie: zachowano zastane zmiany. Nie tworzono branchy ani commitów; nie zmieniano manifestów ani lockfile. Nie edytowano storage, modułów media ani media-worker. Ich zmiany widoczne we wspólnym diffie należą do pozostałych sektorów. Aktualizacje zależności i diagnoza unhealthy S3/RustFS są prowadzone przez parenta.

## Metoda i zakres

Zastosowano skill `skills/security-best-practices/SKILL.md` oraz `references/javascript-express-web-server-security.md`. NestJS korzysta tu z adaptera Express; skill nie zawiera dedykowanego reference NestJS. Podstawą są konkretne przepływy wejście → guard → use case → SQL/klient HTTP → odpowiedź/log, nie lista hipotetycznych braków.

Przejrzano `backend/nest/application.ts`, platformę HTTP i logi, auth-bridge, kontrolery residents/services/admin, ich use cases, adapter PostgreSQL, reporter identity, katalog usług, publiczny cache, klienty Authorization/LLM, konfigurację połączeń oraz mechanizmy jobs/outbox. Kontrakty wejścia/wyjścia w `packages/contracts/src/{auth,admin,incidents,images}.ts` odczytano bez zmian. Nginx, kod Authorization i politykę dostępu do zdjęć odczytano pomocniczo. Nie wykonywano ataków przeciw systemom zewnętrznym ani operacji na istniejących danych.

## Potwierdzone znaleziska

### BE-01 — Medium — mutacje formularzowe bez bariery CSRF — naprawiono

- **Klasyfikacja:** OWASP Top 10 2021 A01 Broken Access Control; CWE-352.
- **Lokalizacja:** `backend/nest/modules/auth-bridge/authorization.guard.ts:32`, wywołania na liniach 66, 73, 99; endpoint `backend/nest/modules/residents/residents.controller.ts:135`; kontrakt `packages/contracts/src/incidents.ts:145`.
- **Dowód przed naprawą:** guard sprawdzał sesję/role, lecz nie format ani kontekst mutacji. Zainstalowany adapter Nest rejestruje `express.urlencoded({ extended: true })` w `node_modules/@nestjs/platform-express/adapters/express-adapter.js`. Wymagane pola utworzenia zgłoszenia są tekstowe, a współrzędne i upload mają wartości domyślne. Formularz `application/x-www-form-urlencoded` z polami `opis_zgloszenia`, `mail_zglaszajacego`, `adres_zgloszenia`, `typ_sluzby` mógł więc przejść kontrakt i utworzyć zgłoszenie.
- **Warunki i wpływ:** atakujący skłania przeglądarkę do wysłania formularza POST. Endpoint dopuszcza anonimowe zgłoszenia, więc nawet brak cookies przy cross-site POST nie usuwa możliwości zaśmiecania danych i zużywania limitu IP ofiary. W kontekście same-site, w którym przeglądarka dołącza cookie mieszkańca, znając jego e-mail można też próbować zgłoszenia w jego sesji. Nie wykazano formularzowego przejęcia roli admina: mutacje administracyjne używają PATCH, a zwykły formularz go nie wysyła.
- **Naprawa:** wszystkie mutacje przechodzące globalny guard wymagają `application/json`; jawne `Sec-Fetch-Site: cross-site` jest odrzucane. CORS pozostaje wyłączony, więc obca strona nie przejdzie preflight dla JSON. Brak Fetch Metadata jest dozwolony dla klientów natywnych; same-origin JSON i JSON z charset działają. Brak/wadliwa sesja nadal skutkuje 401. Dokumentacja API opisuje teraz tę politykę zamiast błędnej informacji o dowolnym CORS.
- **Regresja:** `backend/nest/modules/auth-bridge/auth-bridge.test.ts:123`: formularze URL-encoded, text/plain, multipart i cross-site JSON → 403, zarówno anonimowo, jak i z sesją. JSON natywny i same-origin → 201. Istniejące testy kontrolerów potwierdzają działanie właściwych mutacji biznesowych.
- **Warunek utrzymania zabezpieczenia:** przyszłe włączenie credentialed CORS wymaga jawnej allowlisty origin i ponownego przeglądu CSRF. SameSite cookie nie jest tu jedyną barierą.

### BE-02 — Medium — dane żądania i wyjątków w logach — naprawiono

- **Klasyfikacja:** OWASP Top 10 2021 A09 Security Logging and Monitoring Failures; CWE-532.
- **Lokalizacja:** `backend/nest/platform/structured-http-exception.filter.ts:93`, `:124`; `backend/nest/platform/structured-logger.ts:73`.
- **Dowód przed naprawą:** filtr logował `path: request.originalUrl` i `error: { message: exception.message, name }`. Logger dla bezpośredniego obiektu Error tworzył zwykły obiekt z message i stack. Redaktor usuwał klucze typu token/email, ale nie pola `path`, `message` i `stack`.
- **Warunki i wpływ:** dowolne błędne żądanie utrwalało query string w stdout/telemetrii. Przykład regresyjny używa wyłącznie sztucznego markera `?token=private-marker`. Dodatkowo błędy sterownika PostgreSQL mogą zawierać przekazaną wartość, np. wadliwy UUID z parametru ścieżki. Dane klienta trafiały do innego systemu retencji i kręgu odbiorców niż właściwa baza. Nie stwierdzono publicznego dostępu do logów; istotność uwzględnia ten warunek.
- **Naprawa:** filtr zapisuje szablon dopasowanej trasy albo `unmatched`, bez query i podstawionych identyfikatorów. Błędy w filtrze i bezpośrednie Error w loggerze zachowują nazwę klasy, bez dowolnej treści i stack. Pozostają correlation ID, status, kod błędu, metoda i zdarzenie.
- **Regresja:** `backend/nest/platform/platform.test.ts:184` sprawdza brak query i szczegółów wyjątku w rzeczywistym log sinku; `:210` sprawdza bezpośrednie i zagnieżdżone Error. Stabilne odpowiedzi błędów nadal przechodzą istniejące testy.
- **Koszt operacyjny:** mniej szczegółów diagnostycznych w ogólnych logach błędów. Nowe szczegóły należy wprowadzać jako jawne, bezpieczne kody, zamiast przywracać surowe message/stack.

## Zweryfikowane zabezpieczenia

| Obszar                              | Dowód i wynik                                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BFLA/role                           | Globalny `AuthorizationGuard` domyślnie wymaga sesji. Klasy Admin/Services wymagają odpowiednio admin/sluzby; listowanie własnych zgłoszeń wymaga mieszkaniec. Role nie pochodzą z nagłówków klienta.                                                            |
| Granica backend–auth                | `authorization.gateway.ts` przyjmuje tylko status 200 i poprawny kontrakt zweryfikowanej sesji. 401 i awarie są rozróżnione; awaria nie przepuszcza użytkownika. Klient używa mTLS, Service CA, sprawdzania certyfikatu, deadline oraz limitu odpowiedzi 64 KiB. |
| BOLA mieszkańca                     | Lista filtruje `reporter_user_id = $1` z tożsamości sesji. Claim anonimowych zgłoszeń wymaga `email_verified = TRUE` z bazy oraz pustego właściciela; klient nie podaje docelowego userId.                                                                       |
| BOLA służb                          | Lista/statystyki filtrują service_key z sesji. Status, weryfikacja i transfer mają service_key oraz revision bezpośrednio w predykacie UPDATE; cudzy incydent daje not-found. Testy dodatkowe w `incident-authorization.test.ts:22`, `:32`, `:50`.               |
| Role i przypisanie usług            | Endpoint uprawnień jest admin-only. Ścisły kontrakt wymaga serviceKey wyłącznie dla sluzby, a polityka wymaga aktywnej usługi. UPDATE wybiera konkretne kolumny.                                                                                                 |
| SQL/JSON injection, mass assignment | Wartości żądań są parametrami SQL. Interpolowane fragmenty SELECT są stałymi programu. Kontrakty mutacji są strict, typują enum/boolean/współrzędne i nie pozwalają dopisać roli, reporter_user_id, statusu do tworzenia. JSON z cache ma parser kontraktu.      |
| Prywatność odpowiedzi               | Prywatne listy wymagają roli i właściciela/usługi. Publiczna lista resolved wybiera jawne pola, bez e-maila, reporter_user_id i zdjęcia pierwotnego; LIMIT 15. Treść i adres są publikowane zgodnie z obecnym kontraktem produktu.                               |
| SSRF i outbound                     | Klient LLM dopuszcza wyłącznie skonfigurowany origin, stałą ścieżkę bez query i oczekiwaną metodę. Authorization ma stały endpoint. Brak użytkownik → dowolny URL w przejrzanym API biznesowym. Klienci node:https nie realizują automatycznych redirectów.      |
| Limity                              | Parser JSON ma limit 256 KiB. Tworzenie zgłoszenia ma lokalny limiter oraz opcjonalny limiter Redis IP/user/global. Adres klienta jest wyznaczany przy jawnej konfiguracji trusted proxy hops.                                                                   |
| Błędy                               | Odpowiedzi mają stały publiczny komunikat, kod i correlation ID; nie ujawniają stack/SQL. Logi objęto BE-02.                                                                                                                                                     |
| Jobs                                | Outbox używa kontraktów wiadomości i parametryzacji SQL; idempotent-message executor zapisuje receipt w tej samej transakcji co operacja. Pełne przetwarzanie mediów pozostaje w sektorze 3.                                                                     |

## Walidacja

- `cd backend && bun run test`: **29 plików, 128 testów — PASS** we wspólnym checkoutcie na zakończenie pełnej regresji (w tym testy innych sektorów).
- `cd backend && bun run typecheck`: PASS.
- `bun run --bun oxlint` dla zmienionych plików TypeScript: PASS; pliki sformatowano oxfmt.
- Testy HTTP uruchamiano poza sandboxem z `require_escalated`, wyłącznie na lokalnym loopbacku. Warstwy biznesowe korzystają w testach z adapterów/moków, nie z istniejącej bazy.
- Pierwsza próba z katalogu głównego nie ładowała konfiguracji miasta; druga z jawnym configiem, ale niewłaściwym cwd, nie znalazła plików. Prawidłowe polecenie z katalogu backendu przechodzi. Wstępne umieszczenie testu CSRF w biznesowym suite wyczerpywało jego współdzielony limiter; test przeniesiono do izolowanego suite auth-bridge bez osłabiania produkcyjnego limitera.

## Ograniczenia i pozostałe ryzyka

1. Nie uruchamiano integracyjnych prób BOLA na żywej bazie, testów obciążenia, przeglądarki ani zewnętrznych usług. Testy SQL chronią predykaty i wiązanie parametrów, a nie zastępują oceny faktycznie wdrożonych uprawnień bazy i sieci.
2. Listy mieszkańca, służby i administratora pobierają całą autoryzowaną kolekcję. Brak paginacji jest ryzykiem pojemnościowym przy wzroście danych; nie potwierdzono konkretnego progu DoS. Pełna paginacja wymaga wspólnej zmiany API i klientów, zamiast cichego ucięcia wyników.
3. Redis limiter celowo przechodzi do lokalnego fallbacku przy awarii. Wiele replik ma wówczas niezależne limity lokalne. Weryfikacja topologii proxy i konfiguracji limitów wdrożenia pozostaje poza testami jednostkowymi.
4. Publiczny kontrakt publikuje opis, adres i współrzędne rozwiązanych zgłoszeń. Nie zawiera osobnego pola e-mail, ale dane osobowe wpisane w dowolny tekst nie są automatycznie anonimizowane. To jawna obecna polityka produktu; potrzebna jest decyzja produktowa o moderacji/redakcji przed publikacją, jeżeli nie akceptuje jej administrator miasta.
5. Anonimowe zgłoszenia podają e-mail bez potwierdzenia własności. Ich późniejszy odbiór wymaga weryfikacji e-maila właściciela konta; atakujący może jednak wysłać zgłoszenie z cudzym adresem. Nie uznano zamierzonego anonimowego flow za przejęcie cudzych danych. Ewentualne potwierdzanie każdego zgłoszenia zmienia produkt i wymaga skoordynowania z sektorem auth.
6. Nginx/CDN i kolektor telemetryczny mogą niezależnie logować URL-e. BE-02 usuwa potwierdzoną ścieżkę w backendzie; retencja i redakcja pozostałych warstw wymagają przeglądu ich właściciela.
7. Storage, media, media-worker, auth, frontend, infrastruktura i zależności mają osobnych właścicieli audytu. Raport nie rozstrzyga ich wyników ani trwającej diagnozy unhealthy po aktualizacji obrazów.
