import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Calendar, CheckCircle2 } from 'lucide-react';
import type { Incident } from '../App';
import { formatPolishDate } from '../utils/dateUtils';

interface IncidentCardProps {
  incident: Incident;
  onClick?: (incident: Incident) => void;
}

const serviceColors: Record<string, string> = {
  'Miejskie Przedsiębiorstwo Energetyki Cieplnej': 'bg-red-100 text-red-800',
  'Miejskie Przedsiębiorstwo Komunikacyjne': 'bg-blue-100 text-blue-800',
  'Zakład Gospodarki Komunalnej': 'bg-green-100 text-green-800',
  'Pogotowie Kanalizacyjne': 'bg-purple-100 text-purple-800',
  'Zarząd Dróg': 'bg-orange-100 text-orange-800',
};

const getServiceShortName = (service: string): string => {
  if (service === 'Miejskie Przedsiębiorstwo Energetyki Cieplnej') return 'MPEC';
  if (service === 'Miejskie Przedsiębiorstwo Komunikacyjne') return 'MPK';
  if (service === 'Zakład Gospodarki Komunalnej') return 'ZGK';
  if (service === 'Pogotowie Kanalizacyjne') return 'PK';
  if (service === 'Zarząd Dróg') return 'ZD';
  return service;
};


export function IncidentCard({ incident, onClick }: IncidentCardProps) {
  const serviceColor = serviceColors[incident.service] || serviceColors[getServiceShortName(incident.service)] || 'bg-gray-100 text-gray-800';

  return (
    <Card 
      className="hover:shadow-md transition-shadow cursor-pointer" 
      onClick={() => onClick && onClick(incident)}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
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
            </div>

            {/* Description */}
            <p className="text-gray-900">{incident.description}</p>

            {/* Address */}
            <div className="flex items-start gap-2 text-gray-600">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{incident.address}</span>
            </div>

            {/* Dates */}
            <div className="flex items-center gap-4 text-gray-500">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>Data zgłoszenia: {formatPolishDate(incident.createdAt)}</span>
              </div>
              {incident.resolvedAt && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Data rozwiązania: {formatPolishDate(incident.resolvedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Image */}
          {incident.imageUrl && (
            <div className="flex-shrink-0">
              <img
                src={incident.imageUrl}
                alt="Zdjęcie incydentu"
                className="w-24 h-24 object-cover rounded-lg"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}