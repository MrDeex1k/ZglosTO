import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, XCircle } from 'lucide-react';
import { signIn, type UserRole } from '../lib/auth-client';

interface LoginFormProps {
  onRegisterClick: () => void;
  onLoginSuccess: (userRole: UserRole, email: string) => void;
}

export function LoginForm({ onRegisterClick, onLoginSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset błędu
    setError(null);
    
    // Walidacja
    if (!email.includes('@')) {
      setError('Proszę podać prawidłowy adres email');
      return;
    }
    
    if (password.length < 6) {
      setError('Hasło musi mieć co najmniej 6 znaków');
      return;
    }
    
    // Logowanie przez Better-Auth
    await signIn.email(
      {
        email,
        password,
      },
      {
        onRequest: () => {
          setIsLoading(true);
          setError(null);
        },
        onSuccess: (ctx) => {
          setIsLoading(false);
          // Pobierz uprawnienia z odpowiedzi sesji
          const user = ctx.data?.user;
          const userRole: UserRole = (user as any)?.uprawnienia || 'mieszkaniec';
          const userEmail = user?.email || email;
          
          console.log('Login success:', { userRole, userEmail, user });
          onLoginSuccess(userRole, userEmail);
        },
        onError: (ctx) => {
          setIsLoading(false);
          const errorMessage = ctx.error?.message || 'Nieprawidłowy email lub hasło';
          setError(errorMessage);
          console.error('Login error:', ctx.error);
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border shadow-lg p-8">
          <h2 className="text-center mb-8 text-gray-900">
            Zaloguj się
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="login-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="np. jan.kowalski@example.com"
                required
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="login-password">
                Hasło <span className="text-red-500">*</span>
              </Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Wprowadź hasło"
                required
                disabled={isLoading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <Alert variant="error" className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <AlertDescription className="text-sm font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {/* Login Button */}
            <Button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logowanie...
                </>
              ) : (
                'ZALOGUJ SIĘ'
              )}
            </Button>

            {/* Register Button */}
            <Button 
              type="button"
              variant="outline"
              className="w-full"
              onClick={onRegisterClick}
              disabled={isLoading}
            >
              ZAREJESTRUJ SIĘ
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}