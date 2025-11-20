import { Button } from './ui/button';
import { CityEmblem } from './CityEmblem';
import { cityName } from './config/city';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  onLoginClick: () => void;
  onHomeClick: () => void;
  onDashboardClick: () => void;
  onLogoutClick: () => void;
  isLoggedIn: boolean;
  userRole?: 'admin' | 'service' | 'resident';
}

export function Header({ onLoginClick, onHomeClick, onDashboardClick, onLogoutClick, isLoggedIn, userRole }: HeaderProps) {
  // Określenie tekstu przycisku na podstawie roli użytkownika
  const getDashboardButtonText = () => {
    if (!isLoggedIn) {
      return 'ZALOGUJ SIĘ';
    }
    
    switch (userRole) {
      case 'admin':
        return 'PANEL ADMINISTRATORSKI';
      case 'service':
        return 'PANEL SŁUŻBY';
      case 'resident':
        return 'PANEL MIESZKAŃCA';
      default:
        return 'PANEL UŻYTKOWNIKA';
    }
  };

  return (
    <header className="bg-white border-b">
      <div className="container mx-auto px-4 py-6">
        {/* Desktop Layout: Grid with 3 columns */}
        <div className="hidden md:grid md:grid-cols-3 items-center gap-4">
          {/* City Name - Left */}
          <div className="text-gray-700">
            Miasto {cityName}
          </div>

          {/* City Emblem - Center */}
          <div className="flex justify-center">
            <button 
              onClick={onHomeClick}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label="Strona główna"
            >
              <CityEmblem className="w-12 h-12" />
            </button>
          </div>

          {/* Login/Dashboard and Logout Buttons - Right */}
          <div className="flex items-center justify-end gap-3">
            {isLoggedIn ? (
              <>
                <Button variant="outline" onClick={onDashboardClick}>
                  {getDashboardButtonText()}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={onLogoutClick}
                  className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 hover:border-red-400"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  WYLOGUJ SIĘ
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onLoginClick}>
                ZALOGUJ SIĘ
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Layout: Flexbox column */}
        <div className="flex flex-col items-center gap-4 md:hidden">
          {/* City Emblem and Name - Top */}
          <div className="flex items-center gap-3">
            <button 
              onClick={onHomeClick}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label="Strona główna"
            >
              <CityEmblem className="w-10 h-10" />
            </button>
            <div className="text-gray-700">
              Miasto {cityName}
            </div>
          </div>

          {/* Login/Dashboard and Logout Buttons - Bottom */}
          <div className="flex items-center gap-2 w-full justify-center flex-wrap">
            {isLoggedIn ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={onDashboardClick}
                  className="text-sm px-3 py-2"
                >
                  {getDashboardButtonText()}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={onLogoutClick}
                  className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 hover:border-red-400 text-sm px-3 py-2"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  WYLOGUJ
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onLoginClick} className="text-sm px-3 py-2">
                ZALOGUJ SIĘ
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}