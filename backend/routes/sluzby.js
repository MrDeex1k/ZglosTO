// routes/sluzby.js
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
 * GET /sluzby/incydenty
 * Pobiera zgłoszenia przypisane do danej służby
 */
router.get('/incydenty', async (req, res) => {
  try {
    console.log(req.user)
    //const { typ } = req.params;
    const typ = req.user.typ_uprawnien;
    const q = `SELECT * FROM incydenty WHERE typ_sluzby = $1 ORDER BY status_incydentu, data_zgloszenia`;
    const { rows } = await db.query(q, [typ]);
    
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

/**
 * GET /sluzby/statystyki
 * Zwraca podstawowe statystyki (liczba zgłoszeń wg statusów) dla danej służby.
 */
router.get('/statystyki', async (req, res) => {
  try {
    const typ = req.user.typ_uprawnien;
    //const { typ } = req.params;
    const q = `
      SELECT status_incydentu, count(*)::int AS liczba
      FROM incydenty
      WHERE typ_sluzby = $1
      GROUP BY status_incydentu;
    `;
    const { rows } = await db.query(q, [typ]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /sluzby/incydenty/:id/status
 * Body: { status_incydentu }  // one of: 'ZGŁOSZONY', 'W TRAKCIE NAPRAWY', 'NAPRAWIONY'
 * Aktualizuje status zgłoszenia.
 */
router.patch('/incydenty/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status_incydentu } = req.body;
    if (!status_incydentu) return res.status(400).json({ error: 'status_incydentu required' });

    const q = `
      UPDATE incydenty
      SET status_incydentu = $1,
          data_rozwiazania = CASE WHEN $1 = 'NAPRAWIONY' THEN CURRENT_DATE ELSE data_rozwiazania END,
          godzina_rozwiazania = CASE WHEN $1 = 'NAPRAWIONY' THEN CURRENT_TIME ELSE godzina_rozwiazania END
      WHERE id_zgloszenia = $2 RETURNING *;
    `;
    const { rows } = await db.query(q, [status_incydentu, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'incydent not found' });
    res.json({ success: true, incydent: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /sluzby/incydenty/:id/sprawdzenie
 * Body: { sprawdzenie_incydentu: boolean }
 */
router.patch('/incydenty/:id/sprawdzenie', async (req, res) => {
  try {
    const { id } = req.params;
    const { sprawdzenie_incydentu } = req.body;
    if (typeof sprawdzenie_incydentu !== 'boolean') return res.status(400).json({ error: 'sprawdzenie_incydentu boolean required' });

    const q = `UPDATE incydenty SET sprawdzenie_incydentu = $1 WHERE id_zgloszenia = $2 RETURNING *;`;
    const { rows } = await db.query(q, [sprawdzenie_incydentu, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'incydent not found' });
    res.json({ success: true, incydent: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /sluzby/incydenty/:id/typ
 * Body: { typ_sluzby }  // przekierowanie zgłoszenia do innej służby
 */
router.patch('/incydenty/:id/typ', async (req, res) => {
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

/**
 * POST /sluzby/incydenty/:id/zdjecie_rozwiazane
 * Body: { zdjecie_incydentu_rozwiazanego (base64 string) }
 * Dopuszczamy dodanie zdjęcia po rozwiązaniu.
 */
router.post('/incydenty/:id/zdjecie_rozwiazane', async (req, res) => {
  try {
    const { id } = req.params;
    const { zdjecie_incydentu_rozwiazanego } = req.body;
    if (!zdjecie_incydentu_rozwiazanego) return res.status(400).json({ error: 'zdjecie_incydentu_rozwiazanego required (base64)' });

    const imageBytes = Buffer.from(zdjecie_incydentu_rozwiazanego, 'base64');
    const q = `
      UPDATE incydenty
      SET zdjecie_incydentu_rozwiazanego = $1
      WHERE id_zgloszenia = $2
      RETURNING *;
    `;
    const { rows } = await db.query(q, [imageBytes, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'incydent not found' });
    res.json({ success: true, incydent: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
