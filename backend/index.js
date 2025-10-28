const express = require('express');
const path = require('path');
const app = express();

// Ścieżka do zbudowanego folderu Reacta (po `bun run build`)
const buildPath = path.join(__dirname, '../frontend/dist');

// Serwowanie statycznych plików Reacta
app.use(express.static(buildPath));

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