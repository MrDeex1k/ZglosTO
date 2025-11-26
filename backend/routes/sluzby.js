// routes/sluzby.js
const express = require('express');
const router = express.Router();
const db = require('../database');

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
    res.json(rows);
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
