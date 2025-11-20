import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { X } from 'lucide-react';
import type { Incident } from '../App';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';

interface AdminIncidentDialogProps {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateService: (incidentId: string, newService: string) => void;
  onUpdate: (incidentId: string, checked: boolean, adminStatus: 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY', resolvedImageBase64?: string) => void;
}

const serviceColors: Record<string, string> = {
  'Miejskie Przedsiębiorstwo Komunikacyjne': 'bg-blue-100 text-blue-800',
  'Zakład Gospodarki Komunalnej': 'bg-green-100 text-green-800',
  'Pogotowie Kanalizacyjne': 'bg-purple-100 text-purple-800',
  'Zarząd Dróg': 'bg-orange-100 text-orange-800',
  'Miejskie Przedsiębiorstwo Energetyki Cieplnej': 'bg-red-100 text-red-800',
  'Inne': 'bg-gray-100 text-gray-800',
};

const getServiceShortName = (service: string): string => {
  if (service === 'Miejskie Przedsiębiorstwo Komunikacyjne') return 'MPK';
  if (service === 'Zakład Gospodarki Komunalnej') return 'ZGK';
  if (service === 'Pogotowie Kanalizacyjne') return 'PK';
  if (service === 'Zarząd Dróg') return 'ZD';
  if (service === 'Miejskie Przedsiębiorstwo Energetyki Cieplnej') return 'MPEC';
  return service;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function AdminIncidentDialog({ incident, open, onOpenChange, onUpdateService, onUpdate }: AdminIncidentDialogProps) {
  const [selectedService, setSelectedService] = useState<string>('');
  const [checked, setChecked] = useState<boolean>(false);
  const [adminStatus, setAdminStatus] = useState<'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY'>('ZGŁOSZONY');
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string; visible: boolean }>({
    type: 'success',
    message: '',
    visible: false
  });

  // Synchronizuj stan z incydentem, gdy się zmieni
  useEffect(() => {
    if (incident) {
      setSelectedService(incident.service);
      setChecked(incident.checked);
      setAdminStatus(incident.adminStatus);
    }
  }, [incident]);

  // Auto-hide alert po 10 sekundach
  useEffect(() => {
    if (alert.visible) {
      const timer = setTimeout(() => {
        setAlert(prev => ({ ...prev, visible: false }));
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [alert.visible]);

  if (!incident) return null;

  const serviceColor = serviceColors[incident.service] || serviceColors[getServiceShortName(incident.service)] || 'bg-gray-100 text-gray-800';

  const handleSave = () => {
    // Walidacja - czy wybrano służbę inną niż "Inne"
    if (!selectedService || selectedService === 'Inne') {
      setAlert({
        type: 'error',
        message: 'Opsss... Nie udało się przypisać zadania',
        visible: true
      });
      return;
    }
    
    // Sukces
    setAlert({
      type: 'success',
      message: 'Hurra! Przypisałeś zadanie dla służby!',
      visible: true
    });
    
    // Wywołaj callback po 1 sekundzie, żeby użytkownik zobaczył komunikat
    setTimeout(() => {
      onUpdateService(incident.id, selectedService);
      setAlert(prev => ({ ...prev, visible: false }));
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Szczegóły zgłoszenia (Admin)</DialogTitle>
          <DialogDescription>
            Oto szczegółowe informacje dotyczące zgłoszenia. Możesz przypisać je do odpowiedniej służby.
          </DialogDescription>
        </DialogHeader>

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

          {/* Nagłówek z informacjami podstawowymi */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Badge className={serviceColor}>
                {getServiceShortName(incident.service)}
              </Badge>
              <Badge variant="outline" className={
                incident.adminStatus === 'NAPRAWIONY' 
                  ? 'border-green-500 text-green-700'
                  : incident.adminStatus === 'W TRAKCIE NAPRAWY'
                  ? 'border-orange-500 text-orange-700'
                  : 'border-gray-500 text-gray-700'
              }>
                {incident.adminStatus}
              </Badge>
            </div>
            <div className="text-gray-600 mb-2">
              <strong>Data zgłoszenia:</strong> {formatDate(incident.createdAt)}
            </div>
            {incident.resolvedAt && (
              <div className="text-gray-600">
                <strong>Data rozwiązania:</strong> {formatDate(incident.resolvedAt)}
              </div>
            )}
          </div>

          {/* Opis */}
          <div>
            <div className="text-gray-700 mb-2">Opis problemu</div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-900">{incident.description}</p>
            </div>
          </div>

          {/* Adres */}
          <div>
            <div className="text-gray-700 mb-2">Lokalizacja</div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-900">{incident.address}</p>
            </div>
          </div>

          {/* Email */}
          <div>
            <div className="text-gray-700 mb-2">Email zgłaszającego</div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-900">{incident.email}</p>
            </div>
          </div>

          {/* Zdjęcie jeśli istnieje */}
          {incident.imageUrl && (
            <div>
              <div className="text-gray-700 mb-2">Zdjęcie zgłoszenia</div>
              <img 
                src={incident.imageUrl} 
                alt="Zdjęcie incydentu" 
                className="w-full rounded-lg border border-gray-200"
              />
            </div>
          )}

          {/* Przypisanie służby - tylko dla zgłoszeń typu "Inne" */}
          {incident.service === 'Inne' && (
            <div className="border-t pt-6">
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg mb-4">
                <p className="text-orange-800">
                  <strong>Uwaga!</strong> To zgłoszenie wymaga przypisania do odpowiedniej służby miejskiej.
                </p>
              </div>

              <div>
                <label className="text-gray-700 mb-2 block">
                  Przypisz zgłoszenie do służby
                </label>
                <Select 
                  value={selectedService} 
                  onValueChange={(value) => setSelectedService(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="-- Wybierz służbę --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inne">Inne (nieprzypisane)</SelectItem>
                    <SelectItem value="Miejskie Przedsiębiorstwo Komunikacyjne">
                      Miejskie Przedsiębiorstwo Komunikacyjne (MPK)
                    </SelectItem>
                    <SelectItem value="Zakład Gospodarki Komunalnej">
                      Zakład Gospodarki Komunalnej (ZGK)
                    </SelectItem>
                    <SelectItem value="Pogotowie Kanalizacyjne">
                      Pogotowie Kanalizacyjne (PK)
                    </SelectItem>
                    <SelectItem value="Zarząd Dróg">
                      Zarząd Dróg (ZD)
                    </SelectItem>
                    <SelectItem value="Miejskie Przedsiębiorstwo Energetyki Cieplnej">
                      Miejskie Przedsiębiorstwo Energetyki Cieplnej (MPEC)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
                onClick={handleSave}
              >
                ZAPISZ ZMIANY
              </Button>
            </div>
          )}

          {/* Zarządzanie statusem - dla wszystkich zgłoszeń (Admin Panel) */}
          <div className="pt-6 border-t space-y-4">
            <h4 className="text-gray-900">Zarządzanie statusem zgłoszenia (Admin)</h4>

            {/* Checked Toggle */}
            <div>
              <div className="text-gray-700 mb-2">Czy zweryfikowane?</div>
              <div className="flex gap-2">
                <Button
                  variant={checked ? 'default' : 'outline'}
                  className={checked ? 'bg-green-600 hover:bg-green-700' : ''}
                  onClick={() => setChecked(true)}
                >
                  TAK
                </Button>
                <Button
                  variant={!checked ? 'default' : 'outline'}
                  className={!checked ? 'bg-gray-600 hover:bg-gray-700' : ''}
                  onClick={() => setChecked(false)}
                >
                  NIE
                </Button>
              </div>
            </div>

            {/* Status Select */}
            <div>
              <div className="text-gray-700 mb-2">Status zgłoszenia</div>
              <Select 
                value={adminStatus} 
                onValueChange={(value) => setAdminStatus(value as 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Wybierz status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZGŁOSZONY">ZGŁOSZONY</SelectItem>
                  <SelectItem value="W TRAKCIE NAPRAWY">W TRAKCIE NAPRAWY</SelectItem>
                  <SelectItem value="NAPRAWIONY">NAPRAWIONY</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Save Status Button */}
            <Button 
              className="w-full bg-purple-600 hover:bg-purple-700"
              onClick={() => {
                try {
                  onUpdate(incident.id, checked, adminStatus);
                  setAlert({
                    type: 'success',
                    message: 'Status zgłoszenia został zaktualizowany!',
                    visible: true
                  });
                  setTimeout(() => {
                    setAlert(prev => ({ ...prev, visible: false }));
                    onOpenChange(false);
                  }, 1500);
                } catch (error) {
                  setAlert({
                    type: 'error',
                    message: 'Opsss... Aktualizacja statusu się nie powiodła',
                    visible: true
                  });
                }
              }}
            >
              Zaktualizuj status
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}