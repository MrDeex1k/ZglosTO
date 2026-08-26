# @zglosto/i18n

Wspólny, niezależny od UI kontrakt językowy ZgłośTO. Pakiet zawiera katalogi `pl-PL` i `en`,
resolver locale, fabrykę izolowanych instancji i18next oraz formatowanie `Intl` wymuszające
strefę `Europe/Warsaw`.

Katalog polski jest źródłem kształtu typów, a katalog angielski musi zawierać identyczne
klucze. React i React Native używają osobnych adapterów, ale współdzielą ten pakiet.

Ogólne teksty produktu należą do tego pakietu. Lokalizowane treści konkretnego miasta,
takie jak nazwa, kontakt, stopka i komunikat prawny, należą do konfiguracji White Label.
