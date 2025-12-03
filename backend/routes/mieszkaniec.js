// routes/mieszkaniec.js
const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * Helper function to convert BYTEA buffer to base64 data URL
 */
function bufferToDataUrl(buffer) {
  if (!buffer) return null;
  // Detect image type from magic bytes
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let mimeType = 'image/jpeg'; // default
  
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    mimeType = 'image/png';
  } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    mimeType = 'image/gif';
  } else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    mimeType = 'image/jpeg';
  } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    mimeType = 'image/webp';
  }
  
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

/**
 * GET /mieszkaniec/incydenty?email=...
 * Pobiera wszystkie zgłoszenia powiązane z adresem email zgłaszającego.
 */
router.get('/incydenty', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    const q = `
      SELECT id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, zdjecie_incydentu_zglaszanego, zdjecie_incydentu_rozwiazanego, sprawdzenie_incydentu, status_incydentu, typ_sluzby, LLM_odpowiedz,
             TO_CHAR(data_zgloszenia, 'DD.MM.YYYY') || ' ' || TO_CHAR(godzina_zgloszenia, 'HH24:MI') as data_godzina_zgloszenia,
             TO_CHAR(data_rozwiazania, 'DD.MM.YYYY') || ' ' || TO_CHAR(godzina_rozwiazania, 'HH24:MI') as data_godzina_rozwiazania
      FROM incydenty
      WHERE mail_zglaszajacego = $1
      ORDER BY data_zgloszenia;
    `;
    const { rows } = await db.query(q, [email]);
    
    // Convert BYTEA fields to base64 data URLs
    const transformedRows = rows.map(row => ({
      ...row,
      zdjecie_incydentu_zglaszanego: bufferToDataUrl(row.zdjecie_incydentu_zglaszanego),
      zdjecie_incydentu_rozwiazanego: bufferToDataUrl(row.zdjecie_incydentu_rozwiazanego),
    }));
    
    res.json(transformedRows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/incydenty/glowna', async (req, res) => {
  try {

    const q = `
      SELECT id_zgloszenia, opis_zgloszenia, adres_zgloszenia, typ_sluzby, status_incydentu, zdjecie_incydentu_rozwiazanego,
             TO_CHAR(data_zgloszenia, 'DD.MM.YYYY') || ' ' || TO_CHAR(godzina_zgloszenia, 'HH24:MI') as data_godzina_zgloszenia,
             TO_CHAR(data_rozwiazania, 'DD.MM.YYYY') || ' ' || TO_CHAR(godzina_rozwiazania, 'HH24:MI') as data_godzina_rozwiazania
      FROM incydenty
      WHERE status_incydentu = 'NAPRAWIONY'
      ORDER BY data_rozwiazania DESC, godzina_rozwiazania DESC
      LIMIT 15;
    `;
    const { rows } = await db.query(q);
    
    // Convert BYTEA fields to base64 data URLs
    const transformedRows = rows.map(row => ({
      ...row,
      zdjecie_incydentu_rozwiazanego: bufferToDataUrl(row.zdjecie_incydentu_rozwiazanego),
    }));
    
    res.json(transformedRows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /mieszkaniec/incydenty
 * Dodaj nowe zgłoszenie.
 * Body: { opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, typ_sluzby (opcjonalnie), zdjecie_incydentu_zglaszanego (base64 string optional) }
 * Jeśli typ_sluzby == 'Inne' -> trafia do admina (jak w specyfikacji).
 */
router.post('/incydenty', async (req, res) => {
  try {
    const { opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, typ_sluzby, zdjecie_incydentu_zglaszanego, llm_odpowiedz } = req.body;
    if (!opis_zgloszenia || !mail_zglaszajacego || !adres_zgloszenia) {
      return res.status(400).json({ error: 'opis_zgloszenia, mail_zglaszajacego and adres_zgloszenia required' });
    }

    const imageBytes = zdjecie_incydentu_zglaszanego
      ? Buffer.from(zdjecie_incydentu_zglaszanego, 'base64')
      : null;

    const q = `
      INSERT INTO incydenty (opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, zdjecie_incydentu_zglaszanego, typ_sluzby, llm_odpowiedz)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const { rows } = await db.query(q, [opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, imageBytes, typ_sluzby || 'Inne', llm_odpowiedz || null]);
    res.status(201).json({ success: true, incydent: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;