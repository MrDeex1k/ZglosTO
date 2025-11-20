# Serwer API aplikacji ZglosTO

Ten folder zawiera główny serwer API dla aplikacji ZglosTO oparty na Express.js i PostgreSQL.

## Struktura

```
backend/
├── index.js - główny plik serwera Express
├── database.js - połączenie z bazą danych PostgreSQL
├── BetterAuthConn.js - middleware autoryzacji Better Auth
├── routes/
│   ├── mieszkaniec.js - endpointy dla mieszkańców
│   ├── sluzby.js - endpointy dla służb miejskich
│   └── admin.js - endpointy dla administratorów
├── package.json - zależności projektu
└── README_API.md - dokumentacja
```

## Konfiguracja

### Zmienne środowiskowe

Utwórz plik `.env` w folderze `backend/`:

```env
DATABASE_URL=...
AUTH_SERVICE_URL=...
```

### Uruchomienie

```bash
cd backend
npm install
npm start
```

Serwer uruchomi się na porcie **3000**.

Alternatywnie, użyj Docker:

```bash
docker build -t zglosto-backend .
docker run -p 3000:3000 zglosto-backend
```

## Architektura API

API jest podzielone na trzy główne grupy endpointów:

- **Mieszkańcy** (`/mieszkaniec/*`) - publiczne endpointy bez autoryzacji
- **Służby** (`/sluzby/*`) - chronione endpointy wymagające autoryzacji służb
- **Administratorzy** (`/admin/*`) - chronione endpointy wymagające autoryzacji administratora

### Autoryzacja

Większość endpointów wymaga autoryzacji poprzez Better Auth. System używa sesji opartych na cookies z kontrolą dostępu opartą na rolach (`uprawnienia` w bazie danych).

## Dostępne endpointy

Wszystkie endpointy są dostępne pod adresem `http://localhost:3000`.

---

### 1. Endpointy dla mieszkańców (publiczne)

#### Pobieranie zgłoszeń użytkownika

**Endpoint:** `GET /mieszkaniec/incydenty`

**Opis:** Pobiera wszystkie zgłoszenia powiązane z adresem email zgłaszającego.

**Query Parameters:**
- `email` (string, wymagane) - Adres email użytkownika

**Przykład curl:**
```bash
curl "http://localhost:3000/mieszkaniec/incydenty?email=user@example.com"
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:3000/mieszkaniec/incydenty?email=user@example.com');
const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
[
  {
    "id_zgloszenia": 1,
    "opis_zgloszenia": "Dziura w drodze",
    "mail_zglaszajacego": "user@example.com",
    "typ_sluzby": "DROGI",
    "status_incydentu": "ZGŁOSZONY",
    "data_zgloszenia": "2024-11-20T10:00:00.000Z",
    "zdjecie_incydentu_zglaszanego": null
  }
]
```

---

#### Dodanie nowego zgłoszenia

**Endpoint:** `POST /mieszkaniec/incydenty`

**Opis:** Dodaje nowe zgłoszenie. Jeśli nie podano typu służby, domyślnie zostaje ustawione jako "Inne" (przekazane do administratora).

**Request Body:**
```json
{
  "opis_zgloszenia": "Dziura w drodze na ulicy głównej",
  "mail_zglaszajacego": "user@example.com",
  "typ_sluzby": "DROGI",
  "zdjecie_incydentu_zglaszanego": "base64-encoded-image-string"
}
```

**Wymagane pola:**
- `opis_zgloszenia` (string) - Opis zgłoszenia
- `mail_zglaszajacego` (string) - Adres email zgłaszającego

**Opcjonalne pola:**
- `typ_sluzby` (string) - Typ służby (domyślnie: "Inne")
- `zdjecie_incydentu_zglaszanego` (string) - Zdjęcie w formacie base64

**Przykład curl:**
```bash
curl -X POST http://localhost:3000/mieszkaniec/incydenty \
  -H "Content-Type: application/json" \
  -d '{
    "opis_zgloszenia": "Dziura w drodze na ulicy głównej",
    "mail_zglaszajacego": "user@example.com",
    "typ_sluzby": "DROGI"
  }'
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:3000/mieszkaniec/incydenty', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    opis_zgloszenia: 'Dziura w drodze na ulicy głównej',
    mail_zglaszajacego: 'user@example.com',
    typ_sluzby: 'DROGI'
  })
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "success": true,
  "incydent": {
    "id_zgloszenia": 1,
    "opis_zgloszenia": "Dziura w drodze na ulicy głównej",
    "mail_zglaszajacego": "user@example.com",
    "typ_sluzby": "DROGI",
    "status_incydentu": "ZGŁOSZONY",
    "data_zgloszenia": "2024-11-20T10:00:00.000Z"
  }
}
```

---

#### Pobieranie zakończonych zgłoszeń użytkownika

**Endpoint:** `GET /mieszkaniec/incydenty/zakonczone`

**Opis:** Pobiera zakończone zgłoszenia (status = NAPRAWIONY) dla danego adresu email.

**Query Parameters:**
- `email` (string, wymagane) - Adres email użytkownika

**Przykład curl:**
```bash
curl "http://localhost:3000/mieszkaniec/incydenty/zakonczone?email=user@example.com"
```

**Response (Success):**
```json
[
  {
    "id_zgloszenia": 1,
    "opis_zgloszenia": "Dziura w drodze",
    "mail_zglaszajacego": "user@example.com",
    "typ_sluzby": "DROGI",
    "status_incydentu": "NAPRAWIONY",
    "zdjecie_incydentu_rozwiazanego": "base64-encoded-image-data"
  }
]
```

---

#### Pobieranie ostatnich zakończonych zgłoszeń (strona główna)

**Endpoint:** `GET /mieszkaniec/incydenty/glowna`

**Opis:** Pobiera ostatnie 15 zakończonych zgłoszeń (status = NAPRAWIONY) posortowane po dacie rozwiązania.

**Przykład curl:**
```bash
curl http://localhost:3000/mieszkaniec/incydenty/glowna
```

---

### 2. Endpointy dla służb miejskich (wymagają autoryzacji)

Wszystkie endpointy w tej grupie wymagają autoryzacji z rolą "sluzby".

#### Pobieranie zgłoszeń przypisanych do służby

**Endpoint:** `GET /sluzby/incydenty`

**Opis:** Pobiera zgłoszenia przypisane do danej służby (na podstawie typu uprawnień użytkownika).

**Przykład curl:**
```bash
curl -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
     http://localhost:3000/sluzby/incydenty
```

**Response (Success):**
```json
[
  {
    "id_zgloszenia": 1,
    "opis_zgloszenia": "Dziura w drodze",
    "mail_zglaszajacego": "user@example.com",
    "typ_sluzby": "DROGI",
    "status_incydentu": "ZGŁOSZONY",
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
     http://localhost:3000/sluzby/statystyki
```

**Response (Success):**
```json
[
  {
    "status_incydentu": "ZGŁOSZONY",
    "liczba": 5
  },
  {
    "status_incydentu": "W TRAKCIE NAPRAWY",
    "liczba": 3
  },
  {
    "status_incydentu": "NAPRAWIONY",
    "liczba": 12
  }
]
```

---

#### Aktualizacja statusu zgłoszenia

**Endpoint:** `PATCH /sluzby/incydenty/:id/status`

**Opis:** Aktualizuje status zgłoszenia.

**Request Body:**
```json
{
  "status_incydentu": "W TRAKCIE NAPRAWY"
}
```

**Wymagane pola:**
- `status_incydentu` (string) - Nowy status: "ZGŁOSZONY", "W TRAKCIE NAPRAWY", "NAPRAWIONY"

**Przykład curl:**
```bash
curl -X PATCH http://localhost:3000/sluzby/incydenty/1/status \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"status_incydentu": "W TRAKCIE NAPRAWY"}'
```

**Response (Success):**
```json
{
  "success": true,
  "incydent": {
    "id_zgloszenia": 1,
    "status_incydentu": "W TRAKCIE NAPRAWY"
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
curl -X PATCH http://localhost:3000/sluzby/incydenty/1/sprawdzenie \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"sprawdzenie_incydentu": true}'
```

---

#### Przekierowanie zgłoszenia do innej służby

**Endpoint:** `PATCH /sluzby/incydenty/:id/typ`

**Opis:** Przekierowuje zgłoszenie do innej służby.

**Request Body:**
```json
{
  "typ_sluzby": "ŚWIATŁA ULICZNE"
}
```

**Przykład curl:**
```bash
curl -X PATCH http://localhost:3000/sluzby/incydenty/1/typ \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"typ_sluzby": "ŚWIATŁA ULICZNE"}'
```

---

#### Dodanie zdjęcia po rozwiązaniu zgłoszenia

**Endpoint:** `POST /sluzby/incydenty/:id/zdjecie_rozwiazane`

**Opis:** Dodaje zdjęcie po rozwiązaniu zgłoszenia.

**Request Body:**
```json
{
  "zdjecie_incydentu_rozwiazanego": "base64-encoded-image-string"
}
```

**Przykład curl:**
```bash
curl -X POST http://localhost:3000/sluzby/incydenty/1/zdjecie_rozwiazane \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"zdjecie_incydentu_rozwiazanego": "iVBORw0KGgoAAAANSUhEUgAA..."}'
```

---

### 3. Endpointy dla administratorów (wymagają autoryzacji)

Wszystkie endpointy w tej grupie wymagają autoryzacji z rolą "admin".

#### Pełne statystyki wszystkich służb

**Endpoint:** `GET /admin/statystyki`

**Opis:** Zwraca pełne statystyki wszystkich służb (liczba zgłoszeń wg typu służby i statusu).

**Przykład curl:**
```bash
curl -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
     http://localhost:3000/admin/statystyki
```

**Response (Success):**
```json
[
  {
    "typ_sluzby": "DROGI",
    "status_incydentu": "ZGŁOSZONY",
    "liczba": 5
  },
  {
    "typ_sluzby": "DROGI",
    "status_incydentu": "NAPRAWIONY",
    "liczba": 12
  },
  {
    "typ_sluzby": "ŚWIATŁA ULICZNE",
    "status_incydentu": "ZGŁOSZONY",
    "liczba": 3
  }
]
```

---

#### Zmiana przypisania zgłoszenia

**Endpoint:** `PATCH /admin/incydenty/:id/typ`

**Opis:** Zmienia przypisanie zgłoszenia do innej służby.

**Request Body:**
```json
{
  "typ_sluzby": "DROGI"
}
```

**Przykład curl:**
```bash
curl -X PATCH http://localhost:3000/admin/incydenty/1/typ \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"typ_sluzby": "DROGI"}'
```

---

#### Zmiana statusu zgłoszenia (admin)

**Endpoint:** `PATCH /admin/incydenty/:id/status`

**Opis:** Administrator może ustawić dowolny status zgłoszenia, także cofnąć status.

**Request Body:**
```json
{
  "status_incydentu": "NAPRAWIONY"
}
```

**Przykład curl:**
```bash
curl -X PATCH http://localhost:3000/admin/incydenty/1/status \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"status_incydentu": "NAPRAWIONY"}'
```

---

#### Przypisanie użytkownika do służby

**Endpoint:** `PATCH /admin/uzytkownicy/typ_uprawnien`

**Opis:** Przypisuje użytkownika do konkretnej służby i ustawia jego uprawnienia.

**Request Body:**
```json
{
  "email": "pracownik@sluzby.pl",
  "typ_uprawnien": "DROGI",
  "uprawnienia": "sluzby"
}
```

**Wymagane pola:**
- `email` (string) - Adres email użytkownika
- `typ_uprawnien` (string) - Typ służby do przypisania

**Opcjonalne pola:**
- `uprawnienia` (string) - Poziom uprawnień (domyślnie: "sluzby")

**Przykład curl:**
```bash
curl -X PATCH http://localhost:3000/admin/uzytkownicy/typ_uprawnien \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{
    "email": "pracownik@sluzby.pl",
    "typ_uprawnien": "DROGI",
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
    "typ_uprawnien": "DROGI"
  }
}
```

---

### 4. Dodatkowe endpointy

#### Chroniony endpoint testowy

**Endpoint:** `GET /api/protected`

**Opis:** Testowy chroniony endpoint dla służb (głównie do testowania autoryzacji).

**Przykład curl:**
```bash
curl -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
     http://localhost:3000/api/protected
```

**Response (Success):**
```json
{
  "message": "To jest odpowiedź z API"
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
- Sprawdź poprawność `AUTH_SERVICE_URL`
- Weryfikuj obecność i ważność cookies sesyjnych

### Problemy z CORS
Serwer ma włączony CORS dla wszystkich origin, ale upewnij się, że frontend wysyła odpowiednie nagłówki.

### Duże pliki graficzne
Endpointy obsługują zdjęcia w formacie base64. Limit rozmiaru request body to 10MB (konfigurowalne w `body-parser`).
