# Middleware autoryzacji

Ten folder zawiera middleware do weryfikacji sesji użytkownika poprzez komunikację z serwisem autoryzacji.

## Dostępne middleware

### 1. `verifySession`

Wymaga prawidłowej sesji. Jeśli użytkownik nie jest zalogowany, zwraca błąd 401.

**Użycie:**

```javascript
const { verifySession } = require('./middleware/auth');

// Chroniony endpoint
router.get('/protected', verifySession, (req, res) => {
  // req.user zawiera informacje o użytkowniku
  // req.session zawiera informacje o sesji
  res.json({ 
    message: 'Jesteś zalogowany!',
    user: req.user 
  });
});
```

### 2. `optionalSession`

Nie wymaga sesji, ale jeśli jest dostępna, dodaje informacje o użytkowniku do `req`.

**Użycie:**

```javascript
const { optionalSession } = require('./middleware/auth');

// Endpoint dostępny dla wszystkich, ale z informacją o użytkowniku jeśli zalogowany
router.get('/public', optionalSession, (req, res) => {
  if (req.user) {
    res.json({ message: `Witaj ${req.user.name}!` });
  } else {
    res.json({ message: 'Witaj gościu!' });
  }
});
```

### 3. `requireRole(allowedRoles)`

Weryfikuje czy użytkownik ma odpowiednie uprawnienia. **Używaj zawsze po `verifySession`**.

**Użycie:**

```javascript
const { verifySession, requireRole } = require('./middleware/auth');

// Tylko dla adminów
router.get('/admin-only', verifySession, requireRole(['admin']), (req, res) => {
  res.json({ message: 'Panel administratora' });
});

// Dla adminów i służb
router.get('/staff-only', verifySession, requireRole(['admin', 'sluzby']), (req, res) => {
  res.json({ message: 'Panel pracownika' });
});
```

## Przykład kompleksowy

```javascript
const express = require('express');
const router = express.Router();
const { verifySession, optionalSession, requireRole } = require('./middleware/auth');

// Publiczny endpoint
router.get('/public', (req, res) => {
  res.json({ message: 'Dostępne dla wszystkich' });
});

// Endpoint z opcjonalną sesją
router.get('/home', optionalSession, (req, res) => {
  if (req.user) {
    res.json({ 
      message: `Witaj ${req.user.name}!`,
      isLoggedIn: true 
    });
  } else {
    res.json({ 
      message: 'Witaj gościu!',
      isLoggedIn: false 
    });
  }
});

// Chroniony endpoint - wymaga logowania
router.get('/profile', verifySession, (req, res) => {
  res.json({ 
    user: req.user,
    session: req.session 
  });
});

// Chroniony endpoint - tylko dla admina
router.get('/admin', verifySession, requireRole(['admin']), (req, res) => {
  res.json({ message: 'Panel administratora' });
});

// Chroniony endpoint - dla adminów i służb
router.post('/incidents/:id', verifySession, requireRole(['admin', 'sluzby']), (req, res) => {
  // Aktualizacja incydentu
  res.json({ success: true });
});

module.exports = router;
```

## Zmienne środowiskowe

Middleware używa następujących zmiennych środowiskowych:

- `AUTH_SERVICE_URL` - URL serwisu autoryzacji (domyślnie: `http://authorization:9955`)

Dodaj do `.env`:

```env
AUTH_SERVICE_URL=http://authorization:9955
```

## Jak to działa?

1. **Klient** wysyła żądanie do backend z cookies zawierającymi token sesji
2. **Backend middleware** przekazuje cookies do serwisu autoryzacji
3. **Serwis autoryzacji** weryfikuje sesję używając Better Auth
4. **Backend** otrzymuje informacje o użytkowniku i sesji
5. **Middleware** dodaje `req.user` i `req.session` lub zwraca błąd 401

## Struktura danych

### `req.user`

```javascript
{
  id: "550e8400-e29b-41d4-a716-446655440001",
  name: "Jan Kowalski",
  email: "jan.kowalski@example.com",
  emailVerified: false,
  image: null,
  createdAt: "2024-11-10T10:00:00.000Z",
  updatedAt: "2024-11-10T10:00:00.000Z",
  // ... inne pola z tabeli users
}
```

### `req.session`

```javascript
{
  id: "session-id",
  userId: "550e8400-e29b-41d4-a716-446655440001",
  expiresAt: "2024-12-10T10:00:00.000Z",
  token: "...",
  // ... inne pola z tabeli sessions
}
```

## Kody błędów

- **401 Unauthorized** - Brak sesji lub sesja nieprawidłowa
- **403 Forbidden** - Użytkownik zalogowany, ale nie ma odpowiednich uprawnień
- **503 Service Unavailable** - Serwis autoryzacji jest niedostępny

