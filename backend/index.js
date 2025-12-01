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
const {requireAuth} = require("./BetterAuthConn")

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;

app.use(cookieParser());

db.testConnection()

// Ścieżka do zbudowanego folderu Reacta
const buildPath = path.join(__dirname, '../frontend/dist');

// Serwowanie statycznych plików Reacta
app.use(express.static(buildPath));

app.use(cors({
  origin: true, // Zezwala na wszystkie origins w development
  credentials: true // Zezwala na wysyłanie cookies i innych credentials
}));
app.use(bodyParser.json({ limit: '10mb' })); // zdjęcia base64 mogą być duże

app.use("/mieszkaniec", mieszkaniecRouter)
app.use("/sluzby", requireAuth("sluzby"), sluzbyRouter)
app.use("/admin",requireAuth("admin"), adminRouter)

app.get('/api/protected', requireAuth("sluzby"), (req, res) => {
  console.log(req.user)
  //res.json({ message: 'Jesteś uwierzytelniony', user: session.user });
  res.json({ message: 'To jest odpowiedź z API' });
});

// Obsługa wszystkich innych żądań przez zwrócenie index.html
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(3000, () => {
    console.log('Serwer działa na porcie 3000');
});