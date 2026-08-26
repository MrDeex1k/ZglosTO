import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { MapPin, Calendar, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import type { Incident } from '../types/incident';
import { formatPolishDate } from '../utils/dateUtils';
import { getServiceBadgeStyle, getServiceLabel, getServiceShortLabel } from '../config/services';
import { getCurrentLocale } from '../i18n';
import {
  INCIDENT_DIALOG_CONTENT_CLASS_NAME,
  INCIDENT_DIALOG_TWO_COLUMN_CLASS_NAME,
} from './incident-dialog-styles';

interface IncidentDetailsDialogProps {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IncidentDetailsDialog({
  incident,
  open,
  onOpenChange,
}: IncidentDetailsDialogProps) {
  if (!incident) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={INCIDENT_DIALOG_CONTENT_CLASS_NAME}>
        <DialogHeader className="pr-10">
          <DialogTitle>Szczegóły zgłoszenia</DialogTitle>
          <DialogDescription>
            Informacje szczegółowe dotyczące zgłoszenia incydentu.
          </DialogDescription>
        </DialogHeader>

        <div className={INCIDENT_DIALOG_TWO_COLUMN_CLASS_NAME}>
          <div className="min-w-0 space-y-6">
            <h3 className="font-semibold text-gray-900">Informacje</h3>

            <div className="flex flex-wrap items-center gap-2">
              <Badge style={getServiceBadgeStyle(incident.service)}>
                {getServiceShortLabel(incident.service, getCurrentLocale())}
              </Badge>
              {incident.status === 'resolved' && (
                <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Rozwiązane
                </Badge>
              )}
              {incident.status === 'in-progress' && (
                <Badge variant="outline" className="border-yellow-200 bg-yellow-50 text-yellow-700">
                  W trakcie realizacji
                </Badge>
              )}
              {incident.status === 'pending' && (
                <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-700">
                  Oczekujące
                </Badge>
              )}
            </div>

            <div>
              <div className="mb-1 text-gray-500">Służba odpowiedzialna</div>
              <div className="text-gray-900">
                {getServiceLabel(incident.service, getCurrentLocale())}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 text-gray-500" />
              <div>
                <div className="text-gray-500">Data zgłoszenia</div>
                <div className="text-gray-900">{formatPolishDate(incident.createdAt)}</div>
              </div>
            </div>

            <div>
              <div className="mb-1 text-gray-500">Opis zgłoszenia</div>
              <p className="text-gray-900">{incident.description}</p>
            </div>

            <div>
              <div className="mb-1 text-gray-500">Adres</div>
              <div className="flex items-start gap-2 text-gray-900">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span>{incident.address}</span>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-6 lg:border-l lg:border-border/70 lg:pl-8">
            <h3 className="font-semibold text-gray-900">Zdjęcia</h3>

            {incident.imageUrl || incident.resolvedImageUrl ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {incident.imageUrl && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-gray-500">
                        <ImageIcon className="h-4 w-4" />
                        Zdjęcie zgłoszenia
                      </div>
                      <img
                        src={incident.imageUrl}
                        alt="Zdjęcie incydentu"
                        className="h-72 w-full rounded-lg border bg-gray-50 object-contain"
                      />
                    </div>
                  )}

                  {incident.resolvedImageUrl && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-gray-500">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Zdjęcie po naprawie
                      </div>
                      <img
                        src={incident.resolvedImageUrl}
                        alt="Zdjęcie po rozwiązaniu"
                        className="h-72 w-full rounded-lg border bg-gray-50 object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Brak zdjęć dla tego zgłoszenia.</p>
            )}

            {incident.resolvedAt && (
              <div className="border-t pt-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                  <div>
                    <div className="text-gray-500">Data rozwiązania</div>
                    <div className="text-gray-900">{formatPolishDate(incident.resolvedAt)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
