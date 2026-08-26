# Handoff lokalnych obrazów z Docker Compose do K3s

## Status

K3s pozostaje opcjonalnym drugim profilem po ustabilizowaniu Docker Compose. Faza 11 nie
certyfikuje K3s i nie przywraca rozbudowanego Kubernetes. Dokument określa sposób
przeniesienia dokładnie tych samych, lokalnie zbudowanych artefaktów bez obowiązkowego
publicznego registry.

## Wariant pojedynczego hosta

Na checkoutcie dokładnego tagu budujemy natywnie obrazy przez `pnpm build:production`.
Po przejściu walidacji referencje z `images.env` można przekazać do containerd K3s:

```bash
docker image save \
  zglosto/authorization:<tag> \
  zglosto/backend:<tag> \
  zglosto/database:<tag> \
  zglosto/frontend:<tag> \
  zglosto/llm-gateway:<tag> \
  zglosto/nginx:<tag> \
  zglosto/pgbouncer:<tag> \
  zglosto/rabbitmq:<tag> |
  gzip > zglosto-images.tar.gz

gzip -dc zglosto-images.tar.gz | sudo k3s ctr images import -
```

Przed importem i po nim operator porównuje osiem referencji oraz ID/digesty z manifestem
kandydata. Manifesty K3s muszą używać tych dokładnych tagów i `imagePullPolicy:
IfNotPresent` albo `Never`; nie wolno zastępować ich `latest`.

## Wariant wielowęzłowy

Każdy węzeł musi mieć obraz zgodny ze swoją architekturą. Dla małego klastra są dwie
wspieralne przyszłe drogi:

1. import właściwego archiwum natywnego na każdy węzeł przed rolloutem;
2. prywatne registry dostępne wyłącznie w sieci klastra, jeśli liczba węzłów uzasadni
   koszt operacyjny.

Nie łączymy artefaktów `amd64` i `arm64` przez QEMU na jednym hoście. Każda architektura
buduje własny natywny zestaw z tego samego tagu Git, a zgodność źródła potwierdza revision
w manifeście.

## Granica faz

Faza 12 ma zweryfikować import, rollout, odtworzenie noda, trwałe wolumeny, backup/restore,
sekrety, TLS i zachowanie modułów na rzeczywistym K3s. Do tego czasu K3s nie blokuje
wydania profilu Compose. Ogólny Kubernetes pozostaje zamrożony do świadomej decyzji
wynikającej z realnej skali wdrożeń.
