# Faza 10 — Redis, lokalny rate limiting i cache publicznej listy

## Status

**Faza zakończona 2026-07-25 — 11/11 kroków.**

Decyzje architektoniczne zaakceptowano 2026-07-25. Wszystkie kroki zakończono: wspólny,
typowany kontrakt konfiguracji jest walidowany podczas startu, Authorization i publiczny
zapis zgłoszenia mają zawsze aktywną ochronę lokalną, a provider-neutralny magazyn
krótkotrwały ma gotowy adapter Redis. Better Auth oraz publiczny zapis zgłoszenia używają
atomowych liczników Redis w `local`/`external` i bezpiecznie wracają do lokalnej ochrony
przy awarii. Publiczna lista rozwiązanych incydentów używa zwalidowanego cache-aside Redis
z TTL `900 s`, wersjonowanymi kluczami, ochroną przed stampede i invalidacją. PostgreSQL
ma częściowy indeks dla cache miss, a Nginx cache’uje wyłącznie publiczny endpoint przez
`900 s` bez Redisa lub `30 s` w trybach Redis. Krok 9 dostarczył profile Redis `local` i
`external` dla Compose, Kubernetes i K3s. Readiness rozróżnia awarię wymaganej zależności
od odtwarzalnego Redisa, telemetria obejmuje stan, błędy i opóźnienia, a automatyczny test
potwierdza degradację, fallback oraz odzyskanie połączenia. Krok 11 dostarczył końcowy
runbook operatorski i zamknął Fazę 10. Następną fazą jest Faza 11 —
optymalizacja obrazów oraz finalizacja produkcyjnego profilu Docker Compose.

Redis został wybrany zamiast PostgreSQL `UNLOGGED TABLES`. RabbitMQ nadal odpowiada za
trwałe zadania asynchroniczne, PostgreSQL pozostaje źródłem prawdy, a Redis przechowuje
wyłącznie stan krótkotrwały, którego utrata nie narusza danych biznesowych.

## Zrealizowane cele

Zrealizowane cele:

1. zachować zawsze aktywny lokalny rate limiting bez zależności od Redisa;
2. zapewnić wspólny rate limiting wielu replik w trybach Redis `local` i `external`;
3. zabezpieczyć endpointy Better Auth oraz publiczne dodawanie zgłoszeń;
4. ograniczyć liczbę zapytań o publiczną listę rozwiązanych incydentów;
5. umożliwić małym instalacjom Compose działanie produkcyjne bez Redisa;
6. zapewnić bezpieczną degradację przy awarii Redisa;
7. objąć cache i limitery metrykami, alertami oraz testami pozytywnymi i negatywnymi.

Redis nie zastępuje sesji Better Auth w PostgreSQL, RabbitMQ, PostgreSQL ani Object Storage.

## Tryby Redisa

`REDIS_MODE` przyjmuje dokładnie jedną z trzech wartości:

| Tryb       | Lokalny limiter | Rozproszony limiter Redis | Cache Redis | Cache Nginx publicznej listy | Przeznaczenie                                           |
| ---------- | --------------- | ------------------------- | ----------- | ---------------------------- | ------------------------------------------------------- |
| `disabled` | zawsze aktywny  | nie                       | nie         | `900 s`                      | mały, pojedynczy Compose bez Redisa                     |
| `local`    | zawsze aktywny  | tak                       | `900 s`     | microcache `30 s`            | Redis dostarczany przez profil ZgłosTO                  |
| `external` | zawsze aktywny  | tak                       | `900 s`     | microcache `30 s`            | Redis dostarczany przez operatora lub usługę zewnętrzną |

`disabled` oznacza wyłącznie brak Redisa. Nie wyłącza lokalnego rate limitingu.
Nie wprowadzamy zmiennej pozwalającej wyłączyć lokalny limiter w środowisku produkcyjnym.

Tryb `disabled` jest wspieranym wariantem produkcyjnym dla małej instalacji Compose z jedną
repliką Authorization, backendu i Nginx. Nie zapewnia globalnego limitu po ręcznym
uruchomieniu wielu replik: każdy proces ma własne liczniki, a restart procesu je zeruje.
Kubernetes i K3s oraz wieloreplikowy Compose powinny używać `local` albo `external`.

## Dwie warstwy rate limitingu

### Warstwa lokalna

Authorization i backend mają zawsze aktywny, procesowy limiter krótkiego burstu. Stan ma:

- ograniczoną liczbę kluczy i kontrolowane zużycie pamięci;
- automatyczne wygasanie i okresowe sprzątanie;
- monotoniczny pomiar czasu;
- osobne przestrzenie kluczy i reguły dla auth oraz zgłoszeń;
- hashowane identyfikatory zamiast surowych IP, e-maili lub cookies;
- metryki dopuszczeń, odrzuceń, liczby aktywnych kluczy i przejścia w fallback.

Krok 2 wdrożył stałe okno z zegarem monotonicznym. Liczniki wygasają automatycznie, są
sprzątane okresowo i przy osiągnięciu pojemności, a timer nie podtrzymuje procesu Node.
Nowy, nieznany klucz jest chwilowo odrzucany, jeśli pamięć nadal zawiera maksymalną liczbę
aktywnych liczników — limiter nie zwiększa zużycia pamięci i nie pozwala omijać ochrony
przez wymuszanie eksmisji aktywnych kluczy. Zamknięcie modułu usuwa timer oraz zawartość
mapy.

Surowe IP nie trafia do mapy, metryk ani logów. Każdy proces używa losowego, co najmniej
256-bitowego klucza HMAC-SHA-256, a przestrzenie `authorization:ip` i
`incident-submit:ip` są rozdzielone. Identyfikator jest celowo niestabilny między restartami,
ponieważ liczniki lokalne również nie są trwałe.

Adres klienta jest wybierany od prawej strony łańcucha `X-Forwarded-For`, po pominięciu
jawnie skonfigurowanej liczby zaufanych proxy. Compose używa
`CLIENT_IP_TRUSTED_PROXY_HOPS=1` dla Nginx, a Kubernetes/K3s używają `2` dla Ingress +
Nginx. Pierwszy, możliwy do podrobienia element nagłówka nie jest bezwarunkowo uznawany za
adres klienta.

W `disabled` lokalny limiter jest właściwą ochroną instalacji. W `local` i `external` jest
pierwszą, szybką warstwą przeciw burstom oraz fallbackiem przy awarii Redisa. Jego próg nie
może być bardziej restrykcyjny od właściwego limitu rozproszonego bez jawnej decyzji
produktowej.

### Warstwa rozproszona

W `local` i `external` Redis przechowuje atomowe liczniki z TTL, wspólne dla wszystkich
replik. Żądanie przechodzi najpierw limiter lokalny, a następnie rozproszony. Przestrzenie
kluczy muszą być rozdzielone, na przykład:

```text
zglosto:rate-limit:auth:...
zglosto:rate-limit:incident-submit:...
zglosto:cache:homepage:resolved:...
```

Reguły i progi są konfigurowalne oraz obserwowalne. Ostateczne wartości zostaną dostrojone
na podstawie load testów w Fazie 12.

## Better Auth

Better Auth nadal definiuje semantyczne reguły endpointów auth oraz zwraca `429` i
`Retry-After`.

- w `disabled` używa własnego magazynu pamięciowego;
- w `local` i `external` używa Redis przez dedykowane `rateLimit.customStorage` z atomowym
  `consume`;
- adapter musi udostępniać atomowe `increment` z TTL, aby równoległe żądania nie omijały
  limitu;
- przed handlerem Better Auth działa lokalny limiter krótkiego burstu;
- domyślne reguły Better Auth zostają jawnie zapisane w konfiguracji i testach, zamiast
  zależeć od niejawnego zachowania biblioteki;
- zaufany nagłówek adresu klienta musi być zgodny z Nginx/Ingress i nie może umożliwiać
  podszycia się przez publiczne `X-Forwarded-For`.

Authorization sam wylicza zaufany adres tym samym algorytmem co limiter lokalny, nadpisuje
wewnętrzny `x-zglosto-client-ip` i dopiero ten pojedynczy nagłówek przekazuje Better Auth.
Nagłówek przesłany przez klienta nie jest uznawany za źródło prawdy.

Sesje Better Auth pozostają w PostgreSQL. Faza 10 nie przenosi ich do Redisa.

Nie konfigurujemy globalnego `secondaryStorage`. Better Auth 1.6 kieruje wtedy również
odczyty sesji do secondary storage, nawet gdy `session.storeSessionInDatabase=true`.
Dedykowane `rateLimit.customStorage` pozwala użyć Redis wyłącznie dla liczników i zachować
PostgreSQL jako jedyne źródło oraz miejsce odczytu sesji.

## Publiczne dodawanie zgłoszeń

`POST /api/mieszkaniec/incydenty` otrzymuje:

- lokalny limiter aktywny we wszystkich trybach;
- rozproszony limiter Redis w `local` i `external`;
- identyfikację po IP oraz, dla zalogowanego mieszkańca, po `user.id`;
- globalny bezpiecznik instalacji;
- krótki limit burstu przed kosztownym LLM, zapisem, Object Storage, RabbitMQ i Sharp;
- odpowiedź `429` z `Retry-After` zgodną ze wspólnym kontraktem błędów;
- metryki i log bez danych osobowych.

Znormalizowany e-mail może być sygnałem telemetrycznym, lecz nie jest samodzielnym twardym
kluczem blokującym. Atakujący nie może zablokować cudzego adresu, wysyłając żądania w jego
imieniu. Progi IP, użytkownika, burstu i całej instalacji są konfigurowalne.

## Cache publicznej listy incydentów

Cache dotyczy wyłącznie publicznego:

```text
GET /api/mieszkaniec/incydenty/glowna
```

Nie obejmuje prywatnych list mieszkańca, służby lub administratora. TanStack Query nadal
zapewnia cache pojedynczej przeglądarki, ale nie zastępuje cache’u współdzielonego.

### Tryby `local` i `external`

Backend używa wzorca cache-aside:

1. odczytuje zwalidowany JSON z Redisa;
2. po miss odpytuje PostgreSQL;
3. zapisuje wynik z TTL `900 s`;
4. zabezpiecza odbudowę przed stampede krótką blokadą techniczną;
5. przy błędzie Redisa bezwarunkowo wraca do PostgreSQL.

Krok 6 wdrożył `PublicResolvedIncidentCache` jako provider-neutralną warstwę modułu
incydentów. Wartość z magazynu jest parsowana jako JSON i walidowana wspólnym kontraktem
`CurrentResolvedIncidentDto[]`; uszkodzony wpis jest usuwany i odbudowywany. Ten sam
kontrakt waliduje również rezultat odczytu źródłowego przed zapisaniem go w cache.

Klucz danych zawiera wersję `v1`, SHA-256 ETagu publicznej konfiguracji oraz numer rewizji.
Invalidacja zwiększa współdzieloną rewizję przed usunięciem poprzedniego wpisu. Dzięki temu
odbudowa rozpoczęta przed mutacją może co najwyżej zapisać wpis pod starą rewizją, której
nowe żądania już nie odczytają. Rewizja ma techniczny TTL 30 dni, czyli wielokrotnie dłuższy
od TTL danych; jej utrata nie narusza źródła prawdy.

Pierwszy proces po cache miss uzyskuje pięciosekundową dzierżawę. Pozostałe żądania tej
samej repliki współdzielą jedną obietnicę odbudowy, a inne repliki krótko oczekują na
gotowy wpis. Po przekroczeniu ograniczonego czasu oczekiwania albo błędzie Redis żądanie
bezwarunkowo korzysta z PostgreSQL. Błąd zapisu cache lub zwolnienia dzierżawy nie zmienia
poprawnej odpowiedzi domenowej.

Invalidacja jest wykonywana po udanej zmianie statusu, przypisanej służby lub publicznego
zdjęcia rozwiązania. Nie dotyczy zmiany samej flagi weryfikacji, uprawnień użytkownika,
prywatnych list ani utworzenia nierozwiązanego zgłoszenia. Błąd invalidacji jest
best-effort i nie cofa zatwierdzonej mutacji PostgreSQL.

Klucz zawiera wersję kontraktu oraz checksum publicznej konfiguracji miasta. Jest
natychmiast unieważniany, gdy:

- incydent otrzymuje albo traci status `resolved`;
- zmienia się służba rozwiązanej sprawy;
- dodawane, zmieniane lub usuwane jest publiczne zdjęcie rozwiązania;
- zmienia się publiczna konfiguracja wpływająca na reprezentację odpowiedzi.

TTL 15 minut jest górną granicą przy nieskutecznej invalidacji, nie oczekiwanym opóźnieniem
każdej prawidłowej zmiany.

Nginx stosuje dodatkowy microcache `30 s` z `proxy_cache_lock`. Dzięki temu repliki Nginx
mogą prezentować różne wersje najwyżej przez około 30 sekund, podczas gdy Redis pozostaje
wspólnym cache’em backendu. Cache obejmuje wyłącznie odpowiedzi `200` dla `GET`/`HEAD`;
odpowiedzi prywatne, błędy, `Set-Cookie` i mutacje nie mogą być cache’owane.

Krok 8 wdrożył osobną lokalizację exact-match wyłącznie dla
`/api/mieszkaniec/incydenty/glowna`. Backend wybiera TTL na podstawie zwalidowanego
`REDIS_MODE` i przekazuje go wewnętrznym nagłówkiem `X-Accel-Expires`: `900 s` dla
`disabled` oraz `30 s` dla `local`/`external`. Nginx konsumuje ten nagłówek, nie przekazuje
go przeglądarce i raportuje `X-Cache-Status`. Awaryjne `proxy_cache_valid 200 15m` jest
tylko wartością zapasową, gdyby poprawna odpowiedź upstream nie zawierała nagłówka TTL.

Klucz cache’u jest stały dla jednej instalacji i jednego publicznego kontraktu. Parametry
zapytania nie tworzą nieograniczonej liczby wpisów. Nginx usuwa `Cookie` i `Authorization`
przed przekazaniem tego jawnie publicznego odczytu, dopuszcza wyłącznie `GET`/`HEAD`, nie
cache’uje statusów innych niż `200` ani odpowiedzi `Set-Cookie`, a klient otrzymuje
`Cache-Control: public, max-age=0, must-revalidate`. `proxy_cache_lock` ogranicza równoległe
odpytywanie backendu, a dozwolone stale obejmuje tylko awarie upstream.

### Tryb `disabled`

Nie istnieje cache Redis. Pojedynczy Nginx Compose cache’uje publiczną odpowiedź przez
`900 s`, a po miss odpytuje backend i PostgreSQL. Jest to świadomie prostszy wariant dla
małych instalacji akceptujących widoczność nowo rozwiązanej sprawy z opóźnieniem do
15 minut.

Wieloreplikowy Nginx ma osobne lokalne cache. Dlatego 15-minutowy cache wyłącznie Nginx nie
jest certyfikowany dla Kubernetes/K3s ani ręcznie skalowanego Compose.

### PostgreSQL

Niezależnie od cache’u powstaje częściowy indeks odpowiadający filtrowaniu i kolejności
publicznego zapytania po rozwiązanych incydentach. Cache miss musi pozostać szybki i nie
może wymagać Redisa do poprawnego działania.

Krok 7 dodał idempotentną migrację `011-public-resolved-incidents-index.sql` oraz ten sam
indeks do ścieżki inicjalizacji nowej bazy. Indeks
`idx_incydenty_public_resolved_order` zawiera wyłącznie rekordy
`status_incydentu = 'resolved'` i porządkuje je po `data_rozwiazania DESC NULLS LAST`,
`godzina_rozwiazania DESC NULLS LAST` oraz `id_zgloszenia DESC`. Zapytanie publiczne używa
identycznego porządku; UUID jest stabilnym rozstrzygnięciem remisów.

## Zachowanie awaryjne

Awaria Redisa nie blokuje startu ani podstawowych przepływów:

- rate limiting pozostaje aktywny lokalnie;
- publiczny odczyt przechodzi do PostgreSQL;
- Nginx może zwrócić dozwoloną odpowiedź stale;
- sesje Better Auth nadal korzystają z PostgreSQL;
- przyjęcie zgłoszenia nie jest odrzucane wyłącznie z powodu awarii Redisa;
- readiness pozostaje gotowe, ale raportuje stan `degraded`;
- błąd uruchamia licznik, log strukturalny i alert.

Redis przechowuje wyłącznie dane odtwarzalne. Nie jest częścią backupu danych biznesowych,
nie uczestniczy w transakcji PostgreSQL i nie przejmuje odpowiedzialności RabbitMQ.

## Nginx i skalowanie

Kubernetes Service rozdziela połączenia między gotowe pody, ale nie gwarantuje podziału
50/50. Keep-alive i HTTP/2 mogą kierować wiele żądań jednym połączeniem. Każda replika Nginx
musi tymczasowo obsłużyć 100% planowanego ruchu po awarii drugiej repliki.

Dokładnej przepustowości nie określamy bez pomiaru. Faza 12 testuje co najmniej:

- jedną replikę Nginx przy pełnym planowanym ruchu;
- cache hit, cache miss i odpowiedź stale;
- nierówny rozkład połączeń, restart i usunięcie niegotowego poda;
- p95/p99, błędy, CPU, pamięć i liczbę połączeń;
- HPA Nginx oraz wartości requests/limits dobrane z pomiarów.

## Obserwowalność

Krok 10 wdrożył wspólną telemetrię operacji Redis w Authorization i backendzie:

- lokalne i rozproszone dopuszczenia oraz odrzucenia rate limitingu;
- przejście w lokalny fallback;
- `zglosto_redis_dependency_up` ze stabilnymi etykietami `service` i `redis_mode`;
- `zglosto_redis_operations` z wynikiem i nazwą operacji;
- `zglosto_redis_operation_duration_seconds` do obliczania p95;
- cache hit, miss, stale, invalidation i czas odbudowy;
- `X-Cache-Status` Nginx bez danych wysokiej kardynalności;
- liczbę bezpośrednich zapytań PostgreSQL obsługujących publiczną listę.

Prometheus alarmuje o niedostępności zależności, błędach operacji oraz p95 powyżej
`250 ms`. Dashboard Grafany pokazuje stan Redis i p95 osobno dla usług. Alerty są
utrzymywane równolegle w profilu lokalnym Compose oraz w komponencie obserwowalności
Kubernetes/K3s.

## Kolejność implementacji

1. **Wdrożone 2026-07-25:** ADR-010 jest zamknięty, a typowany kontrakt konfiguracji
   `disabled`, `local`, `external`, TTL cache’u i progów limiterów działa w Authorization i
   backendzie. `disabled` odrzuca przypadkowo przekazane sekrety Redis, a `local` i
   `external` wymagają `REDIS_URL_FILE`.
2. **Wdrożone 2026-07-25:** współdzielony pakiet `@zglosto/rate-limiting` zapewnia
   ograniczony pamięciowo limiter, automatyczne wygasanie i sprzątanie, monotoniczny zegar,
   HMAC identyfikatorów oraz bezpieczny wybór adresu za zaufanym proxy. Hono chroni
   `/api/auth/*` z wyjątkiem preflight, a NestJS chroni lokalnie
   `POST /mieszkaniec/incydenty`. Obie ścieżki zwracają `429`, `Retry-After` i `no-store`;
   limity rozproszone, użytkownika i globalny dochodzą w kroku 5.
3. **Wdrożone 2026-07-25:** pakiet `@zglosto/transient-store` definiuje neutralny port
   cache’u, atomowego licznika z TTL i krótkiej dzierżawy. Adapter używa oficjalnego klienta
   `redis@6.1.0`, Lua dla niepodzielnego `INCR` + TTL oraz bezpiecznego zwolnienia
   dzierżawy, limituje pełny czas komendy i nie ujawnia sekretów w komunikatach błędów.
   Fabryka obsługuje `disabled`, `local` i `external`, pliki sekretów oraz zweryfikowane
   TLS/SNI dla `rediss://`. Testy pokrywają operacje, awarie, timeouty i konfigurację.
   Better Auth i limiter zgłoszeń podłączono w krokach 4-5; cache podłączy krok 6.
4. **Wdrożone 2026-07-25:** Better Auth ma jawnie włączone reguły bazowe i wrażliwe
   endpointy. `disabled` używa pamięci Better Auth, a `local`/`external` używają
   dedykowanego `rateLimit.customStorage` oraz atomowego licznika Redis. Globalne
   `secondaryStorage` zostało świadomie odrzucone, ponieważ przejęłoby także odczyt sesji.
   Odpowiedź Better Auth `429` otrzymuje standardowy `Retry-After` i `no-store`.
5. **Wdrożone 2026-07-25:** interceptor po weryfikacji opcjonalnej sesji chroni publiczny
   zapis licznikami globalnym, IP i użytkownika. IP oraz `user.id` są HMAC-owane wspólnym
   sekretem montowanym z `RATE_LIMIT_HMAC_KEY_FILE`; surowe identyfikatory nie trafiają do
   Redis ani telemetrii. Odrzucenie zwraca wspólny `RATE_LIMITED`, `429`, `Retry-After` i
   `no-store`. Awaria Redis przepuszcza żądanie do obowiązkowego limitera lokalnego.
6. **Wdrożone 2026-07-25:** publiczna lista używa cache-aside Redis z TTL `900 s`.
   Wartość jest walidowana wspólnym kontraktem, klucz zawiera wersję odpowiedzi, checksum
   konfiguracji i rewizję invalidacji. Lokalny single-flight oraz rozproszona dzierżawa
   ograniczają stampede, a każdy błąd Redis bezpiecznie przechodzi do PostgreSQL. Udane
   zmiany statusu, służby i zdjęcia rozwiązania zwiększają rewizję bez wpływu awarii cache
   na wynik mutacji.
7. **Wdrożone 2026-07-25:** idempotentna migracja i inicjalizacja nowej bazy tworzą
   częściowy indeks B-tree wyłącznie dla `resolved`, zgodny z filtrem, sortowaniem
   `DESC NULLS LAST`, deterministycznym UUID i `LIMIT 15` zapytania publicznego.
8. **Wdrożone 2026-07-25:** exact-match Nginx cache dla publicznego `GET`/`HEAD` używa
   `proxy_cache_lock`, stałego klucza i dynamicznego `X-Accel-Expires`: `900 s` w
   `disabled`, `30 s` w `local`/`external`. Dane uwierzytelniające są usuwane przed
   upstream, błędy, mutacje i `Set-Cookie` nie są cache’owane, a cache ma ograniczony
   rozmiar i jawny `X-Cache-Status`.
9. **Wdrożone 2026-07-25:** dodano wzajemnie wyłączne profile `disabled`, `local` i
   `external` dla Compose, Kubernetes i K3s. `local` uruchamia
   `redis:8.10.1-alpine3.23` bez publicznego portu i trwałości, z ACL, limitem pamięci,
   `allkeys-lru`, read-only root filesystem oraz healthcheckami. `external` nie tworzy
   workloadu i wymaga zweryfikowanego `rediss://` oraz CA. Sekrety są montowane jako pliki,
   NetworkPolicy dopuszcza tylko Authorization/backend, a maszynowy kontrakt i
   `pnpm check:redis` sprawdzają parytet wszystkich platform.
10. **Wdrożone i zweryfikowane 2026-07-25:** readiness Authorization i backendu zwraca
    `200` oraz `status: degraded`, gdy wyłącznie Redis jest niedostępny; awaria PostgreSQL
    albo Object Storage nadal zwraca `503`. Dodano gauge stanu, liczniki wyników i
    histogram opóźnień, trzy reguły alertów oraz panele Grafany. Wspólny adapter potrafi
    odrzucić nieaktualne połączenie i zestawić nowe po restarcie Redis. Test
    `pnpm test:redis-failure` zatrzymuje lokalny Redis, potwierdza lokalny limiter i odczyt
    z PostgreSQL, uruchamia Redis ponownie i wymaga powrotu obu usług do `ok`. Lokalny
    healthcheck uwierzytelnia się sekretem aplikacyjnym, a użytkownik `default` jest
    wyłączony.
11. **Wdrożone 2026-07-25:** zsynchronizowano roadmapę, plan wydania, audyt bieżącej
    architektury, kontrakt healthchecków, zmienne środowiskowe oraz instrukcje Compose,
    Kubernetes i K3s. Dodano [runbook Redis](redis-operations.md) opisujący wybór profilu,
    sekrety i ACL, interpretację `degraded`, metryki i alerty, procedurę awarii, odzyskanie
    połączenia oraz bezpieczne uruchomienie testu. Faza 10 jest zamknięta.

## Kryteria zakończenia

Faza została zakończona 2026-07-25 po spełnieniu wszystkich kryteriów:

- lokalny limiter działa i jest testowany w każdym trybie;
- Better Auth korzysta z pamięci w `disabled` oraz atomowego Redis storage w pozostałych
  trybach;
- publiczny zapis ma lokalny oraz opcjonalny rozproszony limiter;
- cache publicznej listy ma właściwy TTL, invalidację i fallback;
- mały Compose działa bez Redisa;
- profile Redis `local` i `external` działają na Compose, Kubernetes i K3s;
- awaria Redisa nie blokuje sesji, odczytu ani przyjęcia zgłoszenia;
- testy potwierdzają brak cache’owania danych prywatnych;
- dokumentacja, ENV, sekrety i obserwowalność są spójne.

Instrukcje operatorskie stanowią [runbook Redis](redis-operations.md). Strojenie progów,
timeoutów i zasobów na podstawie ruchu pozostaje zakresem Fazy 12.
