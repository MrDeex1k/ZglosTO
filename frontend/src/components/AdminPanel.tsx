import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  FileText,
  AlertCircle,
  UserCog,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import type { Incident } from "../App";
import { AdminIncidentDialog } from "./AdminIncidentDialog";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

interface AdminPanelProps {
  incidents: Incident[];
  onUpdateIncident: (
    incidentId: string,
    checked: boolean,
    adminStatus:
      | "ZGŁOSZONY"
      | "W TRAKCIE NAPRAWY"
      | "NAPRAWIONY",
    resolvedImageBase64?: string
  ) => void;
  onUpdateIncidentService?: (incidentId: string, newService: string) => void;
}

const serviceColors: Record<string, string> = {
  "Miejskie Przedsiębiorstwo Energetyki Cieplnej":
    "bg-red-100 text-red-800",
  "Miejskie Przedsiębiorstwo Komunikacyjne":
    "bg-blue-100 text-blue-800",
  "Zakład Gospodarki Komunalnej": "bg-green-100 text-green-800",
  "Pogotowie Kanalizacyjne": "bg-purple-100 text-purple-800",
  "Zarząd Dróg": "bg-orange-100 text-orange-800",
  Inne: "bg-gray-100 text-gray-800",
};

const getServiceShortName = (service: string): string => {
  if (
    service === "Miejskie Przedsiębiorstwo Energetyki Cieplnej"
  )
    return "MPEC";
  if (service === "Miejskie Przedsiębiorstwo Komunikacyjne")
    return "MPK";
  if (service === "Zakład Gospodarki Komunalnej") return "ZGK";
  if (service === "Pogotowie Kanalizacyjne") return "PK";
  if (service === "Zarząd Dróg") return "ZD";
  return service;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function AdminPanel({
  incidents,
  onUpdateIncident,
  onUpdateIncidentService,
}: AdminPanelProps) {
  const [activeView, setActiveView] = useState<
    "menu" | "all" | "unassigned" | "permissions"
  >("menu");
  const [selectedIncident, setSelectedIncident] =
    useState<Incident | null>(null);
  const [showAllIncidents, setShowAllIncidents] =
    useState(false);
  
  // State dla formularza uprawnień
  const [userEmail, setUserEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<'resident' | 'service'>('resident');
  const [selectedService, setSelectedService] = useState('');
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string; visible: boolean }>({
    type: 'success',
    message: '',
    visible: false
  });
  
  // State dla filtrów statusów
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY'>('ALL');
  
  // Auto-hide alert po 10 sekundach
  useEffect(() => {
    if (alert.visible) {
      const timer = setTimeout(() => {
        setAlert(prev => ({ ...prev, visible: false }));
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [alert.visible]);
  
  // Funkcje obsługi formularzy
  const handleSaveRole = () => {
    // Walidacja
    if (!userEmail || !userEmail.includes('@')) {
      setAlert({
        type: 'error',
        message: 'Opsss... Zmiana się nie powiodła...',
        visible: true
      });
      return;
    }
    
    // Sukces (mock)
    setAlert({
      type: 'success',
      message: 'Hurra! Awans użytkownika się powiódł',
      visible: true
    });
    
    // Wyczyść formularz
    setUserEmail('');
    setSelectedRole('resident');
  };
  
  const handleAssignService = () => {
    // Walidacja
    if (!selectedService) {
      setAlert({
        type: 'error',
        message: 'Opsss... Zmiana się nie powiodła...',
        visible: true
      });
      return;
    }
    
    // Sukces (mock)
    setAlert({
      type: 'success',
      message: 'Hurra! Awans użytkownika się powiódł',
      visible: true
    });
    
    // Wyczyść formularz
    setSelectedService('');
  };

  // Wszystkie zgłoszenia
  const allIncidents = [...incidents].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime(),
  );

  // Nieprzypisane zgłoszenia (służba = "Inne")
  const unassignedIncidents = allIncidents.filter(
    (inc) => inc.service === "Inne",
  );

  // Limit wyświetlania
  const displayLimit = 10;
  const displayedUnassignedIncidents = showAllIncidents
    ? unassignedIncidents
    : unassignedIncidents.slice(0, displayLimit);

  if (activeView === "menu") {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <h2 className="text-gray-900 mb-8 text-center">
          Panel Administratorski
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Zobacz wszystkie zgłoszenia */}
          <Card
            className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-blue-200 hover:border-blue-400"
            onClick={() => setActiveView("all")}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-gray-900">
                Zobacz wszystkie zgłoszenia
              </h3>
              <p className="text-gray-600">
                Przeglądaj i zarządzaj wszystkimi zgłoszeniami w
                systemie
              </p>
              <Badge className="bg-blue-100 text-blue-800">
                {allIncidents.length} zgłoszeń
              </Badge>
            </div>
          </Card>

          {/* Sprawdź nieprzypisane */}
          <Card
            className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-orange-200 hover:border-orange-400"
            onClick={() => setActiveView("unassigned")}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-gray-900">
                Sprawdź nieprzypisane zgłoszenia
              </h3>
              <p className="text-gray-600">
                Zgłoszenia oznaczone jako "Inne" wymagają
                przypisania
              </p>
              <Badge className="bg-orange-100 text-orange-800">
                {unassignedIncidents.length} nieprzypisanych
              </Badge>
            </div>
          </Card>

          {/* Nadaj uprawnienia służb */}
          <Card
            className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-purple-200 hover:border-purple-400"
            onClick={() => setActiveView("permissions")}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
                <UserCog className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-gray-900">
                Nadaj uprawnienia służb
              </h3>
              <p className="text-gray-600">
                Zarządzaj uprawnieniami i dostępem dla służb
                miejskich
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (activeView === "all") {
    // Filtruj zgłoszenia według wybranego statusu
    const filteredIncidents = statusFilter === 'ALL' 
      ? allIncidents 
      : allIncidents.filter(inc => inc.adminStatus === statusFilter);
    
    const displayedFilteredIncidents = showAllIncidents
      ? filteredIncidents
      : filteredIncidents.slice(0, displayLimit);
    
    return (
      <div className="max-w-6xl mx-auto py-12 px-4">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-gray-900">
            Wszystkie zgłoszenia ({filteredIncidents.length})
          </h2>
          <Button
            variant="outline"
            onClick={() => {
              setActiveView("menu");
              setStatusFilter('ALL');
              setShowAllIncidents(false);
            }}
          >
            Powrót do menu
          </Button>
        </div>
        
        {/* Filtry statusów */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <span className="text-gray-700">Filtruj po statusie:</span>
          <Button
            variant="outline"
            size="sm"
            className={`border-2 ${
              statusFilter === 'ALL'
                ? 'bg-gray-200 border-gray-500'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => setStatusFilter('ALL')}
          >
            Wszystkie ({allIncidents.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`border-2 ${
              statusFilter === 'ZGŁOSZONY'
                ? 'bg-gray-200 border-gray-500'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => setStatusFilter('ZGŁOSZONY')}
          >
            ZGŁOSZONY ({allIncidents.filter(inc => inc.adminStatus === 'ZGŁOSZONY').length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`border-2 ${
              statusFilter === 'W TRAKCIE NAPRAWY'
                ? 'bg-orange-200 border-orange-500'
                : 'border-orange-300 hover:bg-orange-50'
            }`}
            onClick={() => setStatusFilter('W TRAKCIE NAPRAWY')}
          >
            W TRAKCIE NAPRAWY ({allIncidents.filter(inc => inc.adminStatus === 'W TRAKCIE NAPRAWY').length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`border-2 ${
              statusFilter === 'NAPRAWIONY'
                ? 'bg-green-200 border-green-500'
                : 'border-green-300 hover:bg-green-50'
            }`}
            onClick={() => setStatusFilter('NAPRAWIONY')}
          >
            NAPRAWIONY ({allIncidents.filter(inc => inc.adminStatus === 'NAPRAWIONY').length})
          </Button>
        </div>

        <div className="space-y-4">
          {displayedFilteredIncidents.map((incident) => (
            <Card
              key={incident.id}
              className="p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedIncident(incident)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge
                      className={
                        serviceColors[incident.service] ||
                        "bg-gray-100 text-gray-800"
                      }
                    >
                      {getServiceShortName(incident.service)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        incident.adminStatus === "NAPRAWIONY"
                          ? "border-green-500 text-green-700"
                          : incident.adminStatus ===
                              "W TRAKCIE NAPRAWY"
                            ? "border-orange-500 text-orange-700"
                            : "border-gray-500 text-gray-700"
                      }
                    >
                      {incident.adminStatus}
                    </Badge>
                  </div>
                  <p className="text-gray-900 mb-2 line-clamp-2">
                    {incident.description}
                  </p>
                  <div className="flex items-center gap-4 text-gray-600">
                    <span className="truncate">
                      {incident.address}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="whitespace-nowrap">
                      {formatDate(incident.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {filteredIncidents.length > displayLimit && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() =>
                  setShowAllIncidents(!showAllIncidents)
                }
                className="gap-2"
              >
                {showAllIncidents ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Pokaż mniej
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Wczytaj więcej (
                    {filteredIncidents.length - displayLimit}{" "}
                    pozostałych)
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <AdminIncidentDialog
          incident={selectedIncident}
          open={!!selectedIncident}
          onOpenChange={(open) =>
            !open && setSelectedIncident(null)
          }
          onUpdateService={onUpdateIncidentService || (() => {})}
          onUpdate={onUpdateIncident}
        />
      </div>
    );
  }

  if (activeView === "unassigned") {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-gray-900">
            Nieprzypisane zgłoszenia (
            {unassignedIncidents.length})
          </h2>
          <Button
            variant="outline"
            onClick={() => setActiveView("menu")}
          >
            Powrót do menu
          </Button>
        </div>

        {unassignedIncidents.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-gray-900 mb-2">
              Brak nieprzypisanych zgłoszeń
            </h3>
            <p className="text-gray-600">
              Wszystkie zgłoszenia zostały przypisane do
              odpowiednich służb
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {displayedUnassignedIncidents.map((incident) => (
              <Card
                key={incident.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-orange-400"
                onClick={() => setSelectedIncident(incident)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className="bg-gray-100 text-gray-800">
                        Inne (Nieprzypisane)
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          incident.adminStatus === "NAPRAWIONY"
                            ? "border-green-500 text-green-700"
                            : incident.adminStatus ===
                                "W TRAKCIE NAPRAWY"
                              ? "border-orange-500 text-orange-700"
                              : "border-gray-500 text-gray-700"
                        }
                      >
                        {incident.adminStatus}
                      </Badge>
                    </div>
                    <p className="text-gray-900 mb-2 line-clamp-2">
                      {incident.description}
                    </p>
                    <div className="flex items-center gap-4 text-gray-600">
                      <span className="truncate">
                        {incident.address}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="whitespace-nowrap">
                        {formatDate(incident.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            {unassignedIncidents.length > displayLimit && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() =>
                    setShowAllIncidents(!showAllIncidents)
                  }
                  className="gap-2"
                >
                  {showAllIncidents ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Pokaż mniej
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Wczytaj więcej (
                      {unassignedIncidents.length -
                        displayLimit}{" "}
                      pozostałych)
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        <AdminIncidentDialog
          incident={selectedIncident}
          open={!!selectedIncident}
          onOpenChange={(open) =>
            !open && setSelectedIncident(null)
          }
          onUpdateService={onUpdateIncidentService || (() => {})}
          onUpdate={onUpdateIncident}
        />
      </div>
    );
  }

  if (activeView === "permissions") {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-gray-900">
            Zarządzanie uprawnieniami służb
          </h2>
          <Button
            variant="outline"
            onClick={() => setActiveView("menu")}
          >
            Powrót do menu
          </Button>
        </div>

        <div className="space-y-6">
          {/* Alert */}
          {alert.visible && (
            <div className={`p-4 rounded-lg border-2 flex items-start justify-between ${
              alert.type === 'success' 
                ? 'bg-green-50 border-green-500' 
                : 'bg-red-50 border-red-500'
            }`}>
              <p className={`${
                alert.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {alert.message}
              </p>
              <button
                onClick={() => setAlert(prev => ({ ...prev, visible: false }))}
                className={`ml-4 ${
                  alert.type === 'success' ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Nadaj rolę użytkownikowi */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserCog className="w-5 h-5 text-purple-600" />
              <h3 className="text-gray-900">
                Nadaj rolę użytkownikowi
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-700 mb-2 block">
                  Adres e-mail użytkownika
                </label>
                <input
                  type="email"
                  placeholder="np. jan.kowalski@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="text-gray-700 mb-2 block">
                  Wybierz rolę
                </label>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className={`flex-1 border-2 ${
                      selectedRole === 'resident'
                        ? 'bg-blue-100 border-blue-500'
                        : 'border-blue-300 hover:bg-blue-50'
                    }`}
                    onClick={() => setSelectedRole('resident')}
                  >
                    Mieszkaniec
                  </Button>
                  <Button
                    variant="outline"
                    className={`flex-1 border-2 ${
                      selectedRole === 'service'
                        ? 'bg-purple-100 border-purple-500'
                        : 'border-purple-300 hover:bg-purple-50'
                    }`}
                    onClick={() => setSelectedRole('service')}
                  >
                    Służby
                  </Button>
                </div>
              </div>

              <Button className="w-full bg-purple-600 hover:bg-purple-700" onClick={handleSaveRole}>
                ZAPISZ ZMIANY
              </Button>
            </div>
          </Card>

          {/* Przypisz służbę */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <h3 className="text-gray-900">
                Przypisz służbę do konta
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-700 mb-2 block">
                  Wybierz rodzaj służby
                </label>
                <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                >
                  <option value="">-- Wybierz służbę --</option>
                  <option value="Miejskie Przedsiębiorstwo Komunikacyjne">
                    Miejskie Przedsiębiorstwo Komunikacyjne
                    (MPK)
                  </option>
                  <option value="Zakład Gospodarki Komunalnej">
                    Zakład Gospodarki Komunalnej (ZGK)
                  </option>
                  <option value="Pogotowie Kanalizacyjne">
                    Pogotowie Kanalizacyjne (PK)
                  </option>
                  <option value="Zarząd Dróg">
                    Zarząd Dróg (ZD)
                  </option>
                  <option value="Miejskie Przedsiębiorstwo Energetyki Cieplnej">
                    Miejskie Przedsiębiorstwo Energetyki
                    Cieplnej (MPEC)
                  </option>
                </select>
              </div>

              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleAssignService}>
                PRZYPISZ SŁUŻBĘ
              </Button>
            </div>
          </Card>

          {/* Informacja */}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-blue-900">
                <p className="mb-2">
                  <strong>Jak to działa?</strong>
                </p>
                <ul className="space-y-1 list-disc list-inside text-blue-800">
                  <li>
                    Najpierw nadaj rolę "Służby" dla wybranego
                    konta
                  </li>
                  <li>
                    Następnie przypisz konkretną służbę miejską
                    do tego konta
                  </li>
                  <li>
                    Użytkownik będzie widział tylko zgłoszenia
                    przypisane do jego służby
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}