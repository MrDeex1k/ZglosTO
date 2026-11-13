# Audyt bezpieczeństwa — sektor 1 — 2026-11-13

## Wynik i zakres

Naprawiono dwa potwierdzone błędy mechanizmów bezpieczeństwa (AUTH-01 i AUTH-02), a także warunkowy błąd parsera łańcucha proxy (AUTH-03). Nie potwierdzono zdalnej eskalacji roli ani przejęcia sesji przez nagłówki. To audyt sektora, nie certyfikacja całego systemu ani test wdrożenia.

Zakres: `authorization/**`, `packages/workload-auth/**`, `packages/rate-limiting/**`, `packages/transient-store/**`. Prześledzono odczytowo Nginx → Authorization, backendowy klient mTLS → `/api/verify-session`, guard ról oraz użycie podpisów przez `llm_gateway`. Zachowano zastane zmiany parenta; nie edytowano manifestów, lockfile, obrazów ani plików innych sektorów. Nie tworzono branchy/commitów.

Metoda: skill `security-best-practices`, referencja `javascript-express-web-server-security.md` jako ogólna lista kontroli serwera JS (aplikacja używa Hono, nie Express), analiza kodu zainstalowanego Better Auth 1.7.23 i Expo oraz testy lokalne bez sieci. Zasady ograniczania prób i ryzyka enumeracji porównano z [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

## Potwierdzone znaleziska i naprawy

### AUTH-01 — Medium — usuwanie ważnych nonce po zapełnieniu cache

- OWASP A07:2021 Identification and Authentication Failures; CWE-294 Authentication Bypass by Capture-replay.
- Lokalizacja: `packages/workload-auth/src/index.ts:101`, szczególnie gałąź pojemności `:106`; użycie: `llm_gateway/src/server.ts:18`, `llm_gateway/src/app.ts:123` (poza zakresem edycji).
- Dowód: poprzednia implementacja usuwała najstarszy wpis niezależnie od jego ważności po osiągnięciu `maximumEntries`.
- Warunki: dostęp do wcześniej podpisanego żądania oraz wystarczającej liczby innych ważnie podpisanych żądań w oknie czasu, dostęp do chronionego endpointu (w obecnym wdrożeniu także mTLS). Nie jest to obejście HMAC przez anonimowego klienta internetu. Po usunięciu nonce można było ponownie zaakceptować wcześniejszy podpis i ponowić kosztowną klasyfikację.
- Naprawa: pełny cache odrzuca nowe nonce zamiast usuwać żywe wpisy. Wpisy wygasają dopiero po końcu akceptowanego okna, z zachowaniem granicy `expiry == now`.
- Test: `packages/workload-auth/src/index.test.ts`, „capacity pressure cannot evict a live nonce and allow a replay”: pojemność 1, prawidłowo podpisane A/B, odmowa B, odmowa replay A na końcu okna i przyjęcie świeżego żądania po wygaśnięciu A.
- Skutek operacyjny: pełny cache odrzuca również nowe poprawne żądania. Gateway obecnie mapuje odmowę na 401; należy dobrać pojemność do liczby podpisanych żądań w całym oknie. Naprawa chroni integralność kosztem dostępności przy nasyceniu.

### AUTH-02 — Medium — utrata limitów logowania przy awarii Redis

- OWASP A07:2021; CWE-307 Improper Restriction of Excessive Authentication Attempts, CWE-636 Not Failing Securely.
- Lokalizacja: `authorization/src/better-auth-rate-limit-storage.ts:45`; reguły: `authorization/src/distributed-rate-limit.ts`.
- Dowód: wyjątek `store.increment` zwracał `{ allowed: true, retryAfter: null }`. Limit Better Auth np. 3/10 s dla logowania przestawał obowiązywać; pozostawał ogólny lokalny limit domyślnie 50/s, osobny dla każdej repliki.
- Warunki: aktywny Redis i jego niedostępność/timeout. Atakujący nie musi sam wywołać awarii; może wykorzystać jej okno do znacznie większej liczby prób hasła. Nie oznacza to całkowitego braku throttlingu.
- Naprawa: błąd odczytu licznika odrzuca żądanie, zwracając `retryAfter` zgodny z oknem reguły. Po odzyskaniu Redis kolejna operacja znów używa jego atomowego licznika.
- Test: `authorization/src/distributed-rate-limit.test.ts` sprawdza odmowę przy awarii, Retry-After 10 i 60 sekund oraz poprawne odzyskanie działania. Istniejący test sprawdza niejawny klucz HMAC i przeliczenie TTL.
- Skutek operacyjny: awaria Redis blokuje operacje obsługiwane przez ten limiter (w tym logowanie i część odczytów Better Auth), zamiast osłabiać ochronę haseł. `/api/verify-session` nadal odczytuje sesję bez tego middleware. Readiness obecnie pokazuje Redis jako degraded; parent powinien uwzględnić to w monitoringu dostępności logowania.

### AUTH-03 — Low, warunkowe — przesuwanie adresów w błędnym łańcuchu proxy

- OWASP A05:2021 Security Misconfiguration / A07:2021; CWE-346 Origin Validation Error, CWE-307.
- Lokalizacja: `packages/rate-limiting/src/request-identity.ts:23`.
- Dowód: usuwanie niepoprawnych elementów przez `filter` zmieniało pozycje w X-Forwarded-For; np. `[adres_atakującego, invalid, peer]` przy jednym zaufanym hopie dawało adres atakującego. Za krótki łańcuch był indeksowany od lewej przez `Math.max(0, clientIndex)`.
- Warunki: niepoprawny lub krótszy niż deklarowany łańcuch zaufanych proxy, alternatywna droga wejścia albo źle skonfigurowana liczba hopów. Standardowy Nginx dopisujący poprawny `$remote_addr` i ustawienie 1 nie pozwalają publicznemu klientowi wywołać tego przypadku samym prefiksem XFF. Nie potwierdzono obejścia na tej standardowej trasie.
- Naprawa: zachowanie pozycji elementów, wspólny bucket `unknown` dla niepoprawnej istotnej części łańcucha i fallback do peer dla brakujących hopów. Nie zmieniono kontraktu funkcji ani dozwolonej topologii.
- Test: `packages/rate-limiting/src/request-identity.test.ts`, „never promotes a spoofed address by dropping malformed proxy slots”: rotacja adresu atakującego, błędny slot klienta/proxy i zbyt krótki łańcuch. Istniejące testy nadal sprawdzają poprawne 1/2 hopy i ignorowanie fałszywego prefiksu.

## Zweryfikowane zabezpieczenia

- mTLS: TLS minimum 1.3, certyfikat klienta wymagany i weryfikowany przez CA. Tożsamość pochodzi z pojedynczego URI SAN zweryfikowanego certyfikatu, nie z nagłówka. Backend ma dostęp do verify-session/health, Nginx do auth, healthcheck tylko do health. Nowe testy `authorization/src/mtls-server.test.ts` sprawdzają rozdzielenie tras, obcą tożsamość, nieweryfikowany certyfikat, brak URI oraz wiele URI. Są to testy polityki listenera z atrapą serwera i certyfikatu, nie handshake TLS.
- IP: `normalizeBetterAuthRequest` nadpisuje wejściowy `x-zglosto-client-ip` wynikiem resolvera. Nowy test aplikacji sprawdza spoofing tego nagłówka i lewego prefiksu XFF.
- CORS: lista originów, credentials tylko z dopasowanym originem; produkcja nie dodaje localhost. Test sprawdza brak `Access-Control-Allow-Origin` dla atakującego. CORS nie jest traktowany jako samodzielna ochrona CSRF.
- CSRF/cookies: w kodzie zainstalowanej biblioteki sprawdzono origin, callback/redirect URL i Fetch Metadata; konfiguracja aplikacji nie wyłącza tych kontroli. Nowy `better-auth-security.test.ts` używa rzeczywistej biblioteki i potwierdza 403 dla obcego originu mimo `expo-origin: zglosto://`. W teście jawnie włączono ochronę, ponieważ Better Auth domyślnie wyłącza ją pod NODE_ENV=test. Potwierdzono host-scoped `Secure`, `HttpOnly`, `SameSite=Lax` i Path=/ dla HTTPS. Nie ma szerokiego Domain ani cookie-cache ról.
- Role: `customSession` odczytuje role z DB dla `user.id`; brak roli nie nadaje uprawnień, wyjątek DB kończy się 503. serviceKey jest zwracany tylko dla aktywnej usługi i roli `sluzby`. Parametryzowane SQL. Testy `auth.test.ts` potwierdzają brak eskalacji przy błędzie i brakującym wpisie. Backend odczytowo: sesja jest walidowana schematem, guard bierze rolę z kontekstu zweryfikowanej sesji.
- Historia anonimowych zgłoszeń: przypisanie dopiero po weryfikacji e-mail lub utworzeniu już zweryfikowanego użytkownika. Niezweryfikowana rejestracja nie uruchamia przejęcia historii.
- Testowe endpointy zmiany roli/outbox wymagają jednocześnie NODE_ENV=test oraz EMAIL_DELIVERY_MODE=test; env odrzuca testowy tryb poczty poza testami. Testy aplikacji potwierdzają 404 obu endpointów w produkcji.
- DoS: body auth ograniczone do 64 KiB przed wywołaniem Better Auth, lokalny limiter ma ograniczenie kluczy i odrzuca przy nasyceniu; HMAC rozdziela namespace i nie ujawnia IP w kluczu.
- Workload HMAC: wiąże metodę, ścieżkę, hash całego body, identyfikator klucza, czas i nonce; porównanie constant-time; formaty, okno czasu i replay walidowane. Niepoprawny podpis nie zajmuje cache.
- Redis: credentials z pliku; rediss weryfikuje CA/hostname, reconnect ograniczony, timeouty operacji, walidacja nazw kluczy/TTL/odpowiedzi Lua, atomowe INCR+TTL i SET NX PX oraz compare-and-delete lease. Testy transient-store potwierdzają te kontrakty bez prawdziwego Redis. Brak danych sesji w transient-store. Tryb disabled jest jawny i używa pamięciowego limitera Better Auth.
- Logi aplikacji nie zapisują haseł, tokenów, cookie, adresów e-mail ani szczegółów wyjątków; logger redukuje details/error do flag obecności. Błędy API zwracają odpowiedź ogólną; odpowiedzi API mają no-store.

## Pozostałe ryzyka i przekazanie parentowi

1. **Enumeracja rejestracji — Low, OWASP A07:2021, CWE-204.** `authorization/src/auth.ts:98` ma opcjonalną weryfikację i domyślne autoSignIn. Zainstalowany Better Auth `dist/api/routes/sign-up.mjs:155,210` ujawnia istniejący e-mail przez błąd 422 zamiast sukcesu z sesją. Publiczny klient może rozpoznawać zajęte adresy w granicach limitu. Nie usunięto tego przez maskowanie pojedynczego komunikatu, ponieważ status/sesja nadal pozwalałyby rozróżniać przypadki. Docelowa naprawa: generyczna odpowiedź oraz `autoSignIn:false` albo wymaganie weryfikacji, wraz ze zmianą obsługi rejestracji we frontendzie/mobile (poza sektorem). Wymagany test całego przepływu nowego i istniejącego adresu, porównujący status, body, cookie i UI. To pozostaje niezałatwiona kwestia prywatności, nie przejęcie konta.
2. **Poczta i odzyskiwanie:** produkcja jawnie nie ma sendResetPassword ani nadawcy weryfikacji. Endpoint żądania resetu w bibliotece odmawia pracy bez callbacka; nie potwierdzono obejścia tokenu. Nie można twierdzić, że odzyskiwanie działa. Włączenie nadawcy, domeny i frontendowego flow wymaga pracy między sektorami. Przed włączeniem należy sprawdzić jednorazowość tokenu, wygasanie, unieważnianie sesji i brak enumeracji.
3. **Replay między procesami/restartami:** WorkloadReplayCache jest pamięciowy. Naprawa AUTH-01 chroni jedną instancję; nie daje wspólnej ochrony wielu replik ani trwałości po restarcie. Parent powinien potwierdzić topologię LLM gateway; dla wielu replik zastosować wspólny atomowy magazyn nonce w gateway (poza sektorem), z odmową przy jego awarii. Bez dowodu wieloreplikowego wdrożenia nie klasyfikowano tego jako zrealizowanego ataku produkcyjnego.
4. Limity Better Auth są związane z IP/ścieżką; rozproszony password spraying z wielu rzeczywistych IP nadal wymaga monitoringu i ochrony kont uprzywilejowanych. Brak MFA nie został przedstawiony jako samodzielny dowód włamania.
5. Liczba zaufanych hopów musi odpowiadać rzeczywistej trasie. Funkcja resolvera nie uwierzytelnia proxy; w Authorization tę granicę zapewnia mTLS Nginx. Backend musi sam utrzymać odpowiednią granicę dostępu.

## Walidacja i ograniczenia

Wykonano na Bun:

- `bun run --cwd authorization test`: 7 plików, 23 testy PASS.
- `bun run --cwd packages/workload-auth test`: 1 plik, 4 testy PASS.
- `bun run --cwd packages/rate-limiting test`: 2 pliki, 10 testów PASS.
- `bun run --cwd packages/transient-store test`: 2 pliki, 15 testów PASS.
- `typecheck` każdego z czterech workspace: PASS.
- Build workload-auth i rate-limiting: PASS (odświeżono lokalny dist wykorzystywany przez workspace).
- `git diff --check`: PASS.

Łącznie 52 testy. Nie uruchamiano Docker, listenerów, usług zewnętrznych ani zapytań do istniejącej bazy/Redis. Test prawdziwej biblioteki auth korzysta wyłącznie z kontekstu w pamięci. Nie przeprowadzono dynamicznego handshake TLS, E2E Nginx/PostgreSQL ani testu wieloreplikowego; nie zweryfikowano wdrożonych sekretów, rotacji CA, ACL Redis ani infrastrukturalnych polityk sieciowych. Stan audytu zależności i obrazów pozostaje domeną parenta, nie powielano jego aktualizacji.
