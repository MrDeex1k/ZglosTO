import express from 'express';

const app = express();
const PORT = 9955;

// API endpointy
app.get('/api-auth/endpoint', (req: any, res: any) => {
  res.json({ message: 'To jest odpowiedź z API autoryzacji' });
});

app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
