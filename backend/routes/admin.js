// routes/admin.js
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
 * GET /admin/incydenty
 * Zwraca wszystkie zgłoszenia w systemie niezależnie od statusu czy przypisania do służby. Posortowane wg daty zgłoszenia malejąco.
 */
router.get('/incydenty', async (req, res) => {
  try {
    const q = `
      SELECT id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, zdjecie_incydentu_zglaszanego, zdjecie_incydentu_rozwiazanego, sprawdzenie_incydentu, status_incydentu, typ_sluzby, LLM_odpowiedz,
             TO_CHAR(data_zgloszenia, 'DD.MM.YYYY') || ' ' || TO_CHAR(godzina_zgloszenia, 'HH24:MI') as data_godzina_zgloszenia,
             TO_CHAR(data_rozwiazania, 'DD.MM.YYYY') || ' ' || TO_CHAR(godzina_rozwiazania, 'HH24:MI') as data_godzina_rozwiazania
      FROM incydenty
      ORDER BY data_zgloszenia DESC, godzina_zgloszenia DESC;
    `;
    const { rows } = await db.query(q, []);

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
 * PATCH /admin/incydenty/:id/sprawdzenie
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

    const q = `
      UPDATE incydenty
      SET status_incydentu = $1::status_incydentu_enum,
          data_rozwiazania = CASE
            WHEN $1 = 'NAPRAWIONY' THEN CURRENT_DATE
            WHEN $1 IN ('ZGŁOSZONY', 'W TRAKCIE NAPRAWY') THEN NULL
            ELSE data_rozwiazania
          END,
          godzina_rozwiazania = CASE
            WHEN $1 = 'NAPRAWIONY' THEN CURRENT_TIME
            WHEN $1 IN ('ZGŁOSZONY', 'W TRAKCIE NAPRAWY') THEN NULL
            ELSE godzina_rozwiazania
          END
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
