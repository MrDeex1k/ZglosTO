import { AlertCircle, CheckCircle, Phone } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

export type SubmissionAlertType = 'success' | 'emergency' | 'review' | 'error';

interface SubmissionAlertProps {
  isOpen: boolean;
  type: SubmissionAlertType;
  title: string;
  message: string;
  onContinue: () => void;
}

export function SubmissionAlert({
  isOpen,
  type,
  title,
  message,
  onContinue,
}: Readonly<SubmissionAlertProps>) {
  const borderClass =
    type === 'success'
      ? 'border-success border-2'
      : type === 'emergency'
        ? 'border-brand-primary border-2'
        : type === 'review'
          ? 'border-warning border-2'
          : 'border-destructive border-2';
  const actionClass =
    type === 'success'
      ? 'bg-success hover:bg-success/90'
      : type === 'emergency'
        ? 'bg-brand-primary hover:bg-brand-primary/90'
        : type === 'review'
          ? 'bg-warning hover:bg-warning/90'
          : 'bg-destructive hover:bg-destructive/90';
  const titleClass =
    type === 'success'
      ? 'text-success'
      : type === 'emergency'
        ? 'text-brand-primary'
        : type === 'review'
          ? 'text-warning'
          : 'text-destructive';

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onContinue();
      }}
    >
      <AlertDialogContent className={borderClass}>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {type === 'success' && <CheckCircle className="w-8 h-8 text-success" />}
            {type === 'emergency' && <Phone className="w-8 h-8 text-brand-primary" />}
            {type === 'review' && <AlertCircle className="w-8 h-8 text-warning" />}
            {type === 'error' && <AlertCircle className="w-8 h-8 text-destructive" />}
            <AlertDialogTitle className={titleClass}>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-gray-700 text-base">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction className={actionClass} onClick={onContinue}>
            Przejdź dalej
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
