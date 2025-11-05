const express = require('express');
const path = require('path');
const app = express();

// API endpointy
app.get('/api-auth/endpoint', (req, res) => {
    res.json({ message: 'To jest odpowiedź z API autoryzacji' });
});

app.listen(9955, () => {
    console.log('Serwer działa na porcie 9955');
});