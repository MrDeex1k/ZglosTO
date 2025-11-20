import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, XCircle } from 'lucide-react';

interface RegisterFormProps {
  onLoginClick: () => void;
}

export function RegisterForm({ onLoginClick }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset message
    setMessage(null);
    
    // Walidacja email
    if (!email.includes('@')) {
      alert('Proszę podać prawidłowy adres email');
      return;
    }
    
    // Walidacja hasła
    if (password.length < 6) {
      alert('Hasło musi mieć co najmniej 6 znaków');
      return;
    }
    
    // Walidacja zgód
    if (!acceptPrivacy) {
      alert('Musisz zaakceptować politykę prywatności');
      return;
    }
    
    if (!acceptTerms) {
      alert('Musisz zaakceptować regulamin');
      return;
    }
    
    // Zmockowana logika rejestracji
    if (email.toLowerCase().includes('sukces')) {
      // Sukces
      setMessage({
        type: 'success',
        text: 'HURRA! Udało Ci się zarejestrować.'
      });
      
      // Przekierowanie do logowania po 3 sekundach
      setTimeout(() => {
        onLoginClick();
      }, 3000);
    } else if (email.toLowerCase().includes('błąd') || email.toLowerCase().includes('blad')) {
      // Błąd
      setMessage({
        type: 'error',
        text: 'Opsss... Wystąpił błąd. Spróbuj ponownie za chwilę.'
      });
    } else {
      // Domyślnie sukces
      setMessage({
        type: 'success',
        text: 'HURRA! Udało Ci się zarejestrować.'
      });
      
      // Przekierowanie do logowania po 3 sekundach
      setTimeout(() => {
        onLoginClick();
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border shadow-lg p-8">
          <h2 className="text-center mb-8 text-gray-900">
            Zarejestruj się
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
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
                placeholder="Minimum 6 znaków"
                required
              />
            </div>

            {/* Privacy Policy Checkbox */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="privacy-policy"
                checked={acceptPrivacy}
                onCheckedChange={(checked) => setAcceptPrivacy(checked === true)}
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
            >
              ZAREJESTRUJ SIĘ
            </Button>

            {/* Login Link */}
            <div className="text-center">
              <p className="text-gray-600 text-sm">
                Masz już konto?{' '}
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Zaloguj się
                </button>
              </p>
            </div>
          </form>
          
          {/* Message */}
          {message && (
            <Alert
              className="mt-4"
              variant={message.type}
            >
              {message.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {message.type === 'error' && <XCircle className="h-4 w-4" />}
              <AlertDescription>
                {message.text}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}