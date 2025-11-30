import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Upload,
  X,
  AlertCircle,
  CheckCircle,
  Phone,
  Loader2,
} from "lucide-react";
import type { Incident } from "../App";
import { createIncident, queryLLM } from "../services/api";

interface IncidentFormProps {
  onSubmit: (
    incident: Omit<Incident, "id" | "status" | "createdAt">,
  ) => void;
}

const services = [
  "Miejskie Przedsiębiorstwo Energetyki Cieplnej",
  "Miejskie Przedsiębiorstwo Komunikacyjne",
  "Zakład Gospodarki Komunalnej",
  "Pogotowie Kanalizacyjne",
  "Zarząd Dróg",
  "Inne",
];

export function IncidentForm({ onSubmit }: IncidentFormProps) {
  const [service, setService] = useState<string>("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{
    service: string;
    description: string;
    address: string;
    email: string;
    imageUrl?: string;
    checked: boolean;
    adminStatus: 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY';
  } | null>(null);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    type: "success" | "emergency" | "error";
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  // Auto-close alert after 10 seconds
  useEffect(() => {
    let timeoutId: number;

    if (alertState.isOpen) {
      timeoutId = setTimeout(() => {
        setAlertState((prev) => ({ ...prev, isOpen: false }));
      }, 10000); // 10 seconds
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [alertState.isOpen]);

  // Handle successful submission after alert closes
  useEffect(() => {
    if (
      !alertState.isOpen &&
      pendingSubmit &&
      (alertState.type === "success" || alertState.type === "emergency")
    ) {
      onSubmit(pendingSubmit);
      setPendingSubmit(null);
    }
  }, [alertState.isOpen, pendingSubmit, onSubmit, alertState.type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!service || !description || !address || !email) {
      setAlertState({
        isOpen: true,
        type: "error",
        title: "Błąd",
        message: "Proszę wypełnić wszystkie wymagane pola",
      });
      return;
    }

    // Validate email contains @
    if (!email.includes("@")) {
      setAlertState({
        isOpen: true,
        type: "error",
        title: "Błąd",
        message:
          'Proszę podać prawidłowy adres email (musi zawierać znak "@")',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Query LLM to classify the incident
      const llmClassification = await queryLLM(description);

      // Prepare image as base64 (without the data:image/...;base64, prefix)
      let imageBase64: string | undefined;
      if (imagePreview) {
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64Match = imagePreview.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          imageBase64 = base64Match[1];
        }
      }

      // Always save the incident to the backend (regardless of LLM classification)
      await createIncident({
        opis_zgloszenia: description,
        mail_zglaszajacego: email,
        adres_zgloszenia: address,
        typ_sluzby: service,
        zdjecie_incydentu_zglaszanego: imageBase64,
        llm_odpowiedz: llmClassification,
      });

      if (llmClassification === 'SŁUŻBY RATUNKOWE') {
        // Emergency services should handle this - show emergency alert
        setAlertState({
          isOpen: true,
          type: "emergency",
          title: "Pomoc ratunkowa",
          message:
            "Zgłoszenie zostało zarejestrowane. Na podstawie analizy Twojego zgłoszenia, sprawą powinny się zająć służby ratunkowe. Zadzwoń pod numer alarmowy 112!",
        });
      } else {
        // Success - city services will handle this
        setAlertState({
          isOpen: true,
          type: "success",
          title: "Sukces",
          message: "Zgłoszenie zostało pomyślnie wysłane i zarejestrowane w systemie!",
        });
      }

      // Store data for pendingSubmit callback
      setPendingSubmit({
        service,
        description,
        address,
        email,
        imageUrl: imagePreview || undefined,
        checked: false,
        adminStatus: 'ZGŁOSZONY',
      });

      // Reset form
      setService("");
      setDescription("");
      setAddress("");
      setEmail("");
      setImageFile(null);
      setImagePreview(null);

    } catch (error) {
      console.error('Error submitting incident:', error);
      setAlertState({
        isOpen: true,
        type: "error",
        title: "Błąd wysyłania",
        message:
          "Nie udało się wysłać zgłoszenia. Spróbuj ponownie później.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Service Selection */}
      <div className="space-y-2">
        <Label htmlFor="service">
          Wybierz służbę <span className="text-red-500">*</span>
        </Label>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger id="service">
            <SelectValue placeholder="Wybierz właściwą służbę" />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="address">
          Adres <span className="text-red-500">*</span>
        </Label>
        <Input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="np. ul. Główna 123, Warszawa"
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">
          Opis zgłoszenia{" "}
          <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opisz szczegółowo problem..."
          rows={5}
          required
        />
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">
          Email <span className="text-red-500">*</span>
        </Label>
        <Input
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="np. jan.kowalski@example.com"
          type="email"
          required
        />
      </div>

      {/* Image Upload */}
      <div className="space-y-2">
        <Label htmlFor="image">Zdjęcie (opcjonalne)</Label>
        {!imagePreview ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
            <input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            <label
              htmlFor="image"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="w-8 h-8 text-gray-400" />
              <span className="text-gray-600">
                Kliknij, aby dodać zdjęcie
              </span>
              <span className="text-gray-400">
                PNG, JPG lub JPEG (maks. 10MB)
              </span>
            </label>
          </div>
        ) : (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Podgląd"
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Wysyłanie...
            </>
          ) : (
            "Wyślij zgłoszenie"
          )}
        </Button>
      </div>

      {/* Alert Dialog */}
      <AlertDialog
        open={alertState.isOpen}
        onOpenChange={() =>
          setAlertState({ ...alertState, isOpen: false })
        }
      >
        <AlertDialogContent
          className={
            alertState.type === "success"
              ? "border-green-500 border-2"
              : alertState.type === "emergency"
                ? "border-blue-500 border-2"
                : "border-red-500 border-2"
          }
        >
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              {alertState.type === "success" && (
                <CheckCircle className="w-8 h-8 text-green-500" />
              )}
              {alertState.type === "emergency" && (
                <Phone className="w-8 h-8 text-blue-500" />
              )}
              {alertState.type === "error" && (
                <AlertCircle className="w-8 h-8 text-red-500" />
              )}
              <AlertDialogTitle
                className={
                  alertState.type === "success"
                    ? "text-green-600"
                    : alertState.type === "emergency"
                      ? "text-blue-600"
                      : "text-red-600"
                }
              >
                {alertState.title}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-gray-700 text-base">
              {alertState.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className={
                alertState.type === "success"
                  ? "bg-green-500 hover:bg-green-600"
                  : alertState.type === "emergency"
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-red-500 hover:bg-red-600"
              }
            >
              Przejdź dalej
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}