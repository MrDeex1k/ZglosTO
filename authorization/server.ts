import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './src/auth';
import { logApiRequest } from './src/logger';

const app = express();
const PORT = Number(process.env.PORT) || 9955;

// Middleware do logowania wszystkich żądań API
app.use((req, res, next) => {
  // Przechwytujemy oryginalną metodę end() aby zalogować odpowiedź
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: any, encoding?: any, cb?: any) {
    // Logujemy żądanie po zakończeniu odpowiedzi
    const success = res.statusCode >= 200 && res.statusCode < 400;
    logApiRequest(
      req.method,
      req.path,
      res.statusCode,
      success,
      req.path.startsWith('/api/auth') ? 'Auth endpoint' : undefined
    ).catch(() => {
      // Błąd logowania jest ignorowany - nie logujemy do konsoli
    });
    
    // Wywołujemy oryginalną metodę end()
    if (typeof chunk === 'function') {
      return originalEnd(chunk);
    } else if (typeof encoding === 'function') {
      return originalEnd(chunk, encoding);
    } else {
      return originalEnd(chunk, encoding, cb);
    }
  };
  
  next();
});

app.all('/api/auth/*splat', toNodeHandler(auth));

// JSON middleware for non-auth routes
app.use(express.json());

// CORS - dostosuj FRONTEND_ORIGIN w .env
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// Example health endpoint
app.get('/health', async (_req, res) => {
  await logApiRequest('GET', '/health', 200, true, 'Health check');
  res.json({ ok: true });
});

// Session verification endpoint for backend services
app.get('/api/verify-session', async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session) {
      await logApiRequest('GET', '/api/verify-session', 401, false, 'Brak sesji');
      return res.status(401).json({ error: 'Unauthorized', session: null });
    }

    await logApiRequest('GET', '/api/verify-session', 200, true, `User: ${session.user?.email || session.user?.id}`);
    return res.json({ 
      success: true, 
      session: session.session,
      user: session.user 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await logApiRequest('GET', '/api/verify-session', 500, false, `Błąd: ${errorMessage}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, async () => {
  await logApiRequest('SERVER', 'START', 200, true, `Serwer autoryzacji uruchomiony na porcie ${PORT}`);
  console.log(`Serwer autoryzacji działa na porcie ${PORT}`);
});
