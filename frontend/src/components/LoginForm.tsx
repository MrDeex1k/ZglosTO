import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface LoginFormProps {
  onRegisterClick: () => void;
  onLoginSuccess: (userRole: 'admin' | 'service' | 'resident', email: string) => void;
}

export function LoginForm({ onRegisterClick, onLoginSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Walidacja
    if (!email.includes('@')) {
      alert('Proszę podać prawidłowy adres email');
      return;
    }
    
    if (password.length < 6) {
      alert('Hasło musi mieć co najmniej 6 znaków');
      return;
    }
    
    // Określenie roli użytkownika na podstawie emaila
    let userRole: 'admin' | 'service' | 'resident' = 'resident';
    
    if (email.toLowerCase().includes('admin')) {
      userRole = 'admin';
    } else if (email.toLowerCase().includes('sluzba') || 
               email.toLowerCase().includes('mpk') || 
               email.toLowerCase().includes('zgk') ||
               email.toLowerCase().includes('zarzad') ||
               email.toLowerCase().includes('pogotowie') ||
               email.toLowerCase().includes('mpec')) {
      userRole = 'service';
    } else if (email.toLowerCase().includes('mieszkaniec')) {
      userRole = 'resident';
    }
    
    // TODO: Implementacja logowania
    console.log('Login:', { email, password, userRole });
    
    // Symulacja pomyślnego logowania
    onLoginSuccess(userRole, email);
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
              />
            </div>

            {/* Login Button */}
            <Button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              ZALOGUJ SIĘ
            </Button>

            {/* Register Button */}
            <Button 
              type="button"
              variant="outline"
              className="w-full"
              onClick={onRegisterClick}
            >
              ZAREJESTRUJ SIĘ
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}