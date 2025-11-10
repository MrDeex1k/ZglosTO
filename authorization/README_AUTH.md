# Serwer autoryzacji

Ten folder zawiera serwer autoryzacji dla aplikacji ZglosTO oparty na bibliotece Better-Auth

## Struktura

```
authorization/
├── src/
│   └── auth.ts - plik konfiguracyjny dla Better Auth
├── server.ts - serwer Express z endpointami autoryzacji
├── package.json - zależności projektu
└── README_AUTH.md - dokumentacja
```

## Konfiguracja

### Zmienne środowiskowe

Utwórz plik `.env` w folderze `authorization/`:

```env
DATABASE_URL=...
BETTER_AUTH_SECRET=...
PORT=...
FRONTEND_ORIGIN=...
```

### Uruchomienie

```bash
cd authorization
bun install
bun start
```

Serwer uruchomi się na porcie **9955** (domyślnie).

## Dostępne endpointy

Wszystkie endpointy autoryzacji są dostępne pod prefiksem `/api/auth/*`.

### 1. Rejestracja użytkownika

**Endpoint:** `POST /api/auth/sign-up/email`

**Opis:** Rejestracja nowego użytkownika z email i hasłem.

**Request Body:**
```json
{
  "name": "Jan Kowalski",
  "email": "jan.kowalski@example.com",
  "password": "silneHaslo123!",
  "image": "https://example.com/avatar.jpg",
  "callbackURL": "/dashboard"
}
```

**Wymagane pola:**
- `name` (string) - Imię i nazwisko użytkownika
- `email` (string) - Adres email
- `password` (string) - Hasło (min. 8 znaków, max. 128 znaków)

**Opcjonalne pola:**
- `image` (string) - URL do zdjęcia profilowego
- `callbackURL` (string) - URL przekierowania po rejestracji

**Przykład curl:**
```bash
curl -X POST http://localhost:9955/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jan Kowalski",
    "email": "jan.kowalski@example.com",
    "password": "silneHaslo123!"
  }'
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:9955/api/auth/sign-up/email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Ważne dla cookies
  body: JSON.stringify({
    name: 'Jan Kowalski',
    email: 'jan.kowalski@example.com',
    password: 'silneHaslo123!'
  })
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Jan Kowalski",
    "email": "jan.kowalski@example.com",
    "emailVerified": false,
    "image": null,
    "createdAt": "2024-11-10T10:00:00.000Z",
    "updatedAt": "2024-11-10T10:00:00.000Z"
  },
  "session": {
    "token": "...",
    "expiresAt": "2024-12-10T10:00:00.000Z"
  }
}
```

---

### 2. Logowanie użytkownika

**Endpoint:** `POST /api/auth/sign-in/email`

**Opis:** Logowanie istniejącego użytkownika.

**Request Body:**
```json
{
  "email": "jan.kowalski@example.com",
  "password": "silneHaslo123!",
  "rememberMe": true,
  "callbackURL": "/dashboard"
}
```

**Wymagane pola:**
- `email` (string) - Adres email
- `password` (string) - Hasło

**Opcjonalne pola:**
- `rememberMe` (boolean) - Czy pamiętać sesję po zamknięciu przeglądarki (domyślnie: `true`)
- `callbackURL` (string) - URL przekierowania po logowaniu

**Przykład curl:**
```bash
curl -X POST http://localhost:9955/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "jan.kowalski@example.com",
    "password": "silneHaslo123!",
    "rememberMe": true
  }'
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:9955/api/auth/sign-in/email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    email: 'jan.kowalski@example.com',
    password: 'silneHaslo123!',
    rememberMe: true
  })
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Jan Kowalski",
    "email": "jan.kowalski@example.com",
    "emailVerified": false,
    "image": null
  },
  "session": {
    "token": "...",
    "expiresAt": "2024-12-10T10:00:00.000Z"
  }
}
```

**Response (Error):**
```json
{
  "error": {
    "message": "Invalid email or password",
    "status": 401
  }
}
```

---

### 3. Wylogowanie użytkownika

**Endpoint:** `POST /api/auth/sign-out`

**Opis:** Wylogowanie aktualnie zalogowanego użytkownika.

**Request Body:** (brak - sesja z cookies)

**Przykład curl:**
```bash
curl -X POST http://localhost:9955/api/auth/sign-out \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:9955/api/auth/sign-out', {
  method: 'POST',
  credentials: 'include'
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "success": true
}
```

---

### 4. Żądanie resetu hasła

**Endpoint:** `POST /api/auth/request-password-reset`

**Opis:** Wysyła email z linkiem do resetu hasła.

**Request Body:**
```json
{
  "email": "jan.kowalski@example.com",
  "redirectTo": "http://localhost:5173/reset-password"
}
```

**Wymagane pola:**
- `email` (string) - Adres email użytkownika

**Opcjonalne pola:**
- `redirectTo` (string) - URL do przekierowania z tokenem resetu

**Przykład curl:**
```bash
curl -X POST http://localhost:9955/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jan.kowalski@example.com",
    "redirectTo": "http://localhost:5173/reset-password"
  }'
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:9955/api/auth/request-password-reset', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'jan.kowalski@example.com',
    redirectTo: 'http://localhost:5173/reset-password'
  })
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "message": "Password reset email sent successfully.",
  "success": true
}
```

---

### 5. Reset hasła

**Endpoint:** `POST /api/auth/reset-password`

**Opis:** Resetuje hasło przy użyciu tokena z emaila.

**Request Body:**
```json
{
  "newPassword": "noweHaslo456!",
  "token": "token-z-emaila-reset"
}
```

**Wymagane pola:**
- `newPassword` (string) - Nowe hasło (min. 8 znaków, max. 128 znaków)
- `token` (string) - Token weryfikacyjny z emaila

**Przykład curl:**
```bash
curl -X POST http://localhost:9955/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "newPassword": "noweHaslo456!",
    "token": "token-z-emaila-reset"
  }'
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:9955/api/auth/reset-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    newPassword: 'noweHaslo456!',
    token: urlParams.get('token')
  })
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "message": "Password has been successfully reset.",
  "success": true
}
```

**Response (Error):**
```json
{
  "error": {
    "message": "Invalid or expired token",
    "status": 400
  }
}
```

---

### 6. Zmiana hasła

**Endpoint:** `POST /api/auth/change-password`

**Opis:** Zmienia hasło dla zalogowanego użytkownika.

**Request Body:**
```json
{
  "currentPassword": "silneHaslo123!",
  "newPassword": "noweHaslo456!",
  "revokeOtherSessions": true
}
```

**Wymagane pola:**
- `currentPassword` (string) - Obecne hasło
- `newPassword` (string) - Nowe hasło (min. 8 znaków, max. 128 znaków)

**Opcjonalne pola:**
- `revokeOtherSessions` (boolean) - Czy wylogować użytkownika z innych sesji

**Przykład curl:**
```bash
curl -X POST http://localhost:9955/api/auth/change-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "currentPassword": "silneHaslo123!",
    "newPassword": "noweHaslo456!",
    "revokeOtherSessions": true
  }'
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:9955/api/auth/change-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    currentPassword: 'silneHaslo123!',
    newPassword: 'noweHaslo456!',
    revokeOtherSessions: true
  })
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "message": "Password has been successfully updated.",
  "success": true
}
```

---

### 7. Health Check

**Endpoint:** `GET /health`

**Opis:** Sprawdza status serwera autoryzacji.

**Przykład curl:**
```bash
curl http://localhost:9955/health
```

**Response:**
```json
{
  "ok": true
}
```

## Uwagi techniczne

### Sesje i cookies

Better Auth używa HTTP-only cookies do zarządzania sesjami. Upewnij się, że:
- Używasz `credentials: 'include'` w fetch
- CORS jest poprawnie skonfigurowany (`FRONTEND_ORIGIN`)
- Dla curl używasz `-b` (read cookies) i `-c` (write cookies)

### Bezpieczeństwo

- Hasła są automatycznie hashowane przez Better Auth (bcrypt)
- Minimalna długość hasła: 8 znaków
- Maksymalna długość hasła: 128 znaków
- Sesje są przechowywane w bazie danych
- Weryfikacja email jest wyłączona (`requireEmailVerification: false`)

---

## Rozwiązywanie problemów

### Błąd połączenia z bazą danych
Sprawdź `DATABASE_URL` w `.env` i upewnij się, że PostgreSQL jest uruchomiony.

### Błędy CORS
Upewnij się, że `FRONTEND_ORIGIN` w `.env` odpowiada adresowi frontendu.

### Sesja nie jest zapisywana
Sprawdź czy używasz `credentials: 'include'` w żądaniach fetch.

---

## Dokumentacja Better Auth

Pełna dokumentacja: [https://www.better-auth.com/docs](https://www.better-auth.com/docs)