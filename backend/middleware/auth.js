// middleware/auth.js

/**
 * Middleware do weryfikacji sesji użytkownika poprzez serwis autoryzacji.
 * 
 * Wysyła nagłówki żądania (w tym cookies) do serwisu autoryzacji,
 * który weryfikuje sesję przy użyciu Better Auth.
 * 
 * Jeśli sesja jest prawidłowa, dodaje do req:
 * - req.user - informacje o użytkowniku
 * - req.session - informacje o sesji
 * 
 * Jeśli sesja jest nieprawidłowa, zwraca 401 Unauthorized.
 */
const verifySession = async (req, res, next) => {
  try {
    // URL serwisu autoryzacji (w Docker network)
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://authorization:9955';
    
    // Przekaż wszystkie nagłówki z oryginalnego żądania
    // Szczególnie ważne są cookies z sesją
    const response = await fetch(`${authServiceUrl}/api/verify-session`, {
      method: 'GET',
      headers: {
        cookie: req.headers.cookie || '',
        // Możesz przekazać inne nagłówki jeśli potrzebne
      },
    });

    const data = await response.json();

    // Jeśli sesja nieprawidłowa
    if (response.status === 401 || !data.success) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Musisz być zalogowany aby uzyskać dostęp do tego zasobu'
      });
    }

    // Jeśli błąd serwera autoryzacji
    if (response.status >= 500) {
      console.error('Auth service error:', data);
      return res.status(503).json({ 
        error: 'Service unavailable',
        message: 'Serwis autoryzacji jest tymczasowo niedostępny'
      });
    }

    // Dodaj dane użytkownika i sesji do requesta
    req.user = data.user;
    req.session = data.session;
    
    // Kontynuuj do następnego middleware/route handlera
    next();
  } catch (error) {
    console.error('Session verification error:', error.message);
    
    // Jeśli nie można połączyć się z serwisem autoryzacji
    return res.status(503).json({ 
      error: 'Service unavailable',
      message: 'Nie można zweryfikować sesji'
    });
  }
};

/**
 * Middleware opcjonalny - nie wymaga sesji, ale jeśli jest dostępna, 
 * dodaje informacje o użytkowniku do req.
 * 
 * Przydatne dla endpointów, które mogą działać zarówno dla zalogowanych
 * jak i niezalogowanych użytkowników.
 */
const optionalSession = async (req, res, next) => {
  try {
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://authorization:9955';
    
    const response = await fetch(`${authServiceUrl}/api/verify-session`, {
      method: 'GET',
      headers: {
        cookie: req.headers.cookie || '',
      },
    });

    const data = await response.json();

    // Jeśli sesja jest prawidłowa, dodaj dane użytkownika
    if (response.status === 200 && data.success) {
      req.user = data.user;
      req.session = data.session;
    }
    
    // Zawsze kontynuuj, nawet jeśli nie ma sesji
    next();
  } catch (error) {
    console.error('Optional session check error:', error.message);
    // Kontynuuj bez sesji
    next();
  }
};

/**
 * Middleware do weryfikacji uprawnień użytkownika.
 * 
 * Używaj po verifySession.
 * 
 * @param {string[]} allowedRoles - Tablica dozwolonych uprawnień (np. ['admin', 'sluzby'])
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // Sprawdź czy użytkownik jest zalogowany
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Musisz być zalogowany'
      });
    }

    // Sprawdź czy użytkownik ma odpowiednie uprawnienia
    // Zakładam, że w bazie mamy pole 'role' lub podobne
    // TODO: Dostosuj to do swojej struktury danych
    const userRole = req.user.role || req.user.uprawnienia;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Nie masz uprawnień do tego zasobu'
      });
    }

    next();
  };
};

module.exports = {
  verifySession,
  optionalSession,
  requireRole,
};

