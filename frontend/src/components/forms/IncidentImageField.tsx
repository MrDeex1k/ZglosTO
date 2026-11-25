import { INCIDENT_IMAGE_MAX_BYTES } from '@zglosto/contracts';
import { Upload, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label } from '../ui/label';
import { FieldErrors } from './field-errors';

interface IncidentImageFieldProps {
  value: File | null;
  errors: readonly unknown[];
  onChange: (value: File | null) => void;
}

function SelectedImagePreview({ file, alt }: Readonly<{ file: File; alt: string }>) {
  return (
    <img
      ref={(element) => {
        if (element === null) return;
        const previewUrl = URL.createObjectURL(file);
        element.src = previewUrl;
        return () => URL.revokeObjectURL(previewUrl);
      }}
      alt={alt}
      className="w-full h-48 object-cover rounded-lg"
    />
  );
}

export function IncidentImageField({ value, errors, onChange }: Readonly<IncidentImageFieldProps>) {
  const { t } = useTranslation();
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {value === null ? (
        <Label htmlFor="image">{t(($) => $.incidents.reportForm.image.label)}</Label>
      ) : (
        <p>{t(($) => $.incidents.reportForm.image.label)}</p>
      )}
      {value === null ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
          <input
            id="image"
            type="file"
            accept="image/png,image/jpeg"
            className="peer sr-only"
            aria-describedby="image-size-hint image-file-error imageFile-errors"
            aria-invalid={fileError !== null || errors.length > 0}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > INCIDENT_IMAGE_MAX_BYTES) {
                setFileError(t(($) => $.incidents.image.tooLarge));
                event.currentTarget.value = '';
                return;
              }
              setFileError(null);
              onChange(file);
            }}
          />
          <label
            htmlFor="image"
            className="cursor-pointer flex flex-col items-center gap-2 rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
          >
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="text-gray-600">{t(($) => $.incidents.reportForm.image.choose)}</span>
            <span id="image-size-hint" className="text-gray-400">
              {t(($) => $.incidents.reportForm.image.hint)}
            </span>
          </label>
        </div>
      ) : (
        <div className="relative">
          <SelectedImagePreview
            key={`${value.name}:${value.size}:${value.lastModified}`}
            file={value}
            alt={t(($) => $.incidents.reportForm.image.preview)}
          />
          <button
            type="button"
            aria-label={t(($) => $.incidents.reportForm.image.remove)}
            onClick={() => {
              setFileError(null);
              onChange(null);
            }}
            className="absolute top-2 right-2 bg-destructive text-white p-1 rounded-full hover:bg-destructive/90 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {fileError === null ? null : (
        <p id="image-file-error" role="alert" className="text-sm text-destructive">
          {fileError}
        </p>
      )}
      <FieldErrors id="imageFile-errors" errors={errors} />
    </div>
  );
}
