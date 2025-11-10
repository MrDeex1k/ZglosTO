import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './src/auth';

const app = express();
const PORT = Number(process.env.PORT) || 9955;

// Mount Better Auth handler as a catch-all for auth routes
app.all('/api/auth/*splat', toNodeHandler(auth));

// JSON middleware for non-auth routes
app.use(express.json());

// CORS - dostosuj FRONTEND_ORIGIN w .env jeśli potrzeba
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// Example health endpoint
app.get('/health', (_req, res) => res.json({ ok: true }));

// Session verification endpoint for backend services
app.get('/api/verify-session', async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized', session: null });
    }

    return res.json({ 
      success: true, 
      session: session.session,
      user: session.user 
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Serwer autoryzacji działa na porcie ${PORT}`);
});
