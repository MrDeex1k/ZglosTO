import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { MapPin, Calendar, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import type { Incident } from '../App';

interface IncidentDetailsDialogProps {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const serviceColors: Record<string, string> = {
  'Miejskie Przedsiębiorstwo Komunikacyjne': 'bg-blue-100 text-blue-800',
  'Zakład Gospodarki Komunalnej': 'bg-green-100 text-green-800',
  'Pogotowie Kanalizacyjne': 'bg-purple-100 text-purple-800',
  'Zarząd Dróg': 'bg-orange-100 text-orange-800',
  'Miejskie Przedsiębiorstwo Energetyki Cieplnej': 'bg-red-100 text-red-800',
  'MPK': 'bg-blue-100 text-blue-800',
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

export function IncidentDetailsDialog({ incident, open, onOpenChange }: IncidentDetailsDialogProps) {
  if (!incident) return null;

  const serviceColor = serviceColors[incident.service] || serviceColors[getServiceShortName(incident.service)] || 'bg-gray-100 text-gray-800';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Szczegóły zgłoszenia</DialogTitle>
          <DialogDescription>Informacje szczegółowe dotyczące zgłoszenia incydentu.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Service and Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={serviceColor}>
              {getServiceShortName(incident.service)}
            </Badge>
            {incident.status === 'resolved' && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Rozwiązane
              </Badge>
            )}
            {incident.status === 'in-progress' && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                W trakcie realizacji
              </Badge>
            )}
            {incident.status === 'pending' && (
              <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                Oczekujące
              </Badge>
            )}
          </div>

          {/* Full Service Name */}
          <div>
            <div className="text-gray-500 mb-1">Służba odpowiedzialna</div>
            <div className="text-gray-900">{incident.service}</div>
          </div>

          {/* Description */}
          <div>
            <div className="text-gray-500 mb-1">Opis zgłoszenia</div>
            <p className="text-gray-900">{incident.description}</p>
          </div>

          {/* Address */}
          <div>
            <div className="text-gray-500 mb-1">Adres</div>
            <div className="flex items-start gap-2 text-gray-900">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-500" />
              <span>{incident.address}</span>
            </div>
          </div>

          {/* Images */}
          {(incident.imageUrl || incident.resolvedImageUrl) && (
            <div className="pt-4 border-t">
              <div className="text-gray-900 mb-4">Zdjęcia</div>
              
              <div className="grid md:grid-cols-2 gap-4">
                {/* Zdjęcie zgłoszenia */}
                {incident.imageUrl && (
                  <div className="space-y-2">
                    <div className="text-gray-500 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Zdjęcie zgłoszenia
                    </div>
                    <img
                      src={incident.imageUrl}
                      alt="Zdjęcie incydentu"
                      className="w-full h-64 object-cover rounded-lg border bg-gray-50"
                    />
                  </div>
                )}

                {/* Zdjęcie po rozwiązaniu */}
                {incident.resolvedImageUrl && (
                  <div className="space-y-2">
                    <div className="text-gray-500 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Zdjęcie po naprawie
                    </div>
                    <img
                      src={incident.resolvedImageUrl}
                      alt="Zdjęcie po rozwiązaniu"
                      className="w-full h-64 object-cover rounded-lg border bg-gray-50"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 text-gray-500" />
              <div>
                <div className="text-gray-500">Data zgłoszenia</div>
                <div className="text-gray-900">{formatDate(incident.createdAt)}</div>
              </div>
            </div>

            {incident.resolvedAt && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                <div>
                  <div className="text-gray-500">Data rozwiązania</div>
                  <div className="text-gray-900">{formatDate(incident.resolvedAt)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}