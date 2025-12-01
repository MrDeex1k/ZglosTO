import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { signUp, type UserRole } from '../lib/auth-client';

interface RegisterFormProps {
  onLoginClick: () => void;
  onRegisterSuccess?: (userRole: UserRole, email: string) => void;
}

export function RegisterForm({ onLoginClick, onRegisterSuccess }: RegisterFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Walidacja imienia
    if (!name.trim()) {
      toast.error('Proszę podać imię i nazwisko');
      return;
    }
    
    // Walidacja email
    if (!email.includes('@')) {
      toast.error('Proszę podać prawidłowy adres email');
      return;
    }
    
    // Walidacja hasła
    if (password.length < 8) {
      toast.error('Hasło musi mieć co najmniej 8 znaków');
      return;
    }
    
    // Walidacja zgód
    if (!acceptPrivacy) {
      toast.error('Musisz zaakceptować politykę prywatności');
      return;
    }
    
    if (!acceptTerms) {
      toast.error('Musisz zaakceptować regulamin');
      return;
    }
    
    // Rejestracja przez Better-Auth
    await signUp.email(
      {
        email,
        password,
        name,
      },
      {
        onRequest: () => {
          setIsLoading(true);
        },
        onSuccess: (ctx) => {
          setIsLoading(false);
          
          // Pokaż toast sukcesu
          toast.success('HURRA! Udało Ci się zarejestrować!', {
            description: 'Za chwilę zostaniesz przekierowany do panelu.',
            duration: 3000,
          });
          
          // Pobierz uprawnienia z odpowiedzi i przekieruj do dashboard
          const user = ctx.data?.user;
          const userRole: UserRole = (user as any)?.uprawnienia || 'mieszkaniec';
          const userEmail = user?.email || email;
          
          // Przekierowanie do dashboard po 2 sekundach
          setTimeout(() => {
            if (onRegisterSuccess) {
              onRegisterSuccess(userRole, userEmail);
            } else {
              onLoginClick();
            }
          }, 2000);
        },
        onError: (ctx) => {
          setIsLoading(false);
          let errorMessage = 'Coś poszło nie tak. Spróbuj ponownie.';
          
          // Obsługa znanych błędów
          if (ctx.error?.message?.includes('already exists') || 
              ctx.error?.message?.includes('User already exists')) {
            errorMessage = 'Użytkownik z tym adresem email już istnieje.';
          } else if (ctx.error?.code === 'INVALID_EMAIL') {
            errorMessage = 'Podany adres email jest nieprawidłowy.';
          } else if (ctx.error?.code === 'WEAK_PASSWORD') {
            errorMessage = 'Hasło jest za słabe. Użyj silniejszego hasła.';
          } else if (ctx.error?.message) {
            errorMessage = ctx.error.message;
          }
          
          toast.error('Opsss...', {
            description: errorMessage,
            duration: 5000,
          });
          console.error('Register error:', ctx.error);
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border shadow-lg p-8">
          <h2 className="text-center mb-8 text-gray-900">
            Zarejestruj się
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="register-name">
                Imię i nazwisko <span className="text-red-500">*</span>
              </Label>
              <Input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Jan Kowalski"
                required
                disabled={isLoading}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="register-email">
                Adres e-mail <span className="text-red-500">*</span>
              </Label>
              <Input
                id="register-email"
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
              <Label htmlFor="register-password">
                Hasło <span className="text-red-500">*</span>
              </Label>
              <Input
                id="register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 znaków"
                required
                disabled={isLoading}
              />
            </div>

            {/* Privacy Policy Checkbox */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="privacy-policy"
                checked={acceptPrivacy}
                onCheckedChange={(checked) => setAcceptPrivacy(checked === true)}
                disabled={isLoading}
              />
              <Label 
                htmlFor="privacy-policy" 
                className="cursor-pointer leading-tight"
              >
                Akceptuję politykę prywatności <span className="text-red-500">*</span>
              </Label>
            </div>

            {/* Terms and Conditions Checkbox */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={acceptTerms}
                onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                disabled={isLoading}
              />
              <Label 
                htmlFor="terms" 
                className="cursor-pointer leading-tight"
              >
                Akceptuję regulamin <span className="text-red-500">*</span>
              </Label>
            </div>

            {/* Register Button */}
            <Button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejestracja...
                </>
              ) : (
                'ZAREJESTRUJ SIĘ'
              )}
            </Button>

            {/* Login Link */}
            <div className="text-center">
              <p className="text-gray-600 text-sm">
                Masz już konto?{' '}
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                  disabled={isLoading}
                >
                  Zaloguj się
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}