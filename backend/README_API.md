# Serwer API aplikacji ZglosTO

Ten folder zawiera typowany serwer API dla aplikacji ZglosTO oparty na TypeScript, NestJS,
`@nestjs/platform-express` i PostgreSQL. Express jest wyłącznie wewnętrznym runtime'em
oficjalnego adaptera NestJS; ręczny bootstrap, stare routery i middleware zostały usunięte
w kroku 15 Fazy 6.

## Struktura

```
backend/
├── nest/main.ts - aktywny bootstrap serwera NestJS
├── nest/ - moduły, kontrolery, use-case'y i adaptery NestJS
├── contracts/ - wykonywalny manifest HTTP
├── config/env.ts - walidacja wymaganej konfiguracji startowej
├── lib/ - współdzielona logika rekordów, obrazów, LLM i White-Label
├── operations/ - narzędzia operacyjne Object Storage
├── storage/ - provider-neutralny adapter S3
├── database.ts - granica PostgreSQL używana przez narzędzia operacyjne
├── tsconfig.json - ścisła konfiguracja TypeScript i build do dist
├── package.json - zależności projektu
└── README_API.md - dokumentacja
```

## Konfiguracja

### Zmienne środowiskowe

Utwórz główny `.env` na podstawie `.env.example`. Backend wymaga `DATABASE_URL`, zestawów `AUTH_SERVICE_*` i `LLM_GATEWAY_*` dla mTLS/HMAC, `FRONTEND_ORIGIN`, `LLM_TIMEOUT_MS` oraz `WHITE_LABEL_CONFIG`. Fallback i katalog służb pochodzą z konfiguracji White Label. Pełny opis znajduje się w `docs/environment-variables.md`.

### Uruchomienie

```bash
pnpm install --frozen-lockfile
pnpm --filter backend-zglosto build
pnpm --filter backend-zglosto start
```

Testy jednostkowe są uruchamiane przez Vitest:

```bash
pnpm --filter backend-zglosto test
pnpm --filter backend-zglosto test:watch
```

Produkcyjny build używa `tsconfig.build.json`. Pliki `*.test.ts` i `vitest.config.ts` są
sprawdzane przez `pnpm typecheck`, ale nie są emitowane do `dist` ani kopiowane do obrazu
produkcyjnego.

Serwer uruchomi się na porcie **3000**.

Backend ładuje i waliduje `WHITE_LABEL_CONFIG` przed otwarciem portu. `GET /health/live`
sprawdza proces, a `GET /health/ready` oraz kompatybilny `GET /health` wymagają PostgreSQL i
zwracają `config.status: "valid"`, `configVersion` oraz checksum. Błędny config przerywa start,
więc instancja nie może zostać oznaczona jako ready.

Alternatywnie, użyj Docker:

```bash
docker build -f backend/Dockerfile -t zglosto-backend .
docker run -p 3000:3000 zglosto-backend
```

## Architektura API

API jest podzielone na trzy główne grupy endpointów:

- **Konfiguracja publiczna** (`/config/public`) - branding, treści, aktywne usługi, mapa i jawne feature flags
- **Mieszkańcy** (`/mieszkaniec/*`) - publiczne tworzenie i strona glowna oraz prywatna lista profilu
- **Służby** (`/sluzby/*`) - chronione endpointy wymagające autoryzacji służb
- **Administratorzy** (`/admin/*`) - chronione endpointy wymagające autoryzacji administratora

### Autoryzacja

Większość endpointów wymaga autoryzacji poprzez Better Auth. System używa sesji opartych na cookies z kontrolą dostępu opartą na rolach (`uprawnienia` w bazie danych).

## Dostępne endpointy

Wszystkie endpointy są dostępne pod adresem `http://localhost:1235/api`.

---

### Publiczna konfiguracja miasta

**Endpoint:** `GET /config/public`

Endpoint nie wymaga sesji. Zwraca jawnie wybraną publiczną część White-Label configu,
`configVersion` i checksum SHA-256. Zwraca publiczny klucz routingu awaryjnego potrzebny UI,
ale nie zwraca ustawień integracyjnych; lista `services` zawiera wyłącznie aktywne pozycje.

Odpowiedź posiada silny `ETag` wyliczony z dokładnej publicznej reprezentacji JSON oraz
`Cache-Control: public, max-age=60, must-revalidate`. Pole `checksum` identyfikuje źródłowy
YAML. Klient może przesłać
`If-None-Match`; dla aktualnej wersji serwer odpowie `304` bez body.

```bash
curl -i http://localhost:1235/api/config/public
curl -i http://localhost:1235/api/config/public \
  -H 'If-None-Match: "ETAG_Z_PIERWSZEJ_ODPOWIEDZI"'
```

---

### 1. Endpointy dla mieszkańców

#### Pobieranie zgłoszeń użytkownika

**Endpoint:** `GET /mieszkaniec/incydenty`

**Opis:** Pobiera zgłoszenia przypisane do `user.id` zalogowanego mieszkańca. Endpoint wymaga cookie Better Auth i roli `mieszkaniec`; nie obsługuje publicznego wyszukiwania po e-mailu.

**Przykład curl:**

```bash
curl "http://localhost:1235/api/mieszkaniec/incydenty" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN"
```

**Przykład fetch (JavaScript):**

```javascript
const response = await fetch('http://localhost:1235/api/mieszkaniec/incydenty', {
  credentials: 'include',
});
const data = await response.json();
console.log(data);
```

**Response (Success):**

Pola zdjęć mają wartość `null` albo obiekt `IncidentImageRef`. Przykład referencji:

```json
{
  "id": "019c0000-0000-7000-8000-000000000001",
  "kind": "report",
  "status": "pending",
  "original": {
    "objectKey": "incident-id/report/object-id/original.png",
    "mimeType": "image/png",
    "sizeBytes": 68,
    "checksumSha256": "64-znakowy-checksum-sha256"
  },
  "processed": null,
  "width": null,
  "height": null,
  "failureCode": null,
  "url": "/api/images/019c0000-0000-7000-8000-000000000001"
}
```

```json
[
  {
    "id_zgloszenia": "019ac081-4076-7ead-89e7-16c0227fcbc8",
    "opis_zgloszenia": "Testowa dziura w drodze na ulicy głównej",
    "mail_zglaszajacego": "jan.test@example.test",
    "adres_zgloszenia": "Warszawa, ul. Testowa 15",
    "zdjecie_incydentu_zglaszanego": null,
    "zdjecie_incydentu_rozwiazanego": null,
    "sprawdzenie_incydentu": true,
    "status_incydentu": "resolved",
    "typ_sluzby": "roads",
    "llm_odpowiedz": null,
    "data_godzina_zgloszenia": "26.11.2025 15:11",
    "data_godzina_rozwiazania": "26.11.2025 15:21"
  }
]
```

---

#### Pobieranie ostatnich zakończonych zgłoszeń (strona główna)

**Endpoint:** `GET /mieszkaniec/incydenty/glowna`

**Opis:** Pobiera ostatnie 15 zakończonych zgłoszeń (status = `resolved`) posortowane po dacie rozwiązania.

**Przykład curl:**

```bash
curl http://localhost:1235/api/mieszkaniec/incydenty/glowna
```

**Response (Success):**

```json
[
  {
    "id_zgloszenia": "019ac088-d5f2-7f31-8f4d-d6a0aaf684a5",
    "opis_zgloszenia": "Autobus linii 150 nie przyjechał",
    "adres_zgloszenia": "Warszawa, ul. Testowa 123",
    "typ_sluzby": "Miejskie Przedsiębiorstwo Komunikacyjne",
    "status_incydentu": "resolved",
    "zdjecie_incydentu_rozwiazanego": null,
    "data_godzina_zgloszenia": "26.11.2025 15:19",
    "data_godzina_rozwiazania": "26.11.2025 15:22"
  }
]
```

---

#### Dodanie nowego zgłoszenia

**Endpoint:** `POST /mieszkaniec/incydenty`

**Opis:** Dodaje nowe zgłoszenie anonimowo albo z opcjonalną sesją mieszkańca. E-mail jest normalizowany. Przy sesji e-mail musi odpowiadać e-mailowi użytkownika, a rekord otrzymuje `reporter_user_id`. Backend wykonuje klasyfikację; klient nie przesyła `llm_odpowiedz`.

**Request Body:**

```json
{
  "opis_zgloszenia": "Dziura w drodze na ulicy głównej",
  "mail_zglaszajacego": "user@example.com",
  "adres_zgloszenia": "ul. Główna 15, Warszawa",
  "typ_sluzby": "roads",
  "zdjecie_incydentu_zglaszanego_upload_id": "00000000-0000-4000-8000-000000000001"
}
```

**Wymagane pola:**

- `opis_zgloszenia` (string) - Opis zgłoszenia
- `mail_zglaszajacego` (string) - Adres email zgłaszającego
- `adres_zgloszenia` (string) - Adres miejsca zgłoszenia

**Opcjonalne pola:**

- `typ_sluzby` (string) - Stabilny `serviceKey` z aktywnej konfiguracji (domyślnie: `routing.fallbackServiceKey`)
- `zdjecie_incydentu_zglaszanego_upload_id` (UUID) - jednorazowy identyfikator otrzymany po
  binarnym PUT zainicjowanym przez `POST /mieszkaniec/obrazy/uploads`

**Przykład curl:**

```bash
curl -X POST http://localhost:1235/api/mieszkaniec/incydenty \
  -H "Content-Type: application/json" \
  -d '{
    "opis_zgloszenia": "Dziura w drodze na ulicy głównej",
    "mail_zglaszajacego": "user@example.com",
    "adres_zgloszenia": "ul. Główna 15, Warszawa",
    "typ_sluzby": "roads"
  }'
```

**Przykład fetch (JavaScript):**

```javascript
const response = await fetch('http://localhost:1235/api/mieszkaniec/incydenty', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    opis_zgloszenia: 'Autobus linii 150 nie przyjechał',
    mail_zglaszajacego: 'ewelina.tasak@example.test',
    adres_zgloszenia: 'Warszawa, ul. Testowa 123',
    typ_sluzby: 'public_transit',
  }),
});

const data = await response.json();
console.log(data);
```

**Response (Success):** odpowiedź zawiera zapisany rekord i strukturalny wynik klasyfikacji. Dla niedostępnego modelu zgłoszenie nadal otrzymuje kod `201`:

```json
{
  "success": true,
  "incydent": {
    "id_zgloszenia": "019ac088-d5f2-7f31-8f4d-d6a0aaf684a5",
    "opis_zgloszenia": "Autobus linii 150 nie przyjechał",
    "mail_zglaszajacego": "ewelina.tasak@example.test",
    "adres_zgloszenia": "Warszawa, ul. Testowa 123",
    "zdjecie_incydentu_zglaszanego": null,
    "zdjecie_incydentu_rozwiazanego": null,
    "reporter_user_id": null,
    "llm_classification": "unknown",
    "llm_model_available": false,
    "llm_source": "fallback",
    "llm_reason": "disabled"
  },
  "classification": {
    "classification": "unknown",
    "serviceKey": "Inne",
    "modelAvailable": false,
    "source": "fallback",
    "reason": "disabled"
  }
}
```

Migracje istniejacej bazy dla statusow, tozsamosci i LLM uruchamia:

```bash
./scripts/migrate-phase-0-contracts.sh
```

#### Wewnętrzny kontrakt klasyfikacji LLM

Backend komunikuje się z prywatnym `llm_gateway` przez mTLS i podpis HMAC:

```http
QUERY /classify-incident
Content-Type: application/json
```

Body zawiera `description`, `address` i `city`. Gateway wymaga JSON, zwraca
`Accept-Query: application/json` oraz `Cache-Control: no-store`. Metoda, ścieżka i body są
częścią podpisu workloadu; ten sam nonce nie może być użyty ponownie. Przejściowa obsługa
`POST` istnieje wyłącznie na czas wdrożenia starszych replik gatewayu i nie jest publicznym API.
Połączenia gatewayu z Docker Model Runner i runtime'em OpenAI-compatible nadal używają `POST`.

### 2. Endpointy dla służb miejskich (wymagają autoryzacji)

Wszystkie endpointy w tej grupie wymagają autoryzacji z rolą "sluzby".

#### Pobieranie zgłoszeń przypisanych do służby

**Endpoint:** `GET /sluzby/incydenty`

**Opis:** Pobiera zgłoszenia przypisane do danej służby (na podstawie typu uprawnień użytkownika).

**Przykład curl:**

```bash
curl -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
     http://localhost:1235/api/sluzby/incydenty
```

**Response (Success):**

```json
[
  {
    "id_zgloszenia": 1,
    "opis_zgloszenia": "Dziura w drodze",
    "mail_zglaszajacego": "user@example.com",
    "typ_sluzby": "DROGI",
    "status_incydentu": "reported",
    "data_zgloszenia": "2024-11-20T10:00:00.000Z"
  }
]
```

---

#### Statystyki służby

**Endpoint:** `GET /sluzby/statystyki`

**Opis:** Zwraca podstawowe statystyki (liczba zgłoszeń wg statusów) dla danej służby.

**Przykład curl:**

```bash
curl -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
     http://localhost:1235/api/sluzby/statystyki
```

**Response (Success):**

```json
[
  {
    "status_incydentu": "reported",
    "liczba": 5
  },
  {
    "status_incydentu": "in_progress",
    "liczba": 3
  },
  {
    "status_incydentu": "resolved",
    "liczba": 12
  }
]
```

---

#### Aktualizacja statusu zgłoszenia

**Endpoint:** `PATCH /sluzby/incydenty/:id/status`

**Opis:** Aktualizuje status zgłoszenia. Jeśli status zostanie zmieniony na `resolved`, automatycznie ustawia datę i godzinę rozwiązania na aktualną datę i godzinę.

**Request Body:**

```json
{
  "status_incydentu": "in_progress"
}
```

**Wymagane pola:**

- `status_incydentu` (string) - Nowy status: `reported`, `in_progress` albo `resolved`

**Przykład curl:**

```bash
curl -X PATCH http://localhost:1235/api/sluzby/incydenty/1/status \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"status_incydentu": "in_progress"}'
```

**Response (Success):**

```json
{
  "success": true,
  "incydent": {
    "id_zgloszenia": 1,
    "status_incydentu": "in_progress"
  }
}
```

---

#### Aktualizacja sprawdzenia zgłoszenia

**Endpoint:** `PATCH /sluzby/incydenty/:id/sprawdzenie`

**Opis:** Ustawia flagę sprawdzenia zgłoszenia.

**Request Body:**

```json
{
  "sprawdzenie_incydentu": true
}
```

**Przykład curl:**

```bash
curl -X PATCH http://localhost:1235/api/sluzby/incydenty/1/sprawdzenie \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"sprawdzenie_incydentu": true}'
```

---

#### Przekierowanie zgłoszenia do innej służby

**Endpoint:** `PATCH /sluzby/incydenty/:id/typ`

**Opis:** Przekierowuje zgłoszenie do innej aktywnej służby wskazanej stabilnym `serviceKey`.

**Request Body:**

```json
{
  "typ_sluzby": "roads"
}
```

**Przykład curl:**

```bash
curl -X PATCH http://localhost:1235/api/sluzby/incydenty/1/typ \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"typ_sluzby": "roads"}'
```

---

#### Dodanie zdjęcia po rozwiązaniu zgłoszenia

**Endpoint:** `POST /sluzby/incydenty/:id/zdjecie_rozwiazane`

**Opis:** Konsumuje jednorazowy upload zdjęcia rozwiązania. Presigned PUT należy wcześniej
uzyskać przez `POST /sluzby/incydenty/:id/obrazy/uploads`.

**Request Body:**

```json
{
  "uploadId": "00000000-0000-4000-8000-000000000001"
}
```

**Przykład curl:**

```bash
curl -X POST http://localhost:1235/api/sluzby/incydenty/1/zdjecie_rozwiazane \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"uploadId": "00000000-0000-4000-8000-000000000001"}'
```

#### Pobranie zdjęcia

**Endpoint:** `GET /images/:id` (przez proxy: `GET /api/images/:id`)

Zdjęcie zgłoszenia jest prywatne i wymaga sesji właściciela, administratora albo służby
przypisanej do zgłoszenia. Zdjęcie rozwiązania jest dostępne publicznie dopiero po zmianie
statusu zgłoszenia na `resolved`. Bucket pozostaje prywatny; API nie ujawnia poświadczeń S3.

---

### 3. Endpointy dla administratorów (wymagają autoryzacji)

Wszystkie endpointy w tej grupie wymagają autoryzacji z rolą "admin".

#### Pełne statystyki wszystkich służb

**Endpoint:** `GET /admin/statystyki`

**Opis:** Zwraca pełne statystyki wszystkich służb (liczba zgłoszeń wg typu służby i statusu).

**Przykład curl:**

```bash
curl -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
     http://localhost:1235/api/admin/statystyki
```

**Response (Success):**

```json
[
  {
    "typ_sluzby": "DROGI",
    "status_incydentu": "reported",
    "liczba": 5
  },
  {
    "typ_sluzby": "DROGI",
    "status_incydentu": "resolved",
    "liczba": 12
  },
  {
    "typ_sluzby": "ŚWIATŁA ULICZNE",
    "status_incydentu": "reported",
    "liczba": 3
  }
]
```

---

#### Wszystkie zgłoszenia w systemie

**Endpoint:** `GET /admin/incydenty`

**Opis:** Zwraca wszystkie zgłoszenia w systemie niezależnie od statusu czy przypisania do służby. Posortowane wg daty zgłoszenia malejąco.

**Przykład curl:**

```bash
curl -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
     http://localhost:1235/api/admin/incydenty
```

**Response (Success):**

```json
[
  {
    "id_zgloszenia": "019ac081-4076-7ead-89e7-16c0227fcbc8",
    "opis_zgloszenia": "Dziura w drodze na ulicy głównej",
    "mail_zglaszajacego": "jan.kowalski@example.test",
    "adres_zgloszenia": "Warszawa, ul. Testowa 15",
    "zdjecie_incydentu_zglaszanego": null,
    "zdjecie_incydentu_rozwiazanego": null,
    "sprawdzenie_incydentu": true,
    "status_incydentu": "resolved",
    "typ_sluzby": "roads",
    "llm_odpowiedz": "SŁUŻBY MIEJSKIE",
    "data_godzina_zgloszenia": "26.11.2025 15:11",
    "data_godzina_rozwiazania": "26.11.2025 15:21"
  }
]
```

---

#### Zmiana przypisania zgłoszenia

**Endpoint:** `PATCH /admin/incydenty/:id/typ`

**Opis:** Zmienia przypisanie zgłoszenia do innej aktywnej służby wskazanej stabilnym `serviceKey`.

**Request Body:**

```json
{
  "typ_sluzby": "roads"
}
```

**Przykład curl:**

```bash
curl -X PATCH http://localhost:1235/api/admin/incydenty/1/typ \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"typ_sluzby": "roads"}'
```

---

#### Zmiana statusu zgłoszenia (admin)

**Endpoint:** `PATCH /admin/incydenty/:id/status`

**Opis:** Administrator może ustawić dowolny dozwolony status zgłoszenia, także cofnąć status. Ustawienie `resolved` zapisuje bieżącą datę i godzinę rozwiązania. Cofnięcie na `reported` lub `in_progress` czyści datę i godzinę rozwiązania.

**Request Body:**

```json
{
  "status_incydentu": "resolved"
}
```

**Przykład curl:**

```bash
curl -X PATCH http://localhost:1235/api/admin/incydenty/1/status \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"status_incydentu": "resolved"}'
```

---

#### Aktualizacja sprawdzenia zgłoszenia (admin)

**Endpoint:** `PATCH /admin/incydenty/:id/sprawdzenie`

**Opis:** Administrator może ustawić flagę sprawdzenia zgłoszenia.

**Request Body:**

```json
{
  "sprawdzenie_incydentu": true
}
```

**Wymagane pola:**

- `sprawdzenie_incydentu` (boolean) - Czy zgłoszenie zostało sprawdzone

**Przykład curl:**

```bash
curl -X PATCH http://localhost:1235/api/admin/incydenty/1/sprawdzenie \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"sprawdzenie_incydentu": true}'
```

**Response (Success):**

```json
{
  "success": true,
  "incydent": {
    "id_zgloszenia": 1,
    "sprawdzenie_incydentu": true
  }
}
```

---

#### Przypisanie użytkownika do służby

**Endpoint:** `PATCH /admin/uzytkownicy/service-key`

**Opis:** Przypisuje użytkownika do konkretnej służby i ustawia jego uprawnienia.

**Request Body:**

```json
{
  "email": "pracownik@example.test",
  "serviceKey": "roads",
  "uprawnienia": "sluzby"
}
```

**Wymagane pola:**

- `email` (string) - Adres email użytkownika
- `uprawnienia` (string) - Rola: `mieszkaniec`, `sluzby` albo `admin`
- `serviceKey` (string lub null) - Stabilny klucz aktywnej służby; wymagany dla `sluzby`, dla pozostałych ról normalizowany do `null`

**Przykład curl:**

```bash
curl -X PATCH http://localhost:1235/api/admin/uzytkownicy/service-key \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{
    "email": "pracownik@example.test",
    "serviceKey": "roads",
    "uprawnienia": "sluzby"
  }'
```

**Response (Success):**

```json
{
  "success": true,
  "updated": {
    "id_uzytkownika": "user-id",
    "uprawnienia": "sluzby",
    "serviceKey": "roads"
  }
}
```

---

## Obsługa błędów

Wszystkie endpointy zwracają błędy w formacie JSON:

```json
{
  "error": "opis błędu"
}
```

**Najczęstsze kody błędów:**

- `400` - Nieprawidłowe dane wejściowe
- `401` - Brak autoryzacji lub niewystarczające uprawnienia
- `404` - Nie znaleziono zasobu
- `500` - Błąd serwera

## Rozwiązywanie problemów

### Błąd połączenia z bazą danych

Sprawdź `DATABASE_URL` w zmiennych środowiskowych i upewnij się, że PostgreSQL jest uruchomiony.

### Problemy z autoryzacją

- Upewnij się, że serwer autoryzacji (Better Auth) jest uruchomiony
- Sprawdź `AUTH_SERVICE_URL`, Service CA, certyfikat/klucz `backend-client` i nazwę serwera
- Weryfikuj obecność i ważność cookies sesyjnych

### Problemy z CORS

Serwer ma włączony CORS dla wszystkich origin, ale upewnij się, że frontend wysyła odpowiednie nagłówki.

### Duże pliki graficzne

Zdjęcia nie przechodzą przez JSON ani pamięć backendu jako Base64. Klient pobiera krótko
ważny presigned PUT, wysyła binarny plik bezpośrednio do prywatnego Object Storage, a
następnie przekazuje jednorazowy `uploadId`. Maksymalny rozmiar oryginału to 5 MiB.
Dokładny `Content-Length`, MIME i checksum są częścią podpisanego kontraktu uploadu.
Limit zwykłego JSON request body w NestJS i Nginx wynosi 256 KiB. Sharp zapisuje WebP quality
85 z dłuższym bokiem do 2000 px; po zatwierdzeniu wyniku oryginał jest usuwany.
