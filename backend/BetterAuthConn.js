function requireAuth(...allowedRoles)
{
    return async function(req, res, next) {
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
            req.user = user;
            req.session = session;
            if(allowedRoles.includes(user.uprawnienia)) next();
            return res.status(401).json({ error: 'Niewystarczające uprawnienia' });
        } catch (err) {
            console.error('Błąd autoryzacji:', err);
            res.status(500).json({ error: 'Błąd wewnętrzny autoryzacji' });
        }
    }
}

module.exports = { requireAuth };