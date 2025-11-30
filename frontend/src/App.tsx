/**
 * ZglosTO - Aplikacja do zgłaszania incydentów miejskich
 *
 * Dostępne widoki aplikacji (routing):
 * - 'home': Główny widok aplikacji z formularzem zgłoszeń incydentów
 * - 'login': Widok logowania dla użytkowników
 * - 'register': Widok rejestracji nowych użytkowników
 * - 'dashboard': Panel użytkownika (routing wewnętrzny w zależności od roli):
 *   - 'admin': Panel Administratorski - zarządzanie wszystkimi zgłoszeniami
 *   - 'sluzby': Panel Służby - zarządzanie zgłoszeniami przypisanymi do konkretnej służby
 *   - 'mieszkaniec': Panel Mieszkańca - przegląd własnych zgłoszeń
 */

import { useState, useEffect } from 'react';
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
import { fetchResolvedIncidents } from './services/api';

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


export default function App() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [visibleIncidents, setVisibleIncidents] = useState(5);
  const [visibleServiceIncidents, setVisibleServiceIncidents] = useState(10);
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'register' | 'dashboard'>('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'sluzby' | 'mieszkaniec'>('mieszkaniec');
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'ALL' | 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY'>('ALL');
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(true);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  // Transform API response to Incident interface
  const transformApiIncident = (apiIncident: any): Incident => {
    return {
      id: apiIncident.id_zgloszenia,
      service: apiIncident.typ_sluzby,
      description: apiIncident.opis_zgloszenia,
      address: apiIncident.adres_zgloszenia,
      email: '', // API doesn't provide email for resolved incidents
      imageUrl: undefined, // API doesn't provide original image for resolved incidents
      resolvedImageUrl: apiIncident.zdjecie_incydentu_rozwiazanego || undefined,
      status: 'resolved', // All incidents from this endpoint are resolved
      checked: true, // Resolved incidents are typically checked
      adminStatus: apiIncident.status_incydentu as 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY',
      createdAt: apiIncident.data_godzina_zgloszenia,
      resolvedAt: apiIncident.data_godzina_rozwiazania,
    };
  };

  // Fetch resolved incidents on component mount
  useEffect(() => {

    const loadIncidents = async () => {
      try {
        setIsLoadingIncidents(true);
        setIncidentsError(null);
        const apiIncidents = await fetchResolvedIncidents();
        const transformedIncidents = apiIncidents.map(transformApiIncident);
        setIncidents(transformedIncidents);
      } catch (error) {
        console.error('Failed to load incidents:', error);
        setIncidentsError('Nie udało się załadować zgłoszeń. Spróbuj odświeżyć stronę.');
        // Leave incidents empty if API fails
        setIncidents([]);
      } finally {
        setIsLoadingIncidents(false);
      }
    };

    loadIncidents();
  }, []);

  const handleSubmitIncident = async (incident: Omit<Incident, 'id' | 'status' | 'createdAt'>) => {
    // Incident is already saved by IncidentForm, just update local state
    const newIncident: Incident = {
      ...incident,
      id: Date.now().toString(),
      status: 'pending',
      adminStatus: 'ZGŁOSZONY',
      createdAt: new Date().toISOString(),
    };

    setIncidents([newIncident, ...incidents]);
    setIsDialogOpen(false);
  };

  const showMoreIncidents = () => {
    setVisibleIncidents(15); // Pokazuje wszystkie 15 zgłoszeń (5 początkowych + 10 dodatkowych)
  };

  const handleLoginSuccess = (role: 'admin' | 'sluzby' | 'mieszkaniec', email: string) => {
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
    setUserRole('mieszkaniec');
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
    if (userRole === 'mieszkaniec') {
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
    if (userRole === 'sluzby') {
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

            {isLoadingIncidents ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500">Ładowanie zgłoszeń...</p>
              </div>
            ) : incidentsError ? (
              <div className="text-center py-12 bg-white rounded-lg border border-red-200">
                <p className="text-red-500 mb-4">{incidentsError}</p>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  Odśwież stronę
                </Button>
              </div>
            ) : resolvedIncidents.length === 0 ? (
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