const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./database')
const mieszkaniecRouter = require('./routes/mieszkaniec')
const sluzbyRouter = require("./routes/sluzby")
const adminRouter = require("./routes/admin")

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? "http://auth-service:3000";

app.use(cookieParser());

async function requireAuth(req, res, next) {
  try {
    // Ensure cookie-parser is applied; if not, req.cookies would be undefined
    if (!req.cookies) {
      return res.status(500).json({ error: 'Cookie parser middleware not configured' });
    }

    // Extract the session token from cookies (note: plural 'cookies')
    const sessionToken = req.cookies['better-auth.session_token'];
    if (!sessionToken) {
      return res.status(401).json({ error: 'Brak sesji' });
    }

    // Forward the cookie to the BetterAuth service for verification
    const resp = await fetch(`${process.env.AUTH_SERVICE_URL}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        'Cookie': `better-auth.session_token=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      // If your BetterAuth setup requires POST instead: 
      // method: 'POST',
      // body: JSON.stringify({ token: sessionToken })
    });

    if (!resp.ok) {
      return res.status(401).json({ error: 'Nieprawidłowa sesja' });
    }

    const data = await resp.json();
    const session = data?.session || data;
    const user = data?.user || data;
    if (!session || !user) {
      return res.status(401).json({ error: 'Sesja wygasła lub niepoprawna' });
    }
    //console.log(session)
    //console.log(user)
    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    console.error('Błąd autoryzacji:', err);
    res.status(500).json({ error: 'Błąd wewnętrzny autoryzacji' });
  }
}

db.testConnection()

// Ścieżka do zbudowanego folderu Reacta (po `bun run build`)
const buildPath = path.join(__dirname, '../frontend/dist');

// Serwowanie statycznych plików Reacta
app.use(express.static(buildPath));

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // zdjęcia base64 mogą być duże

app.use("/mieszkaniec", mieszkaniecRouter)
app.use("/sluzby", sluzbyRouter)
app.use("/admin", adminRouter)

app.get('/api/protected', requireAuth, (req, res) => {
  console.log(req.user)
  //res.json({ message: 'Jesteś uwierzytelniony', user: session.user });
  res.json({ message: 'To jest odpowiedź z API' });
});

// API endpointy
app.get('/api/some-endpoint', (req, res) => {
    res.json({ message: 'To jest odpowiedź z API' });
});

// Obsługa wszystkich innych żądań przez zwrócenie index.html
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(3000, () => {
    console.log('Serwer działa na porcie 3000');
});