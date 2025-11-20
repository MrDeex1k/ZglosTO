/**
 * ZglosTO - Aplikacja do zgłaszania incydentów miejskich
 *
 * Dostępne widoki aplikacji (routing):
 * - 'home': Główny widok aplikacji z formularzem zgłoszeń incydentów
 * - 'login': Widok logowania dla użytkowników
 * - 'register': Widok rejestracji nowych użytkowników
 * - 'dashboard': Panel użytkownika (routing wewnętrzny w zależności od roli):
 *   - 'admin': Panel Administratorski - zarządzanie wszystkimi zgłoszeniami
 *   - 'service': Panel Służby - zarządzanie zgłoszeniami przypisanymi do konkretnej służby
 *   - 'resident': Panel Mieszkańca - przegląd własnych zgłoszeń
 */

import { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { IncidentForm } from './components/IncidentForm';
import { IncidentCard } from './components/IncidentCard';
import { IncidentDetailsDialog } from './components/IncidentDetailsDialog';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { ServiceIncidentDialog } from './components/ServiceIncidentDialog';
import { AdminPanel } from './components/AdminPanel';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Toaster } from './components/ui/sonner';

import './App.css'

export interface Incident {
  id: string;
  service: string;
  description: string;
  address: string;
  email: string;
  imageUrl?: string;
  resolvedImageUrl?: string;
  status: 'resolved' | 'pending' | 'in-progress';
  checked: boolean;
  adminStatus: 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY';
  createdAt: string;
  resolvedAt?: string;
}

// Przykładowe dane rozwiązanych zgłoszeń
const mockResolvedIncidents: Incident[] = [
  {
    id: '1',
    service: 'Zarząd Dróg',
    description: 'Dziura w jezdni na ul. Głównej',
    address: 'ul. Główna 123, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-15T10:00:00Z',
    resolvedAt: '2025-11-16T14:30:00Z',
  },
  {
    id: '2',
    service: 'MPK',
    description: 'Uszkodzona wiata przystankowa',
    address: 'ul. Kościuszki 45, Warszawa',
    email: 'anna.nowak@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-14T08:15:00Z',
    resolvedAt: '2025-11-15T16:20:00Z',
  },
  {
    id: '3',
    service: 'Zakład Gospodarki Komunalnej',
    description: 'Przepełnione śmietniki w parku',
    address: 'Park Centralny, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-13T12:30:00Z',
    resolvedAt: '2025-11-14T09:45:00Z',
  },
  {
    id: '4',
    service: 'Pogotowie Kanalizacyjne',
    description: 'Zalana studzienka kanalizacyjna',
    address: 'ul. Polna 78, Warszawa',
    email: 'piotr.wisniewski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-12T15:45:00Z',
    resolvedAt: '2025-11-13T11:00:00Z',
  },
  {
    id: '5',
    service: 'Zarząd Dróg',
    description: 'Uszkodzone oznakowanie poziome',
    address: 'ul. Marszałkowska 100, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-11T09:20:00Z',
    resolvedAt: '2025-11-12T13:15:00Z',
  },
  {
    id: '6',
    service: 'Miejskie Przedsiębiorstwo Komunikacyjne',
    description: 'Niedziałający automat biletowy na przystanku',
    address: 'pl. Konstytucji 3, Warszawa',
    email: 'anna.nowak@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-10T07:30:00Z',
    resolvedAt: '2025-11-11T15:00:00Z',
  },
  {
    id: '7',
    service: 'Zakład Gospodarki Komunalnej',
    description: 'Nieskoszona trawa na terenie osiedla',
    address: 'os. Przyjaźni 12, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'pending',
    checked: false,
    adminStatus: 'ZGŁOSZONY',
    createdAt: '2025-11-09T14:20:00Z',
  },
  {
    id: '8',
    service: 'Zarząd Dróg',
    description: 'Uszkodzone oświetlenie uliczne',
    address: 'ul. Wolności 56, Warszawa',
    email: 'maria.kaminska@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-08T18:45:00Z',
    resolvedAt: '2025-11-09T12:00:00Z',
  },
  {
    id: '9',
    service: 'Pogotowie Kanalizacyjne',
    description: 'Nieprzyjemny zapach z kanalizacji',
    address: 'ul. Słoneczna 89, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'in-progress',
    checked: true,
    adminStatus: 'W TRAKCIE NAPRAWY',
    createdAt: '2025-11-07T11:15:00Z',
  },
  {
    id: '10',
    service: 'MPK',
    description: 'Zniszczona tablica informacyjna na przystanku',
    address: 'ul. Piękna 22, Warszawa',
    email: 'anna.nowak@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-06T09:00:00Z',
    resolvedAt: '2025-11-07T14:20:00Z',
  },
  {
    id: '11',
    service: 'Zarząd Dróg',
    description: 'Zapadnięty chodnik przy przejściu dla pieszych',
    address: 'ul. Nowa 34, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'pending',
    checked: false,
    adminStatus: 'ZGŁOSZONY',
    createdAt: '2025-11-05T13:30:00Z',
  },
  {
    id: '12',
    service: 'Zakład Gospodarki Komunalnej',
    description: 'Potrzeba dodatkowego kosza na śmieci',
    address: 'Skwer im. Kopernika, Warszawa',
    email: 'tomasz.lewandowski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-04T10:45:00Z',
    resolvedAt: '2025-11-05T15:30:00Z',
  },
  {
    id: '13',
    service: 'Miejskie Przedsiębiorstwo Komunikacyjne',
    description: 'Brak rozkładu jazdy na przystanku',
    address: 'ul. Zielona 67, Warszawa',
    email: 'anna.nowak@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-03T08:20:00Z',
    resolvedAt: '2025-11-04T12:40:00Z',
  },
  {
    id: '14',
    service: 'Pogotowie Kanalizacyjne',
    description: 'Zatkany odpływ deszczowy',
    address: 'ul. Sportowa 15, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-02T16:00:00Z',
    resolvedAt: '2025-11-03T10:15:00Z',
  },
  {
    id: '15',
    service: 'Zarząd Dróg',
    description: 'Niedziałające światła sygnalizacji świetlnej',
    address: 'Skrzyżowanie ul. Targowej i Wileńskiej, Warszawa',
    email: 'piotr.wisniewski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-11-01T07:50:00Z',
    resolvedAt: '2025-11-02T09:30:00Z',
  },
  {
    id: '16',
    service: 'Zakład Gospodarki Komunalnej',
    description: 'Dzikie wysypisko śmieci w lesie',
    address: 'Las Bielański, Warszawa',
    email: 'maria.kaminska@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-10-31T12:00:00Z',
    resolvedAt: '2025-11-01T14:00:00Z',
  },
  {
    id: '17',
    service: 'MPK',
    description: 'Brudna wiata przystankowa',
    address: 'al. Jerozolimskie 120, Warszawa',
    email: 'anna.nowak@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-10-30T09:30:00Z',
    resolvedAt: '2025-10-31T11:45:00Z',
  },
  {
    id: '18',
    service: 'Zarząd Dróg',
    description: 'Wyboista droga gruntowa',
    address: 'ul. Leśna 8, Warszawa',
    email: 'jan.kowalski@example.com',
    status: 'resolved',
    checked: true,
    adminStatus: 'NAPRAWIONY',
    createdAt: '2025-10-29T14:15:00Z',
    resolvedAt: '2025-10-30T16:00:00Z',
  },
  // Nieprzypisane zgłoszenia (Inne)
  {
    id: '19',
    service: 'Inne',
    description: 'Dziwny hałas dochodzący z kanalizacji, nie wiem kto powinien się tym zająć',
    address: 'ul. Marszałkowska 45, Warszawa',
    email: 'anna.nowak@example.com',
    status: 'pending',
    checked: false,
    adminStatus: 'ZGŁOSZONY',
    createdAt: '2025-11-16T09:30:00Z',
  },
  {
    id: '20',
    service: 'Inne',
    description: 'Podejrzane uszkodzenie na skrzyżowaniu - może to być problem z drogą lub sygnalizacją',
    address: 'Al. Jerozolimskie 123, Warszawa',
    email: 'piotr.kowalski@example.com',
    status: 'pending',
    checked: false,
    adminStatus: 'ZGŁOSZONY',
    createdAt: '2025-11-15T14:20:00Z',
  },
  {
    id: '21',
    service: 'Inne',
    description: 'Coś dzieje się z ciepłem w budynku, ale nie jestem pewien czy to MPEC',
    address: 'ul. Złota 67, Warszawa',
    email: 'katarzyna.lewandowska@example.com',
    status: 'pending',
    checked: false,
    adminStatus: 'ZGŁOSZONY',
    createdAt: '2025-11-14T11:45:00Z',
  },
  {
    id: '22',
    service: 'Inne',
    description: 'Problem z infrastrukturą przy przystanku - może MPK, może ZGK?',
    address: 'ul. Puławska 234, Warszawa',
    email: 'jan.wisniewski@example.com',
    status: 'pending',
    checked: false,
    adminStatus: 'ZGŁOSZONY',
    createdAt: '2025-11-13T08:00:00Z',
  },
];

export default function App() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>(mockResolvedIncidents);
  const [visibleIncidents, setVisibleIncidents] = useState(5);
  const [visibleServiceIncidents, setVisibleServiceIncidents] = useState(10);
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'register' | 'dashboard'>('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'service' | 'resident'>('resident');
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'ALL' | 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY'>('ALL');

  const handleSubmitIncident = (incident: Omit<Incident, 'id' | 'status' | 'createdAt'>) => {
    const newIncident: Incident = {
      ...incident,
      id: Date.now().toString(),
      status: 'pending',
      checked: false,
      adminStatus: 'ZGŁOSZONY',
      createdAt: new Date().toISOString(),
    };
    
    setIncidents([newIncident, ...incidents]);
    setIsDialogOpen(false);
  };

  const showMoreIncidents = () => {
    setVisibleIncidents(15); // Pokazuje wszystkie 15 zgłoszeń (5 początkowych + 10 dodatkowych)
  };

  const handleLoginSuccess = (role: 'admin' | 'service' | 'resident', email: string) => {
    setIsLoggedIn(true);
    setUserRole(role);
    setUserEmail(email);
    setCurrentView('dashboard');
  };

  const handleHomeClick = () => {
    setCurrentView('home');
  };

  const handleDashboardClick = () => {
    setCurrentView('dashboard');
  };

  const handleLoginClick = () => {
    setCurrentView('login');
  };

  const handleLogoutClick = () => {
    setIsLoggedIn(false);
    setUserRole('resident');
    setUserEmail('');
    setCurrentView('home');
  };

  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setIsDetailsDialogOpen(true);
  };

  const handleUpdateIncident = (incidentId: string, checked: boolean, adminStatus: 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY', resolvedImageBase64?: string) => {
    setIncidents(prevIncidents =>
      prevIncidents.map(inc =>
        inc.id === incidentId
          ? { ...inc, checked, adminStatus, resolvedImageUrl: resolvedImageBase64 || inc.resolvedImageUrl }
          : inc
      )
    );
  };
  
  const handleUpdateIncidentService = (incidentId: string, newService: string) => {
    setIncidents(prevIncidents =>
      prevIncidents.map(inc =>
        inc.id === incidentId
          ? { ...inc, service: newService }
          : inc
      )
    );
  };

  const getServiceFromEmail = (email: string): string => {
    const lowerEmail = email.toLowerCase();
    if (lowerEmail.includes('mpk')) {
      return 'Miejskie Przedsiębiorstwo Komunikacyjne';
    } else if (lowerEmail.includes('zgk')) {
      return 'Zakład Gospodarki Komunalnej';
    } else if (lowerEmail.includes('pogotowie')) {
      return 'Pogotowie Kanalizacyjne';
    } else if (lowerEmail.includes('zarzad')) {
      return 'Zarząd Dróg';
    } else if (lowerEmail.includes('mpec')) {
      return 'Miejskie Przedsiębiorstwo Energetyki Cieplnej';
    }
    return '';
  };

  const resolvedIncidents = incidents.filter(inc => inc.status === 'resolved');

  // Dashboard view
  if (currentView === 'dashboard') {
    // Panel mieszkańca - wyświetlanie zgłoszeń mieszkańca
    if (userRole === 'resident') {
      const userIncidents = incidents.filter(inc => inc.email === userEmail);

      return (
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Header 
            onLoginClick={handleLoginClick}
            onHomeClick={handleHomeClick}
            onDashboardClick={handleDashboardClick}
            onLogoutClick={handleLogoutClick}
            isLoggedIn={isLoggedIn}
            userRole={userRole}
          />
          <main className="flex-1 container mx-auto px-4 py-12">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-gray-900 mb-2">Panel Mieszkańca</h2>
              <p className="text-gray-600 mb-8">Zalogowano jako: {userEmail}</p>

              <div className="mb-8">
                <h3 className="text-gray-900 mb-6">Twoje zgłoszenia</h3>
                
                {userIncidents.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border">
                    <p className="text-gray-500">Nie masz jeszcze żadnych zgłoszeń</p>
                    <Button 
                      className="mt-4 bg-blue-600 hover:bg-blue-700"
                      onClick={handleHomeClick}
                    >
                      Zgłoś pierwszy incydent
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {userIncidents.map((incident) => (
                      <IncidentCard 
                        key={incident.id} 
                        incident={incident} 
                        onClick={() => handleIncidentClick(incident)} 
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
          <Footer />
          
          {/* Incident Details Dialog */}
          <IncidentDetailsDialog 
            incident={selectedIncident}
            open={isDetailsDialogOpen}
            onOpenChange={setIsDetailsDialogOpen}
          />
        </div>
      );
    }

    // Panel służby - wyświetlanie zgłoszeń przypisanych do danej służby
    if (userRole === 'service') {
      const userServiceName = getServiceFromEmail(userEmail);
      const allServiceIncidents = incidents
        .filter(inc => inc.service === userServiceName)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Filtrowanie według statusu
      const serviceIncidents = serviceStatusFilter === 'ALL'
        ? allServiceIncidents
        : allServiceIncidents.filter(inc => inc.adminStatus === serviceStatusFilter);

      return (
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Header 
            onLoginClick={handleLoginClick}
            onHomeClick={handleHomeClick}
            onDashboardClick={handleDashboardClick}
            onLogoutClick={handleLogoutClick}
            isLoggedIn={isLoggedIn}
            userRole={userRole}
          />
          <main className="flex-1 container mx-auto px-4 py-12">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-gray-900 mb-2">Panel Służby</h2>
              <p className="text-gray-600 mb-2">Zalogowano jako: {userEmail}</p>
              <p className="text-gray-600 mb-8">Służba: <span className="font-semibold">{userServiceName}</span></p>

              <div className="mb-8">
                <h3 className="text-gray-900 mb-6">Zgłoszenia dla Twojej służby</h3>
                
                {allServiceIncidents.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border">
                    <p className="text-gray-500">Brak zgłoszeń dla tej służby</p>
                  </div>
                ) : (
                  <>
                    {/* Filtry statusów */}
                    <div className="mb-6 flex items-center gap-3 flex-wrap">
                      <span className="text-gray-700">Filtruj po statusie:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'ALL'
                            ? 'bg-gray-200 border-gray-500'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setServiceStatusFilter('ALL')}
                      >
                        Wszystkie ({allServiceIncidents.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'ZGŁOSZONY'
                            ? 'bg-gray-200 border-gray-500'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setServiceStatusFilter('ZGŁOSZONY')}
                      >
                        ZGŁOSZONY ({allServiceIncidents.filter(inc => inc.adminStatus === 'ZGŁOSZONY').length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'W TRAKCIE NAPRAWY'
                            ? 'bg-orange-200 border-orange-500'
                            : 'border-orange-300 hover:bg-orange-50'
                        }`}
                        onClick={() => setServiceStatusFilter('W TRAKCIE NAPRAWY')}
                      >
                        W TRAKCIE NAPRAWY ({allServiceIncidents.filter(inc => inc.adminStatus === 'W TRAKCIE NAPRAWY').length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'NAPRAWIONY'
                            ? 'bg-green-200 border-green-500'
                            : 'border-green-300 hover:bg-green-50'
                        }`}
                        onClick={() => setServiceStatusFilter('NAPRAWIONY')}
                      >
                        NAPRAWIONY ({allServiceIncidents.filter(inc => inc.adminStatus === 'NAPRAWIONY').length})
                      </Button>
                    </div>
                    
                    <div className="space-y-4 mb-6">
                      {serviceIncidents.slice(0, visibleServiceIncidents).map((incident) => (
                        <IncidentCard 
                          key={incident.id} 
                          incident={incident} 
                          onClick={() => handleIncidentClick(incident)} 
                        />
                      ))}
                    </div>
                    
                    {visibleServiceIncidents < serviceIncidents.length && (
                      <div className="text-center">
                        <Button 
                          variant="outline" 
                          onClick={() => setVisibleServiceIncidents(prev => prev + 10)}
                        >
                          Wczytaj więcej
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </main>
          <Footer />
          
          {/* Service Incident Dialog */}
          <ServiceIncidentDialog 
            incident={selectedIncident}
            open={isDetailsDialogOpen}
            onOpenChange={setIsDetailsDialogOpen}
            onUpdate={handleUpdateIncident}
          />
        </div>
      );
    }

    // Panel dla admina (placeholder)
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header 
          onLoginClick={handleLoginClick}
          onHomeClick={handleHomeClick}
          onDashboardClick={handleDashboardClick}
          onLogoutClick={handleLogoutClick}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
        />
        <main className="flex-1 container mx-auto px-4">
          <AdminPanel 
            incidents={incidents}
            onUpdateIncident={handleUpdateIncident}
            onUpdateIncidentService={handleUpdateIncidentService}
          />
        </main>
        <Footer />
      </div>
    );
  }

  // Login view
  if (currentView === 'login') {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header 
          onLoginClick={handleLoginClick}
          onHomeClick={handleHomeClick}
          onDashboardClick={handleDashboardClick}
          onLogoutClick={handleLogoutClick}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
        />
        <LoginForm 
          onRegisterClick={() => setCurrentView('register')}
          onLoginSuccess={handleLoginSuccess}
        />
        <Footer />
      </div>
    );
  }

  // Register view
  if (currentView === 'register') {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header 
          onLoginClick={handleLoginClick}
          onHomeClick={handleHomeClick}
          onDashboardClick={handleDashboardClick}
          onLogoutClick={handleLogoutClick}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
        />
        <RegisterForm onLoginClick={() => setCurrentView('login')} />
        <Footer />
      </div>
    );
  }

  // Home view
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <Header 
        onLoginClick={handleLoginClick}
        onHomeClick={handleHomeClick}
        onDashboardClick={handleDashboardClick}
        onLogoutClick={handleLogoutClick}
        isLoggedIn={isLoggedIn}
        userRole={userRole}
      />

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h2 className="text-gray-900 mb-4">
              Zgłoś problem w Twoim mieście
            </h2>
            <p className="text-gray-600 mb-8">
              Pomóż nam utrzymać miasto w lepszym stanie. Zgłaszaj incydenty bezpośrednio do odpowiednich służb miejskich.
            </p>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                  ZGŁOŚ INCYDENT
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Zgłoś nowy incydent</DialogTitle>
                  <DialogDescription>
                    Wypełnij formularz, aby zgłosić problem do odpowiedniej służby miejskiej
                  </DialogDescription>
                </DialogHeader>
                <IncidentForm onSubmit={handleSubmitIncident} />
              </DialogContent>
            </Dialog>
          </div>

          {/* Resolved Incidents Section */}
          <div className="mt-16">
            <h3 className="text-gray-900 mb-6">
              Ostatnio rozwiązane zgłoszenia
            </h3>
            
            {resolvedIncidents.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500">Brak rozwiązanych zgłoszeń</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {resolvedIncidents.slice(0, visibleIncidents).map((incident) => (
                    <IncidentCard key={incident.id} incident={incident} onClick={() => handleIncidentClick(incident)} />
                  ))}
                </div>
                
                {visibleIncidents < resolvedIncidents.length && visibleIncidents < 15 && (
                  <div className="text-center">
                    <Button 
                      variant="outline" 
                      onClick={showMoreIncidents}
                    >
                      Pokaż więcej
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
      <Toaster />
      
      {/* Incident Details Dialog */}
      <IncidentDetailsDialog 
        incident={selectedIncident}
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
      />
    </div>
  );
}