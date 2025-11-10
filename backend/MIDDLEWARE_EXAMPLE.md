# Przykład użycia middleware autoryzacji

Ten plik pokazuje jak zastosować middleware autoryzacji do istniejących endpointów.

## Przykład: Zabezpieczenie routera mieszkaniec

Poniżej pokazano jak dodać middleware do routera `mieszkaniec.js`:

```javascript
// routes/mieszkaniec.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifySession } = require('../middleware/auth');

/**
 * GET /mieszkaniec/incydenty?email=...
 * Pobiera wszystkie zgłoszenia powiązane z adresem email zgłaszającego.
 * 
 * CHRONIONE - wymaga zalogowania
 */
router.get('/incydenty', verifySession, async (req, res) => {
  try {
    // Teraz mamy dostęp do req.user z middleware
    const userEmail = req.user.email;
    
    // Pobierz zgłoszenia tylko dla zalogowanego użytkownika
    const q = 'SELECT * FROM incydenty WHERE mail_zglaszajacego = $1 ORDER BY id_zgloszenia';
    const { rows } = await db.query(q, [userEmail]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /mieszkaniec/incydenty
 * Dodaj nowe zgłoszenie.
 * 
 * CHRONIONE - wymaga zalogowania
 */
router.post('/incydenty', verifySession, async (req, res) => {
  try {
    const { opis_zgloszenia, typ_sluzby, zdjecie_incydentu_zglaszanego } = req.body;
    
    // Email zgłaszającego pobieramy z zalogowanego użytkownika
    const mail_zglaszajacego = req.user.email;
    
    if (!opis_zgloszenia) {
      return res.status(400).json({ error: 'opis_zgloszenia required' });
    }

    const imageBytes = zdjecie_incydentu_zglaszanego
      ? Buffer.from(zdjecie_incydentu_zglaszanego, 'base64')
      : null;

    const q = `
      INSERT INTO incydenty (opis_zgloszenia, mail_zglaszajacego, zdjecie_incydentu_zglaszanego, typ_sluzby)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const { rows } = await db.query(q, [opis_zgloszenia, mail_zglaszajacego, imageBytes, typ_sluzby || 'Inne']);
    res.status(201).json({ success: true, incydent: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

## Przykład: Zabezpieczenie routera admin

```javascript
// routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifySession, requireRole } = require('../middleware/auth');

/**
 * GET /admin/statystyki
 * CHRONIONE - tylko dla adminów
 */
router.get('/statystyki', verifySession, requireRole(['admin']), async (req, res) => {
  try {
    const q = `
      SELECT typ_sluzby, status_incydentu, count(*)::int AS liczba
      FROM incydenty
      GROUP BY typ_sluzby, status_incydentu
      ORDER BY typ_sluzby;
    `;
    const { rows } = await db.query(q, []);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/incydenty/:id/typ
 * CHRONIONE - tylko dla adminów
 */
router.patch('/incydenty/:id/typ', verifySession, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { typ_sluzby } = req.body;
    if (!typ_sluzby) return res.status(400).json({ error: 'typ_sluzby required' });

    const q = `UPDATE incydenty SET typ_sluzby = $1 WHERE id_zgloszenia = $2 RETURNING *;`;
    const { rows } = await db.query(q, [typ_sluzby, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'incydent not found' });
    res.json({ success: true, incydent: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

## Przykład: Zabezpieczenie routera służby

```javascript
// routes/sluzby.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifySession, requireRole } = require('../middleware/auth');

/**
 * GET /sluzby/:typ/incydenty
 * CHRONIONE - dla adminów i służb
 */
router.get('/:typ/incydenty', verifySession, requireRole(['admin', 'sluzby']), async (req, res) => {
  try {
    const { typ } = req.params;
    
    // TODO: Sprawdź czy użytkownik służby ma dostęp tylko do swojego typu
    // if (req.user.role === 'sluzby' && req.user.typ_uprawnien !== typ) {
    //   return res.status(403).json({ error: 'Forbidden' });
    // }
    
    const q = `SELECT * FROM incydenty WHERE typ_sluzby = $1 ORDER BY status_incydentu, id_zgloszenia`;
    const { rows } = await db.query(q, [typ]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /sluzby/incydenty/:id/status
 * CHRONIONE - dla adminów i służb
 */
router.patch('/incydenty/:id/status', verifySession, requireRole(['admin', 'sluzby']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status_incydentu } = req.body;
    if (!status_incydentu) return res.status(400).json({ error: 'status_incydentu required' });

    const q = `UPDATE incydenty SET status_incydentu = $1 WHERE id_zgloszenia = $2 RETURNING *;`;
    const { rows } = await db.query(q, [status_incydentu, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'incydent not found' });
    res.json({ success: true, incydent: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

## Zmienne środowiskowe

Dodaj do `.env` w głównym folderze projektu:

```env
# Serwis autoryzacji (używane przez backend)
AUTH_SERVICE_URL=http://authorization:9955
```

## Testowanie

### 1. Zaloguj się i pobierz ciasteczko sesji

```bash
curl -X POST http://localhost:9955/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "jan.kowalski@example.com",
    "password": "haslo123"
  }'
```

### 2. Użyj ciasteczka do dostępu do chronionego endpointu

```bash
# Pobierz incydenty (chronione)
curl http://localhost:3000/mieszkaniec/incydenty \
  -b cookies.txt

# Dodaj incydent (chronione)
curl -X POST http://localhost:3000/mieszkaniec/incydenty \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "opis_zgloszenia": "Dziura w drodze",
    "typ_sluzby": "Drogi"
  }'
```

### 3. Spróbuj dostępu bez sesji (powinno zwrócić 401)

```bash
curl http://localhost:3000/mieszkaniec/incydenty
# Powinno zwrócić: {"error":"Unauthorized","message":"Musisz być zalogowany aby uzyskać dostęp do tego zasobu"}
```

## Korzyści z tego rozwiązania

✅ **Bezpieczeństwo** - Wszystkie endpointy są chronione weryfikacją sesji  
✅ **Separacja** - Logika autoryzacji jest oddzielona od logiki biznesowej  
✅ **Łatwość użycia** - Prosty middleware do dodania do dowolnego endpointu  
✅ **Mikrousługi** - Backend i Authorization są oddzielnymi serwisami  
✅ **Better Auth** - Wykorzystanie nowoczesnej biblioteki autoryzacyjnej  
✅ **Dostęp do danych użytkownika** - `req.user` i `req.session` dostępne w każdym handlerze

