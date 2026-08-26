import type { IncidentStatusCode } from '@zglosto/contracts';
import { Calendar, CheckCircle2, Clock3, ImageIcon, MapPin, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { getServiceBadgeStyle, getServiceShortLabel } from '../config/services';
import { getCurrentLocale } from '../i18n';
import { getIncidentStatusLabel } from '../lib/incident-status';
import type { Incident } from '../types/incident';
import { formatPolishDate } from '../utils/dateUtils';
import {
  INCIDENT_STATUS_BADGE_CLASS_NAMES,
  INCIDENT_STATUS_CARD_CLASS_NAMES,
} from './incident-status-styles';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface IncidentCardProps {
  incident: Incident;
  onClick?: (incident: Incident) => void;
}

function IncidentStatusIcon({ status }: Readonly<{ status: IncidentStatusCode }>) {
  if (status === 'reported') return <Clock3 aria-hidden="true" />;
  if (status === 'in_progress') return <Wrench aria-hidden="true" />;
  return <CheckCircle2 aria-hidden="true" />;
}

export function IncidentCard({ incident, onClick }: IncidentCardProps) {
  const { t } = useTranslation();
  const cardImageUrl =
    incident.adminStatus === 'resolved'
      ? (incident.resolvedImageUrl ?? incident.imageUrl)
      : incident.imageUrl;

  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${
        INCIDENT_STATUS_CARD_CLASS_NAMES[incident.adminStatus]
      }`}
      onClick={() => onClick && onClick(incident)}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            {/* Service and Status */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge style={getServiceBadgeStyle(incident.service)}>
                {getServiceShortLabel(incident.service, getCurrentLocale())}
              </Badge>
              <Badge
                variant="outline"
                className={INCIDENT_STATUS_BADGE_CLASS_NAMES[incident.adminStatus]}
              >
                <IncidentStatusIcon status={incident.adminStatus} />
                {getIncidentStatusLabel(incident.adminStatus)}
              </Badge>
              {cardImageUrl !== null && (
                <span
                  className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground md:hidden"
                  title={t(($) => $.incidents.imageAlt)}
                >
                  <ImageIcon aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{t(($) => $.incidents.imageAlt)}</span>
                </span>
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
            <div className="flex flex-col items-start gap-2 text-gray-500 md:flex-row md:items-center md:gap-4">
              <div className="flex items-center gap-1">
                <Calendar className="size-4 shrink-0" />
                <span>
                  {t(($) => $.incidents.reportedAt, { date: formatPolishDate(incident.createdAt) })}
                </span>
              </div>
              {incident.resolvedAt && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    {t(($) => $.incidents.resolvedAt, {
                      date: formatPolishDate(incident.resolvedAt),
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Image */}
          {cardImageUrl !== null && (
            <div className="hidden shrink-0 md:block">
              <img
                src={cardImageUrl}
                alt={t(($) => $.incidents.imageAlt)}
                loading="lazy"
                decoding="async"
                className="size-24 rounded-lg object-cover"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
