import { Building2, UserRound } from 'lucide-react';

import { Card, CardContent } from './ui/card';

interface UserSummaryCardProps {
  displayName: string;
  serviceLabel: string | null;
}

export function UserSummaryCard({ displayName, serviceLabel }: Readonly<UserSummaryCardProps>) {
  return (
    <Card className="mb-8 py-0 shadow-sm">
      <CardContent className="space-y-3 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <UserRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gray-500" />
          <p className="leading-6 text-gray-600">
            Zalogowano jako: <span className="font-semibold text-gray-900">{displayName}</span>
          </p>
        </div>
        {serviceLabel === null ? null : (
          <div className="flex items-start gap-3">
            <Building2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gray-500" />
            <p className="leading-6 text-gray-600">
              Służba: <span className="font-semibold text-gray-900">{serviceLabel}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
