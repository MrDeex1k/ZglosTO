// API service for ZglosTO application

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const LLM_BASE_URL = import.meta.env.VITE_LLM_BASE_URL;

// Types for API responses
interface ApiResolvedIncident {
  id_zgloszenia: string;
  opis_zgloszenia: string;
  adres_zgloszenia: string;
  typ_sluzby: string;
  status_incydentu: string;
  zdjecie_incydentu_rozwiazanego: string | null;
  data_godzina_zgloszenia: string;
  data_godzina_rozwiazania: string;
}

interface ApiUserIncident {
  id_zgloszenia: string;
  opis_zgloszenia: string;
  mail_zglaszajacego: string;
  adres_zgloszenia: string;
  zdjecie_incydentu_zglaszanego: string | null;
  zdjecie_incydentu_rozwiazanego: string | null;
  sprawdzenie_incydentu: boolean;
  status_incydentu: string;
  typ_sluzby: string;
  llm_odpowiedz: string | null;
  data_godzina_zgloszenia: string;
  data_godzina_rozwiazania: string | null;
}

/**
 * Fetch resolved incidents for the home page
 */
export async function fetchResolvedIncidents(): Promise<ApiResolvedIncident[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty/glowna`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching resolved incidents:', error);
    throw error;
  }
}

/**
 * Fetch user incidents by email
 */
export async function fetchUserIncidents(email: string): Promise<ApiUserIncident[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty?email=${encodeURIComponent(email)}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user incidents:', error);
    throw error;
  }
}

/**
 * Create a new incident
 */
export async function createIncident(incidentData: {
  opis_zgloszenia: string;
  mail_zglaszajacego: string;
  adres_zgloszenia: string;
  typ_sluzby?: string;
  zdjecie_incydentu_zglaszanego?: string;
  llm_odpowiedz?: string;
}) {
  try {
    const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(incidentData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating incident:', error);
    throw error;
  }
}

// LLM Response types
type LLMClassification = 'SŁUŻBY MIEJSKIE' | 'SŁUŻBY RATUNKOWE';

interface LLMResponse {
  response: string;
}

/**
 * Query LLM service to classify incident
 * Returns whether the incident should be handled by city services or emergency services
 */
export async function queryLLM(prompt: string): Promise<LLMClassification> {
  try {
    const response = await fetch(`${LLM_BASE_URL}/query_message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: LLMResponse = await response.json();
    
    // LLM returns either "SŁUŻBY MIEJSKIE" or "SŁUŻBY RATUNKOWE"
    // We check if response contains the key words
    if (data.response.includes('RATUNKOWE')) {
      return 'SŁUŻBY RATUNKOWE';
    }
    
    return 'SŁUŻBY MIEJSKIE';
  } catch (error) {
    console.error('Error querying LLM:', error);
    // Default to city services if LLM fails
    return 'SŁUŻBY MIEJSKIE';
  }
}

/**
 * Check LLM service health
 */
export async function checkLLMHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${LLM_BASE_URL}/health`);
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.loaded === true;
  } catch {
    return false;
  }
}
