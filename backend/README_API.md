# API Backend - ZglosTO

Dokumentacja backendu dla aplikacji ZglosTO.

## Autoryzacja i Middleware

Backend używa middleware do weryfikacji sesji użytkownika poprzez komunikację z serwisem autoryzacji (Better Auth).

### Dostępne middleware:

1. **`verifySession`** - Wymaga zalogowania (zwraca 401 jeśli brak sesji)
2. **`optionalSession`** - Opcjonalne logowanie (dodaje `req.user` jeśli zalogowany)
3. **`requireRole(['role1', 'role2'])`** - Wymaga konkretnych uprawnień

### Szybki start:

```javascript
const { verifySession, requireRole } = require('./middleware/auth');

// Chroniony endpoint
router.get('/protected', verifySession, (req, res) => {
  res.json({ user: req.user });
});

// Tylko dla adminów
router.get('/admin', verifySession, requireRole(['admin']), (req, res) => {
  res.json({ message: 'Panel admina' });
});
```

📖 **Pełna dokumentacja**: Zobacz `middleware/README.md` i `MIDDLEWARE_EXAMPLE.md`

### Zmienne środowiskowe:

Dodaj do `.env`:

```env
AUTH_SERVICE_URL=http://authorization:9955
```

## Struktura projektu

```
backend/
├── index.js              # Główny serwer Express
├── database.js           # Połączenie z PostgreSQL
├── middleware/
│   ├── auth.js          # Middleware autoryzacji
│   └── README.md        # Dokumentacja middleware
├── routes/
│   ├── mieszkaniec.js   # Endpointy dla mieszkańców
│   ├── sluzby.js        # Endpointy dla służb
│   └── admin.js         # Endpointy dla adminów
└── MIDDLEWARE_EXAMPLE.md # Przykłady użycia
```

## Endpointy API

### Mieszkaniec (`/mieszkaniec`)

**⚠️ UWAGA**: Te endpointy powinny być chronione przez `verifySession`

- `GET /mieszkaniec/incydenty` - Pobierz zgłoszenia użytkownika
- `POST /mieszkaniec/incydenty` - Dodaj nowe zgłoszenie
- `GET /mieszkaniec/incydenty/zakonczone` - Pobierz zakończone zgłoszenia

### Służby (`/sluzby`)

**⚠️ UWAGA**: Te endpointy powinny być chronione przez `verifySession` + `requireRole(['admin', 'sluzby'])`

- `GET /sluzby/:typ/incydenty` - Pobierz zgłoszenia dla służby
- `GET /sluzby/:typ/statystyki` - Statystyki dla służby
- `PATCH /sluzby/incydenty/:id/status` - Aktualizuj status
- `PATCH /sluzby/incydenty/:id/sprawdzenie` - Oznacz jako sprawdzone
- `PATCH /sluzby/incydenty/:id/typ` - Przekieruj do innej służby
- `POST /sluzby/incydenty/:id/zdjecie_rozwiazane` - Dodaj zdjęcie po naprawie

### Admin (`/admin`)

**⚠️ UWAGA**: Te endpointy powinny być chronione przez `verifySession` + `requireRole(['admin'])`

- `GET /admin/statystyki` - Globalne statystyki
- `PATCH /admin/incydenty/:id/typ` - Zmień typ służby
- `PATCH /admin/incydenty/:id/status` - Zmień status
- `PATCH /admin/uzytkownicy/:id/typ_uprawnien` - Przypisz służbę

## Komunikacja z serwisem autoryzacji

Backend komunikuje się z serwisem autoryzacji (`http://authorization:9955`) w celu weryfikacji sesji:

```
┌─────────┐        ┌─────────┐        ┌──────────────┐
│ Klient  │───────▶│ Backend │───────▶│ Authorization│
│         │◀───────│         │◀───────│   (Better    │
│ (cookie)│        │(przekaż)│        │    Auth)     │
└─────────┘        └─────────┘        └──────────────┘
                        │                     │
                        └─────────────────────┘
                         Weryfikacja sesji
```

### Jak to działa?

1. **Klient** wysyła żądanie do backend z cookies (token sesji Better Auth)
2. **Backend middleware** przekazuje cookies do authorization service
3. **Authorization service** weryfikuje sesję używając Better Auth
4. **Backend** otrzymuje `user` i `session` lub błąd 401
5. **Middleware** dodaje `req.user` i `req.session` do requesta

## Testowanie

### 1. Zaloguj się i zapisz cookies:

```bash
curl -X POST http://localhost:9955/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "haslo123"
  }'
```

### 2. Użyj chronionego endpointu:

```bash
# Powinno zwrócić dane użytkownika
curl http://localhost:3000/mieszkaniec/incydenty -b cookies.txt
```

### 3. Spróbuj bez cookies (powinno zwrócić 401):

```bash
curl http://localhost:3000/mieszkaniec/incydenty
# {"error":"Unauthorized","message":"Musisz być zalogowany..."}
```

## Instalacja i uruchomienie

### Lokalnie:

```bash
cd backend
npm install
npm start
```

### Z Docker:

```bash
docker-compose up backend
```

Server będzie dostępny na `http://localhost:3000`

## Struktura odpowiedzi

### Sukces:

```json
{
  "success": true,
  "data": { ... }
}
```

### Błąd autoryzacji:

```json
{
  "error": "Unauthorized",
  "message": "Musisz być zalogowany aby uzyskać dostęp do tego zasobu"
}
```

### Błąd uprawnień:

```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do tego zasobu"
}
```

### Błąd serwisu:

```json
{
  "error": "Service unavailable",
  "message": "Serwis autoryzacji jest tymczasowo niedostępny"
}
```

## Dostęp do danych użytkownika w handlerach

Po przejściu przez middleware `verifySession`, masz dostęp do:

```javascript
router.get('/example', verifySession, (req, res) => {
  console.log(req.user);    // Dane użytkownika
  console.log(req.session); // Dane sesji
  
  // req.user:
  // {
  //   id: "...",
  //   email: "jan@example.com",
  //   name: "Jan Kowalski",
  //   ...
  // }
});
```

## Dalsze kroki

1. **Dodaj middleware do routerów** - Zobacz `MIDDLEWARE_EXAMPLE.md`
2. **Dostosuj weryfikację ról** - Edytuj `requireRole` w `middleware/auth.js`
3. **Testuj endpointy** - Użyj curl lub Postman z cookies

## Linki

- [Dokumentacja middleware](middleware/README.md)
- [Przykłady użycia](MIDDLEWARE_EXAMPLE.md)
- [Dokumentacja Authorization Service](../authorization/README_AUTH.md)
