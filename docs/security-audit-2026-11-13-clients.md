# Audyt bezpieczeństwa klientów — 2026-11-13

## Podsumowanie

Zakres: `frontend/**`, `Mobile/**`, `docs-site/**`, z wyłączeniem manifestów pakietów i Dockerfile. Potwierdzono i naprawiono cztery problemy: trzy o wadze Medium związane z pozostawieniem wcześniej dostępnych danych w stanie/cache klientów oraz jeden Low dotyczący fragmentów sesji w SecureStore. Nie potwierdzono XSS, kradzieży sesji przez deep link ani obejścia autoryzacji serwerowej. Nie jest to zapewnienie braku innych podatności.

Zachowano istniejące niezacommitowane zmiany parenta. Nie zmieniano manifestów, lockfile, danych aplikacji, branchy ani commitów. Nie uruchamiano emulatorów, Dockera ani testów zewnętrznych usług. Wykorzystano skill security-best-practices i references dla JavaScript frontend i React; po zmianach TSX także react-doctor. Referencje te nie zawierają osobnego standardu Expo/React Native; część natywną sprawdzono dodatkowo na podstawie kodu zainstalowanych bibliotek.

## Potwierdzone znaleziska i naprawy

### CLIENT-01 — Medium: prywatny incydent pozostawał w stanie React po wylogowaniu

- **OWASP/CWE:** A01:2021 Broken Access Control; CWE-200, CWE-488.
- **Warunki:** zalogowany użytkownik otwiera prywatny incydent mieszkańca/służby, następnie wylogowuje się. Provider pozostawał zamontowany, `selectedIncident` i stan otwarcia dialogu nie były zerowane. Nawigacja na stronę główną przekazywała ten sam obiekt do dialogu. Kolejna osoba przy tej samej otwartej aplikacji mogła zobaczyć wcześniej pobrane dane. Nie umożliwiało to pobrania nowych danych z chronionego API.
- **Dowód i lokalizacja:** `frontend/src/app/app-route-state.tsx:67` (naprawiona granica providera), `frontend/src/app/route-views.tsx:28` (przekazanie wybranego incydentu do strony publicznej). Samo usunięcie prywatnych zapytań przy logout nie usuwało kopii w stanie komponentu.
- **Naprawa:** wewnętrzny provider i jego poddrzewo mają klucz zależny od ID sesji, użytkownika, roli i służby. Zmiana granicy sesji odmontowuje dialogi i formularze wraz z lokalnymi kopiami danych, również przy zmianie sesji poza przyciskiem logout.
- **Test:** `frontend/src/app/app-route-state.test.tsx` sprawdza faktyczny klucz granicy React przy logout, nowym koncie/sesji oraz zmianie roli/służby. Test nie zastępuje testu interakcji DOM w przeglądarce.

### CLIENT-02 — Medium: cache kolejki WEB nie rozróżniał przypisanej służby

- **OWASP/CWE:** A01:2021; CWE-524, CWE-200.
- **Warunki:** pracownik ma pobraną kolejkę służby A, a jego zweryfikowana sesja zmienia przypisanie na B bez przeładowania całej aplikacji. Klucz prywatnego cache zawierał rolę i e-mail, ale nie `serviceKey`. Nowy widok mógł otrzymać dane A z pamięci (staleTime 30 s, retencja cache 10 min). Serwer nadal samodzielnie autoryzuje nowe żądania.
- **Lokalizacja:** `frontend/src/queries/incidents.ts:21`, `frontend/src/hooks/use-incident-data.ts:53`, `frontend/src/hooks/use-incident-mutations.ts:41`, `frontend/src/app/app-route-state.tsx:108`.
- **Naprawa:** klucz kolejki obejmuje `serviceKey`; pobrania i aktualizacje cache po mutacji używają tego samego zakresu pochodzącego z sesji.
- **Test:** `frontend/src/queries/incidents.test.ts` zapisuje kolejkę A do rzeczywistego QueryClient i potwierdza brak jej pod kluczem B tego samego konta.

### CLIENT-03 — Medium: odświeżenie sesji po 403 pomijało czyszczenie prywatnego stanu Mobile

- **OWASP/CWE:** A01:2021; CWE-524, CWE-200.
- **Warunki:** zmiana lub cofnięcie przypisania/roli podczas działającej aplikacji, odpowiedź 403 i udane pobranie nowej sesji. Handler ustawiał sesję bez istniejącej procedury porównania zakresu i czyszczenia. Stare dane i pliki mogły pozostać na urządzeniu po utracie przypisania. Klucze części zapytań rozróżniają służby, co ogranicza bezpośrednie wyświetlenie kolejki; prywatne obrazy są zakresowane użytkownikiem, nie służbą.
- **Lokalizacja:** `Mobile/src/auth/session-provider.tsx:243`; procedura porównania `commitVerifiedSession` w tym samym pliku i `Mobile/src/auth/session-cleanup.ts:42`.
- **Naprawa:** obsługa 403 przechodzi przez `commitVerifiedSession`, tak jak standardowe odświeżenie. Przy zmianie zakresu usuwa prywatne zapytania, cache zdjęć i wybrane media. Błąd sieci nie powoduje wylogowania.
- **Test:** `Mobile/src/auth/session-provider.test.tsx` wywołuje rzeczywisty handler providera z atrapami hooków i transportu; sprawdza czyszczenie przy nowym przypisaniu oraz zachowanie sesji przy błędzie sieci. Istniejące testy cleanup i anulowania pobrania zdjęcia nadal przechodzą.

### CLIENT-04 — Low: niekompletne usuwanie fragmentów SecureStore

- **OWASP/CWE:** A07:2021 Identification and Authentication Failures; CWE-459.
- **Warunki:** dane Better Auth zostały podzielone na fragmenty. Zainstalowany klient obsługuje znaczniki `count:slot:fallbackCount` i klucze `.0.index`/`.1.index`, natomiast cleanup rozpoznawał tylko dawny licznik i `.index` do 16 fragmentów. Pozostawały fragmenty cookie lub danych sesji po lokalnym logout. Ich odzyskanie wymaga dostępu do magazynu aplikacji/Keychain; nie wykazano zdalnego odzyskania ani automatycznego zalogowania po usunięciu klucza głównego.
- **Lokalizacja:** `Mobile/src/auth/auth-storage.ts:18`; format potwierdzono w `node_modules/@better-auth/expo/dist/client.js` (`parseChunkMarker`, `getChunkKey`, limit 100).
- **Naprawa:** usuwa wszystkie trzy warianty kluczy do limitu 100 zainstalowanej biblioteki i klucz główny, również przy uszkodzonym/brakującym znaczniku. Nieudane usunięcie jednego fragmentu nie blokuje prób pozostałych; błąd jest propagowany do istniejącego raportowania cleanup.
- **Test:** `Mobile/src/auth/auth-storage.test.ts`: stary/nowy format obu slotów, fallback, brak/uszkodzenie znacznika, fragment nr 99, pozostawienie obcych ustawień i awaria pojedynczego usunięcia.

## Pokrycie i zweryfikowane zabezpieczenia

- **XSS/DOM:** przeszukano sinki HTML/eval/postMessage i dynamiczne URL. Opisy/adresy zgłoszeń WEB renderuje JSX jako tekst. Nie znaleziono `dangerouslySetInnerHTML` w klientach zgłoszeń. Docs zawiera `set:html` w banerze oraz `innerHTML` dla fragmentów wyników Pagefind; źródłem jest budowana z repo dokumentacja/indeks, nie treść zgłoszeń ani bezpośrednio parametr URL. Nie wykazano kontrolowanego przez atakującego wejścia. Zaufanie do autorów dokumentacji pozostaje warunkiem.
- **Sesje/cache:** WEB używa Better Auth z same-origin `/api/auth`, bez zapisu tokenów w local/sessionStorage; locale jest zapisywane oddzielnie. QueryClient jest tworzony przez fabrykę. Mobile używa SecureStore i ręcznego cookie z `credentials: omit`; AsyncStorage służy publicznej konfiguracji i preferencjom. Prywatne klucze uwzględniają użytkownika/origin, usuwanie zapytań anuluje pobrania, test chroni przed ponownym zapisaniem pliku po logout.
- **CSRF/auth:** mutacje WEB są JSON. Pomocniczo odczytano guard backendu (`backend/nest/modules/auth-bridge/authorization.guard.ts`): odrzuca mutacje bez JSON i `Sec-Fetch-Site: cross-site`; klient nie jest traktowany jako granica autoryzacji. Better Auth ma własną listę trusted origins. Pełna weryfikacja backendu i konfiguracji cookies należy do parenta.
- **URL/deep links:** `parseLocalRedirect` sprawdza docelowy origin po parsowaniu URL; istnieją testy niezaufanych przekierowań. Mobile wymaga UUID i zamkniętego zbioru celów, nie przyjmuje dowolnego URL jako celu logowania. App links używają walidowanego hosta DNS, HTTPS i wskazanych ścieżek. Ekran wyniku weryfikacji maila nie nadaje samodzielnie uprawnień serwerowych.
- **Upload/obrazy:** presigned upload jest oddzielony od uwierzytelnionego klienta; sesyjne Cookie nie jest jawnie doklejane do uploadu. Mobile waliduje MIME/rozmiar wybranego obrazu i wykonuje kontrolowaną kopię pliku; private-image wymaga ścieżki zgodnej z ID, dopuszcza raster i kontroluje rozmiar. WEB wyświetla obrazy przez `img`, nie jako aktywny HTML. Walidacja frontendowa nie zastępuje serwera ani workera mediów.
- **Transport/native:** produkcyjny i preview API origin musi być HTTPS; HTTP API jest dozwolone tylko jawnie w development na hostach lokalnych/prywatnych. Plugin ATS nie włącza arbitrary loads, wyjątek wskazuje lokalny host uploadu. Nie znaleziono własnego wyłączania walidacji certyfikatów w Mobile. Klient auth nie zawiera sekretów statycznych.
- **Build/docs:** statyczny docs-site nie ma endpointu wykonującego kod przesłany przez użytkownika. Vite przekazuje do bundla publiczną projekcję white-label, nie cały prywatny plik. Nie znaleziono konfiguracji publikującej prywatne klucze ani jawnego włączenia sourcemap w Vite/Astro. Nie badano gotowych produkcyjnych artefaktów.

## Walidacja i ograniczenia środowiska

- Bun 1.4.4: frontend **85/85**, Mobile **153/153**, docs-site **14/14** testów PASS; typecheck frontend/Mobile PASS, lint Mobile PASS.
- React Doctor `--scope changed`: frontend i Mobile **100/100**, bez zgłoszeń. Dla npm użyto izolowanego prefix/cache w `/private/tmp`, bo npm interpretuje istniejącą składnię overrides Bun jako nieprawidłową nazwę pakietu; manifestów nie modyfikowano.
- `node ../node_modules/expo/bin/cli config --type public` w Mobile: **PASS** na lokalnym Node 24.20.0. Ten sam config przez `bun run --bun expo config --type public` kończy się `Unexpected identifier 'type'` w loaderze `@expo/require-utils` korzystającym z `_compile` z trybem TypeScript. Nie jest to dowód błędnego projektu; należy używać standardowego uruchomienia CLI Expo przez wspierany Node. Repo wymaga **Node >=26.8.1**; lokalny Node 24 nie spełnia deklaracji i nie pozwala potwierdzić całego wspieranego toolchainu. Nie przerabiano poprawnego configu TS na workaround loadera Bun.
- Expo Doctor pod Node: **14/20** kontroli PASS, konfiguracja została załadowana. Reszta: brak dostępu do `exp.host`/React Native Directory, nieudane `npm explain` przy zależnościach oraz różnice macierzy SDK: AsyncStorage 3.1.1 vs 2.2.0, gesture-handler 3.5.0 vs ~3.3.0, React/react-dom 19.3.1 vs 19.3.0, worklets 0.13.1 vs 0.13.0. To informacja dla parenta o kompatybilności, nie potwierdzona podatność. Nie cofano aktualizacji bezpieczeństwa.
- Przez pomyłkę uruchomiono także root `bun run test`: 18/20 zadań zakończonych sukcesem; backend nie przeszedł m.in. przez brak możliwości otwarcia portu 0 w sandboxie. Wynik nie stanowi walidacji backendu; nie ponawiano poza przydzielonym zakresem ani nie uruchamiano Docker/serwerów ręcznie.

## Pozostałe ryzyka i przekazanie parentowi

1. Zweryfikować macierz Expo/RN na Node >=26.8.1, z dostępem do metadanych, oraz build release i zachowanie na urządzeniu. Bez emulatora nie potwierdzono ustawień finalnego AndroidManifest/Info.plist, Keychain ani UI przełączania kont w gotowym binarium.
2. Polityka uploadu dopuszcza HTTP URL presigned (lokalny development). Serwer/storage musi gwarantować HTTPS w produkcji. Nie wykazano drogi, przez którą zwykły użytkownik mógłby podmienić docelowy host URL wystawianego przez serwer; nie sklasyfikowano tego jako potwierdzonej podatności klienta. Flaga lokalnego ATS powinna pozostać wyłączona w wydaniach.
3. Nagłówki CSP, cache prywatnych odpowiedzi/obrazów, HttpOnly/SameSite/Secure cookies, realne CORS/CSRF i autoryzację zasobów potwierdzić na ingress/backend. UI guards nie są ochroną API. Nie wykonano żądań do wdrożenia ani zewnętrznych systemów.
4. Odbieranie uprawnień wymaga odświeżenia sesji/odpowiedzi serwera. Poprawki usuwają/izolują dane po rozpoznaniu zmiany; nie zapewniają zdalnego wymazania wcześniej legalnie pobranych danych ani pamięci urządzenia kontrolowanego przez atakującego.
5. Nie nadpisano innych sektorów. Poza zakresem pozostają zależności i obrazy zarządzane przez parenta, audyt wdrożenia, sekrety CI oraz dostarczone artefakty produkcyjne/sourcemaps.

## Weryfikacja integracyjna parenta po zakończeniu sektora

Na komputerze dostępny jest Node 26.13.1 pod `/opt/homebrew/opt/node@26/bin/node`;
wcześniejszy Node 24 pochodził z pierwszego wpisu PATH. Parent ponowił diagnostykę
na Node 26, potwierdził kontrolę macierzy SDK i wyrównał Mobile przez SFW do
wspieranych wersji: AsyncStorage2.2.0, gesture-handler3.3.0, React/ReactDOM19.3.0
i worklets0.13.0. RN0.88.1 jest zgodny z aktualnym SDK58.

`expo install --check` pod Node26: PASS (Dependencies are up to date).
Typecheck, pełne testy Mobile oraz eksport Android i iOS z Node26 w PATH: PASS.
`bun run audit:release` i `bun run check:workspaces`: PASS po wyrównaniu.
Pełny Expo Doctor nadal ma ograniczenie polegające na użyciu `npm explain`,
które nie obsługuje składni overrides Bun w tym repo. Nie wyłączono tych kontroli
ani nie zamieniono ich wyniku na pełny PASS. Nie wykonywano testu binarium na urządzeniu.
