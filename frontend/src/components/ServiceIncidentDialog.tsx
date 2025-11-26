import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { MapPin, Calendar, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Incident } from '../App';
import { formatPolishDate } from '../utils/dateUtils';

interface ServiceIncidentDialogProps {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (incidentId: string, checked: boolean, adminStatus: 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY', resolvedImageBase64?: string) => void;
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


export function ServiceIncidentDialog({ incident, open, onOpenChange, onUpdate }: ServiceIncidentDialogProps) {
  const [checked, setChecked] = useState<boolean>(false);
  const [adminStatus, setAdminStatus] = useState<'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY'>('ZGŁOSZONY');
  const [resolvedImageBase64, setResolvedImageBase64] = useState<string>('');
  const [resolvedImagePreview, setResolvedImagePreview] = useState<string>('');

  // Synchronizuj stan z incydentem, gdy się zmieni
  useEffect(() => {
    if (incident) {
      setChecked(incident.checked);
      setAdminStatus(incident.adminStatus);
      setResolvedImageBase64(incident.resolvedImageUrl || '');
      setResolvedImagePreview(incident.resolvedImageUrl || '');
    }
  }, [incident]);

  if (!incident) return null;

  const serviceColor = serviceColors[incident.service] || serviceColors[getServiceShortName(incident.service)] || 'bg-gray-100 text-gray-800';
  const isFixed = incident.adminStatus === 'NAPRAWIONY';

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Konwersja do base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setResolvedImageBase64(base64String);
        setResolvedImagePreview(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    onUpdate(incident.id, checked, adminStatus, resolvedImageBase64);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Szczegóły zgłoszenia - Panel Służby</DialogTitle>
          <DialogDescription>
            Przeglądaj szczegóły i zarządzaj statusem zgłoszenia
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Service Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={serviceColor}>
              {getServiceShortName(incident.service)}
            </Badge>
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

          {/* Email zgłaszającego */}
          <div>
            <div className="text-gray-500 mb-1">Email zgłaszającego</div>
            <div className="text-gray-900">{incident.email}</div>
          </div>

          {/* Images Section */}
          {incident.imageUrl && (
            <div className="pt-4 border-t">
              <div className="text-gray-900 mb-4">Zdjęcia</div>
              
              <div className="grid md:grid-cols-2 gap-4">
                {/* Zdjęcie zgłoszenia */}
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

                {/* Zdjęcie po rozwiązaniu (jeśli istnieje) */}
                {(incident.resolvedImageUrl || resolvedImagePreview) && (
                  <div className="space-y-2">
                    <div className="text-gray-500 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Zdjęcie po naprawie
                    </div>
                    <img
                      src={resolvedImagePreview || incident.resolvedImageUrl}
                      alt="Zdjęcie po rozwiązaniu"
                      className="w-full h-64 object-cover rounded-lg border bg-gray-50"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Date */}
          <div className="pt-4 border-t">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 text-gray-500" />
              <div>
                <div className="text-gray-500">Data zgłoszenia</div>
                <div className="text-gray-900">{formatPolishDate(incident.createdAt)}</div>
              </div>
            </div>
          </div>

          {/* Management Section */}
          <div className="pt-6 border-t space-y-4">
            <h4 className="text-gray-900">Zarządzanie zgłoszeniem</h4>

            {/* Checked Toggle */}
            <div>
              <div className="text-gray-700 mb-2">Czy sprawdzone?</div>
              <div className="flex gap-2">
                <Button
                  variant={checked ? 'default' : 'outline'}
                  className={checked ? 'bg-green-600 hover:bg-green-700' : ''}
                  onClick={() => setChecked(true)}
                  disabled={isFixed}
                >
                  TAK
                </Button>
                <Button
                  variant={!checked ? 'default' : 'outline'}
                  className={!checked ? 'bg-gray-600 hover:bg-gray-700' : ''}
                  onClick={() => setChecked(false)}
                  disabled={isFixed}
                >
                  NIE
                </Button>
              </div>
            </div>

            {/* Status Select */}
            <div>
              <div className="text-gray-700 mb-2">Status</div>
              {isFixed && (
                <div className="flex items-center gap-2 mb-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-green-700">Zgłoszenie zostało naprawione i nie można zmienić jego statusu</span>
                </div>
              )}
              <Select 
                value={adminStatus} 
                onValueChange={(value) => setAdminStatus(value as 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY')}
                disabled={isFixed}
              >
                <SelectTrigger className={`w-full ${isFixed ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <SelectValue placeholder="Wybierz status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZGŁOSZONY">ZGŁOSZONY</SelectItem>
                  <SelectItem value="W TRAKCIE NAPRAWY">W TRAKCIE NAPRAWY</SelectItem>
                  <SelectItem value="NAPRAWIONY">NAPRAWIONY</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Resolved Image Upload */}
            <div>
              <div className="text-gray-700 mb-2">Zdjęcie po naprawie</div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="resolved-image-upload"
                />
                <label
                  htmlFor="resolved-image-upload"
                  className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-lg"
                >
                  Wybierz zdjęcie
                </label>
              </div>
              {resolvedImagePreview && (
                <div className="mt-2">
                  <img
                    src={resolvedImagePreview}
                    alt="Zdjęcie po naprawie"
                    className="w-full max-h-96 object-contain rounded-lg border bg-gray-50"
                  />
                </div>
              )}
            </div>

            {/* Save Button */}
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={handleSave}
            >
              Zapisz zmiany
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}