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

function SelectedImagePreview({ file }: Readonly<{ file: File }>) {
  return (
    <img
      ref={(element) => {
        if (element === null) return;
        const previewUrl = URL.createObjectURL(file);
        element.src = previewUrl;
        return () => URL.revokeObjectURL(previewUrl);
      }}
      alt="Podgląd"
      className="w-full h-48 object-cover rounded-lg"
    />
  );
}

export function IncidentImageField({ value, errors, onChange }: Readonly<IncidentImageFieldProps>) {
  const { t } = useTranslation();
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Label htmlFor="image">Zdjęcie (opcjonalne)</Label>
      {value === null ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
          <input
            id="image"
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
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
          <label htmlFor="image" className="cursor-pointer flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="text-gray-600">Kliknij, aby dodać zdjęcie</span>
            <span id="image-size-hint" className="text-gray-400">
              PNG, JPG lub JPEG (maks. 5 MB)
            </span>
          </label>
        </div>
      ) : (
        <div className="relative">
          <SelectedImagePreview
            key={`${value.name}:${value.size}:${value.lastModified}`}
            file={value}
          />
          <button
            type="button"
            aria-label="Usuń wybrane zdjęcie"
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
