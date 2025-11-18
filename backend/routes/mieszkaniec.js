// routes/mieszkaniec.js
const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * GET /mieszkaniec/incydenty?email=...
 * Pobiera wszystkie zgłoszenia powiązane z adresem email zgłaszającego.
 */
router.get('/incydenty', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    const q = 'SELECT * FROM incydenty WHERE mail_zglaszajacego = $1 ORDER BY data_zgloszenia';
    const { rows } = await db.query(q, [email]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /mieszkaniec/incydenty
 * Dodaj nowe zgłoszenie.
 * Body: { opis_zgloszenia, mail_zglaszajacego, typ_sluzby (opcjonalnie), zdjecie_incydentu_zglaszanego (base64 string optional) }
 * Jeśli typ_sluzby == 'Inne' -> trafia do admina (jak w specyfikacji).
 */
router.post('/incydenty', async (req, res) => {
  try {
    const { opis_zgloszenia, mail_zglaszajacego, typ_sluzby, zdjecie_incydentu_zglaszanego } = req.body;
    if (!opis_zgloszenia || !mail_zglaszajacego) {
      return res.status(400).json({ error: 'opis_zgloszenia and mail_zglaszajacego required' });
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

/**
 * GET /mieszkaniec/incydenty/zakonczone?email=...
 * Pobiera zakończone zgłoszenia (status = NAPRAWIONY) dla danego maila
 */
router.get('/incydenty/zakonczone', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    const q = `
      SELECT id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, typ_sluzby, status_incydentu, zdjecie_incydentu_rozwiazanego
      FROM incydenty
      WHERE mail_zglaszajacego = $1 AND status_incydentu = 'NAPRAWIONY'
      ORDER BY data_zgloszenia;
    `;
    const { rows } = await db.query(q, [email]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/incydenty/glowna', async (req, res) => {
  try {

    const q = `
      SELECT id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, typ_sluzby, status_incydentu, zdjecie_incydentu_rozwiazanego
      FROM incydenty
      WHERE status_incydentu = 'NAPRAWIONY'
      ORDER BY data_rozwiazania
      LIMIT 15;
    `;
    const { rows } = await db.query(q);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
