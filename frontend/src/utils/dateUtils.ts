// Date utility functions for handling Polish date format

/**
 * Formats a date string to Polish format "DD.MM.YYYY HH:MM"
 * If the date is already in Polish format, returns it as-is
 * Otherwise, parses it and formats it correctly
 */
export function formatPolishDate(dateString: string): string {
  // If the date is already in Polish format "DD.MM.YYYY HH:MM", return it as-is
  if (/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/.test(dateString)) {
    return dateString;
  }

  // For backward compatibility with ISO dates, try to parse and format
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Return as-is if parsing fails
    }

    // Format to Polish date format DD.MM.YYYY HH:MM
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch (error) {
    // Return original string if parsing fails
    return dateString;
  }
}

/**
 * Test function to verify date formatting works correctly
 */
export function testDateFormatting() {
  const testCases = [
    { input: '26.11.2025 15:19', expected: '26.11.2025 15:19' },
    { input: '2025-11-26T15:19:00Z', expected: '26.11.2025 15:19' },
    { input: 'Invalid Date', expected: 'Invalid Date' },
  ];

  console.log('Testing date formatting:');
  testCases.forEach(({ input, expected }) => {
    const result = formatPolishDate(input);
    const success = result === expected;
    console.log(`Input: "${input}" -> "${result}" (${success ? '✓' : '✗'})`);
  });
}
