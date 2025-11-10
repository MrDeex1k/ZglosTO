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
 * POST /admin/uzytkownicy
 * Dodaje użytkownika służby / admina.
 * Body: { mail, uprawnienia }  // uprawnienia: 'mieszkaniec' | 'sluzby' | 'admin'
 * Przy pierwszym logowaniu hasło domyślne to adres e-mail (zgodnie ze specyfikacją).
 */
/*
router.post('/uzytkownicy', async (req, res) => {
  try {
    const { mail, uprawnienia } = req.body;
    if (!mail || !uprawnienia) return res.status(400).json({ error: 'mail and uprawnienia required' });

    // default password to mail (char_length constraint requires >=10 -> if mail <10 pad with '#')
    let defaultPassword = mail;
    if (defaultPassword.length < 10) defaultPassword = defaultPassword.padEnd(10, '#');
    if (defaultPassword.length > 40) defaultPassword = defaultPassword.slice(0,40);

    const q = `INSERT INTO uzytkownicy (mail, haslo, uprawnienia) VALUES ($1, $2, $3) RETURNING *;`;
    const { rows } = await db.query(q, [mail, defaultPassword, uprawnienia]);
    res.status(201).json({ success: true, uzytkownik: rows[0] });
  } catch (err) {
    console.error(err);
    // unique violation
    if (err.code === '23505') return res.status(409).json({ error: 'user already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});
*/

/**
 * PATCH /admin/uzytkownicy/:id/typ_uprawnien
 * Body: { typ_uprawnien } - przypisuje użytkownika do konkretnej służby (typ_uprawnien = typ_sluzby_enum).
 * (W starcie serwera dodaliśmy kolumnę jeśli jej nie było.)
 */
router.patch('/uzytkownicy/:id/typ_uprawnien', async (req, res) => {
  try {
    const { id } = req.params;
    const { typ_uprawnien } = req.body;
    if (!typ_uprawnien) return res.status(400).json({ error: 'typ_uprawnien required' });

    const q = `UPDATE uzytkownicy SET typ_uprawnien = $1 WHERE id_uzytkownika = $2 RETURNING *;`;
    const { rows } = await db.query(q, [typ_uprawnien, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'user not found' });
    res.json({ success: true, uzytkownik: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



module.exports = router;
