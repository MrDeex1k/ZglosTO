# Serwer autoryzacji

Ten folder zawiera serwer autoryzacji dla aplikacji ZglosTO oparty na bibliotece Better-Auth

Runtime używa wyłącznie Hono, `@hono/node-server`, Better Auth i klienta PostgreSQL. Pakiety
Express, `cors`, `@types/express` i `@types/cors` zostały usunięte po przejściu pełnego testu
integracyjnego Fazy 5. CORS realizuje middleware `hono/cors` dostarczany przez Hono.

## Struktura

```
authorization/
├── src/
│   ├── app.ts - fabryka aplikacji Hono, routing i middleware
│   ├── auth.ts - konfiguracja i hooki Better Auth
│   └── mtls-server.ts - wewnętrzny listener mTLS i polityka workloadów
├── server.ts - uruchomienie aplikacji przez adapter Hono dla Node
├── package.json - zależności projektu
└── README_AUTH.md - dokumentacja
```

## Konfiguracja

### Zmienne środowiskowe

Utwórz główny `.env` na podstawie `.env.example`. Authorization waliduje przy starcie `DATABASE_URL`, `BETTER_AUTH_SECRET` (minimum 32 znaki), `BETTER_AUTH_URL`, `FRONTEND_ORIGIN` oraz pełny zestaw `AUTHORIZATION_MTLS_*`. Jedynym portem usługi jest `9956/mTLS`. Pełny katalog znajduje się w `docs/environment-variables.md`.

`EMAIL_DELIVERY_MODE=disabled` jest obecnym trybem zwykłego środowiska. Izolowany zestaw Fazy 0 ustawia `test`, zapisuje link Better Auth w pamięciowym outboksie i testuje rzeczywiste potwierdzenie. Tryb `test` jest odrzucany, jeśli `NODE_ENV` nie ma wartości `test`; nie zastępuje produkcyjnego providera poczty.

### Uruchomienie

```bash
pnpm install --frozen-lockfile
pnpm --filter authorization-zglosto build
pnpm --filter authorization-zglosto start
```

W trybie developerskim najpierw wykonaj `pnpm certs:dev`, a następnie użyj
`pnpm dev:authorization` z katalogu głównego. Proces uruchamia wyłącznie listener mTLS na
`AUTHORIZATION_MTLS_PORT` (domyślnie **9956**); listener HTTP nie istnieje.

### Zamrożony kontrakt migracyjny

Test `tests/integration/authorization-contract.integration.ts`, uruchamiany przez
`pnpm test:integration`, zamroził kontrakt Express i obecnie przechodzi na implementacji Hono.
Testuje publiczne trasy Better Auth przez Nginx oraz bezpośredni `/api/verify-session`,
healthchecki, CORS, cookie, role i wylogowanie bez zmiany payloadów i semantyki sesji.

## Wewnętrzny mTLS

Listener `9956` wymaga TLS 1.3 oraz certyfikatu klienta podpisanego przez lokalne Service CA.
Tożsamość jest pobierana z URI SAN: backend może wywoływać `/api/verify-session` i health,
Nginx wyłącznie `/api/auth/*`, a dedykowany klient healthcheck tylko `/health*`. Zaufany
certyfikat o innej tożsamości otrzymuje `403`; brak certyfikatu, plaintext lub obca CA kończą
się odrzuceniem handshake'u. Test obejmuje również wygasły certyfikat, obcą CA serwera oraz
błędny SAN. Certyfikat workloadu nie zastępuje cookie ani walidacji sesji Better Auth.

Prywatne klucze znajdują się w ignorowanym `.certs/`, nie są częścią kontekstu builda i są
montowane do kontenerów read-only zgodnie z najmniejszymi uprawnieniami.

## Dostępne endpointy

Wszystkie endpointy autoryzacji są dostępne pod prefiksem `/api/auth/*`.

### 1. Rejestracja użytkownika

**Endpoint:** `POST /api/auth/sign-up/email`

**Opis:** Rejestracja nowego użytkownika z email i hasłem.

Po skutecznym potwierdzeniu adresu e-mail hook Better Auth przypisuje do `user.id` wcześniejsze anonimowe zgłoszenia o tym samym znormalizowanym adresie. Samo utworzenie niezweryfikowanego konta nie przejmuje historii.

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
curl -X POST http://localhost:1235/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jan Kowalski",
    "email": "jan.kowalski@example.com",
    "password": "silneHaslo123!"
  }'
```

**Przykład fetch (JavaScript):**

```javascript
const response = await fetch('http://localhost:1235/api/auth/sign-up/email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Ważne dla cookies
  body: JSON.stringify({
    name: 'Jan Kowalski',
    email: 'jan.kowalski@example.com',
    password: 'silneHaslo123!',
  }),
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
curl -X POST http://localhost:1235/api/auth/sign-in/email \
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
const response = await fetch('http://localhost:1235/api/auth/sign-in/email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    email: 'jan.kowalski@example.com',
    password: 'silneHaslo123!',
    rememberMe: true,
  }),
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
curl -X POST http://localhost:1235/api/auth/sign-out \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Przykład fetch (JavaScript):**

```javascript
const response = await fetch('http://localhost:1235/api/auth/sign-out', {
  method: 'POST',
  credentials: 'include',
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
curl -X POST http://localhost:1235/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jan.kowalski@example.com",
    "redirectTo": "http://localhost:5173/reset-password"
  }'
```

**Przykład fetch (JavaScript):**

```javascript
const response = await fetch('http://localhost:1235/api/auth/request-password-reset', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'jan.kowalski@example.com',
    redirectTo: 'http://localhost:5173/reset-password',
  }),
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
curl -X POST http://localhost:1235/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "newPassword": "noweHaslo456!",
    "token": "token-z-emaila-reset"
  }'
```

**Przykład fetch (JavaScript):**

```javascript
const response = await fetch('http://localhost:1235/api/auth/reset-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    newPassword: 'noweHaslo456!',
    token: urlParams.get('token'),
  }),
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
curl -X POST http://localhost:1235/api/auth/change-password \
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
const response = await fetch('http://localhost:1235/api/auth/change-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    currentPassword: 'silneHaslo123!',
    newPassword: 'noweHaslo456!',
    revokeOtherSessions: true,
  }),
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

### 7. Weryfikacja sesji (dla serwisów backendowych)

Endpoint jest wewnętrzny i nie jest częścią publicznego routingu Nginx. Przykład zakłada
kontrolowane opublikowanie portu mTLS na localhost.

**Endpoint:** `GET /api/verify-session`

**Opis:** Weryfikuje sesję użytkownika na podstawie przekazanych nagłówków (cookies). Używane przez backend do weryfikacji sesji.

**Headers:**

```
Cookie: better_auth.session_token=...
```

**Przykład curl:**

```bash
curl --cacert .certs/service/ca.crt \
  --cert .certs/service/backend-client.crt \
  --key .certs/service/backend-client.key \
  --resolve authorization:9956:127.0.0.1 \
  https://authorization:9956/api/verify-session \
  -H "Cookie: better_auth.session_token=YOUR_SESSION_TOKEN"
```

**Response (Success):**

```json
{
  "success": true,
  "session": {
    "id": "session-id",
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "expiresAt": "2024-12-10T10:00:00.000Z",
    "token": "..."
  },
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Jan Kowalski",
    "email": "jan.kowalski@example.com",
    "emailVerified": false,
    "image": null
  }
}
```

**Response (Error - Unauthorized):**

```json
{
  "error": "Unauthorized",
  "session": null
}
```

**Uwaga:** Ten endpoint jest przeznaczony głównie dla komunikacji między serwisami (backend → authorization). Frontend powinien używać standardowych endpointów Better Auth.

---

### 8. Health Check

**Endpointy:** `GET /health/live`, `GET /health/ready`, kompatybilny `GET /health`

**Opis:** Liveness sprawdza proces. Readiness wymaga dzialajacej bazy oraz zwalidowanego
White-Label YAML-a załadowanego przed otwarciem portu.

Endpoint jest przeznaczony dla healthchecków wewnętrznych. Przykład używa dedykowanej
tożsamości klienta.

**Przykład curl:**

```bash
curl --cacert .certs/service/ca.crt \
  --cert .certs/service/authorization-healthcheck-client.crt \
  --key .certs/service/authorization-healthcheck-client.key \
  --resolve authorization:9956:127.0.0.1 \
  https://authorization:9956/health
```

**Response:**

```json
{
  "status": "ok",
  "service": "authorization",
  "database": "up",
  "config": {
    "status": "valid",
    "configVersion": "zglosto-2026-07-18-step9",
    "checksum": "sha256"
  }
}
```

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
