// routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * GET /admin/statystyki
 * Zwraca pełne statystyki wszystkich służb (liczba zgłoszeń wg typ_sluzby i statusu).
 */
router.get('/statystyki', async (req, res) => {
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
 * Body: { typ_sluzby } - zmienia przypisanie.
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
 * PATCH /admin/incydenty/:id/status
 * Body: { status_incydentu } - admin może ustawić dowolny status, także cofnąć.
 */
router.patch('/incydenty/:id/status', async (req, res) => {
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

/**
 * PATCH /admin/uzytkownicy/typ_uprawnien
 * Body: { typ_uprawnien, uprawnienia,email } - przypisuje użytkownika do konkretnej służby (typ_uprawnien = typ_sluzby_enum).
 * (W starcie serwera dodaliśmy kolumnę jeśli jej nie było.)
 */
router.patch('/uzytkownicy/typ_uprawnien', async (req, res) => {
  try {
    const { typ_uprawnien, uprawnienia ,email } = req.body;

    if (!typ_uprawnien) {
      return res.status(400).json({ error: 'typ_uprawnien required' });
    }

    // 1. Pobieramy ID użytkownika z tabeli BetterAuth
    const qUser = `
      SELECT id 
      FROM "user"
      WHERE email = $1;
    `;
    const userResult = await db.query(qUser, [email]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in BetterAuth' });
    }

    const betterAuthUserId = userResult.rows[0].id;

    // 2. Aktualizujemy odpowiedni rekord w tabeli uzytkownicy
    const qUpdate = `
      UPDATE uzytkownicy
      SET uprawnienia = $1, typ_uprawnien = $2
      WHERE id_uzytkownika = $3
      RETURNING *;
    `;

    const updated = await db.query(qUpdate, [
      uprawnienia,
      typ_uprawnien,
      betterAuthUserId
    ]);

    if (updated.rows.length === 0) {
      return res.status(404).json({
        error: 'User exists in BetterAuth but not in uzytkownicy'
      });
    }

    res.json({
      success: true,
      updated: updated.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




module.exports = router;
