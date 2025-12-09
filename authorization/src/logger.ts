import { appendFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ścieżka do pliku logów w folderze authorization
const LOG_FILE_PATH = join(__dirname, '..', 'auth_log.txt');

/**
 * Formatuje datę i godzinę w formacie YYYY-MM-DD HH:MM:SS
 */
function formatDateTime(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toTimeString().split(' ')[0]; // HH:MM:SS
  return `${date} ${time}`;
}

/**
 * Zapisuje log do pliku auth_log.txt
 * @param message - Wiadomość do zapisania w logu
 */
export async function writeLog(message: string): Promise<void> {
  try {
    const timestamp = formatDateTime();
    const logEntry = `[${timestamp}] ${message}\n`;
    await appendFile(LOG_FILE_PATH, logEntry, 'utf-8');
  } catch (error) {
    // W przypadku błędu zapisu do pliku, błąd jest ignorowany
  }
}

/**
 * Loguje żądanie API z informacją o sukcesie/błędzie
 * @param method - Metoda HTTP
 * @param path - Ścieżka żądania
 * @param statusCode - Kod statusu odpowiedzi
 * @param success - Czy operacja się powiodła
 * @param details - Dodatkowe szczegóły (opcjonalne)
 */
export async function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  success: boolean,
  details?: string
): Promise<void> {
  const status = success ? 'SUKCES' : 'BŁĄD';
  const detailsStr = details ? ` | ${details}` : '';
  const message = `API ${method} ${path} | Status: ${statusCode} | ${status}${detailsStr}`;
  await writeLog(message);
}

/**
 * Loguje operację autoryzacyjną
 * @param operation - Nazwa operacji (np. "Rejestracja", "Logowanie")
 * @param success - Czy operacja się powiodła
 * @param details - Dodatkowe szczegóły (opcjonalne)
 * @param error - Błąd (jeśli wystąpił)
 */
export async function logAuthOperation(
  operation: string,
  success: boolean,
  details?: string,
  error?: string
): Promise<void> {
  const status = success ? 'SUKCES' : 'BŁĄD';
  const detailsStr = details ? ` | ${details}` : '';
  const errorStr = error ? ` | Błąd: ${error}` : '';
  const message = `AUTORYZACJA: ${operation} | ${status}${detailsStr}${errorStr}`;
  await writeLog(message);
}