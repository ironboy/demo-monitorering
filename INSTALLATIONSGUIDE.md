# Monitorering av en Node.js-app med Prometheus och Grafana

Den här guiden visar hur du sätter upp och kör en e-handelsapp med inbyggd monitorering. Appen exponerar mätvärden (metrics) i Prometheus-format, som sedan samlas in av Prometheus och visualiseras i Grafana via Docker.

Läs mer allmänt om Prometheus-monitorering här: https://blog.risingstack.com/node-js-performance-monitoring-with-prometheus

## Förutsättningar

- Node.js (version 18 eller senare)
- Git
- Docker Desktop (se installationssteg nedan)

## Steg 1: Klona och starta appen

Börja med att klona repot och installera beroenden:

```bash
git clone https://github.com/ironboy/demo-monitorering.git
cd demo-monitorering
npm install
```

Starta appen:

```bash
npm start
```

Appen körs nu på **http://localhost:5001**. Du kan verifiera att den fungerar genom att öppna den adressen i webbläsaren -- du bör se e-handelsappens gränssnitt.

### Testa att metrics fungerar

Besök **http://localhost:5001/metrics** i webbläsaren. Du bör se en lång lista med text i Prometheus-format, till exempel:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/:table",status_code="200"} 3
```

Det här är de mätvärden som Prometheus kommer att hämta automatiskt.

### Vilka mätvärden exponeras?

Appen samlar in följande:

- **http_requests_total** -- antal HTTP-förfrågningar (per metod, route och statuskod)
- **http_request_duration_seconds** -- svarstider som histogram (med percentiler)
- **http_active_requests** -- antal pågående förfrågningar just nu
- **db_query_duration_seconds** -- hur lång tid databasfrågor tar (per SQL-operation och tabell)
- **login_attempts_total** -- antal inloggningsförsök (lyckade och misslyckade)
- **acl_denials_total** -- antal nekade åtkomstförsök
- Dessutom samlas Node.js-standardmått in automatiskt: minnesanvändning, CPU-tid, event loop-latens med mera.

## Steg 2: Installera Docker Desktop

Gå till **https://www.docker.com/products/docker-desktop/** och ladda ner installationsprogrammet för ditt operativsystem. Kör den nedladdade filen och följ installationsguiden.

När installationen är klar, starta Docker Desktop. Vänta tills ikonen i menyraden/systemfältet visar att Docker är igång (det kan ta en halv minut första gången).

Verifiera att Docker fungerar genom att köra:

```bash
docker --version
```

Du bör se något i stil med `Docker version 28.x.x`.

## Steg 3: Starta Prometheus och Grafana

I projektet finns en färdig `docker-compose.yml` som konfigurerar två containrar: Prometheus (samlar in metrics) och Grafana (visualiserar dem).

Se till att du står i projektmappen och kör:

```bash
docker compose up -d
```

Första gången laddas Docker-images ner, vilket kan ta en stund. När kommandot är klart körs:

- **Prometheus** på **http://localhost:9090**
- **Grafana** på **http://localhost:3000**

### Hur hänger det ihop?

Appen (Node.js) exponerar mätvärden på `/metrics`. Prometheus, som körs i en Docker-container, är konfigurerad att hämta dessa mätvärden var femte sekund. Grafana, i en annan container, läser data från Prometheus och visar det i en dashboard.

Konfigurationen för Prometheus finns i filen `prometheus.yml` i projektroten. Där pekar vi ut appens adress så att Prometheus vet var den ska hämta metrics:

```yaml
global:
  scrape_interval: 5s

scrape_configs:
  - job_name: 'app'
    static_configs:
      - targets: ['host.docker.internal:5001']
```

Adressen `host.docker.internal` är en speciell DNS-adress som Docker tillhandahåller så att containrar kan nå tjänster som körs direkt på värdmaskinen.

## Steg 4: Verifiera att Prometheus samlar in data

Öppna **http://localhost:9090** i webbläsaren. Prometheus har ett inbyggt webbgränssnitt där du kan köra queries och se grafer direkt.

I sökfältet (query-fältet) högst upp, skriv:

```
http_requests_total
```

Klicka på **Execute**. Om allt fungerar bör du se mätvärden med labels som `method`, `route` och `status_code`. Klicka på fliken **Graph** för att se en enkel graf.

Testa fler queries i Prometheus-gränssnittet:

- `rate(http_requests_total[1m])` -- antal förfrågningar per sekund den senaste minuten.
- `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[1m]))` -- 95:e percentilen av svarstider.
- `process_resident_memory_bytes` -- appens minnesanvändning.

Prometheus webbgränssnitt är bra för att snabbt testa queries, men ganska grundläggande visuellt. Det är därför vi även kör Grafana, som ger snyggare dashboards med flera paneler, färger och automatisk uppdatering.

### Prometheus HTTP API

Prometheus exponerar även ett HTTP API som returnerar JSON. Det är detta API som Grafana använder bakom kulisserna för att hämta data. Du kan testa det direkt i webbläsaren:

- **Instant query:** http://localhost:9090/api/v1/query?query=http_requests_total
- **Lista alla metrics:** http://localhost:9090/api/v1/label/__name__/values
- **Scrape-targets:** http://localhost:9090/api/v1/targets

Under **Status > Targets** i webbgränssnittet kan du kontrollera att targeten visar `UP`. Om den visar `DOWN`, kontrollera att appen verkligen körs på port 5001.

## Steg 5: Logga in i Grafana och öppna dashboarden

Öppna **http://localhost:3000** i webbläsaren. Logga in med:

- **Användare:** admin
- **Lösenord:** admin

(Du kan välja att hoppa över steget att byta lösenord.)

Gå till **Dashboards** i vänstermenyn. Där hittar du en färdig dashboard som heter **E-Commerce App Monitoring**. Klicka på den.

### Vad visar dashboarden?

Dashboarden innehåller följande paneler:

**Rad 1 -- HTTP-trafik:**
- *Request Rate* -- antal förfrågningar per sekund, uppdelat per route och metod.
- *Request Duration* -- svarstider som p50 (median) och p95 (95:e percentilen).

**Rad 2 -- Nyckeltal:**
- *Requests Total* -- totalt antal förfrågningar sedan appen startade.
- *Active Requests* -- hur många förfrågningar som behandlas just nu.
- *Error Rate* -- andel svar med statuskod 4xx eller 5xx.
- *Login Attempts* -- antal inloggningsförsök.
- *ACL Denials* -- antal nekade åtkomstförsök.

**Rad 3 -- Databas:**
- *DB Query Duration* -- genomsnittlig tid per databasfråga, uppdelat per tabell och operation.
- *DB Queries per Second* -- antal databasfrågor per sekund.

**Rad 4 -- Node.js-runtime:**
- *Memory Usage* -- processens minnesanvändning (RSS och heap).
- *Event Loop Lag* -- latens i Node.js event loop (p50 och p99).

Dashboarden uppdateras automatiskt var femte sekund.

## Steg 6: Generera trafik och se resultatet

För att se intressanta grafer behöver appen få lite trafik. Öppna e-handelsappen på **http://localhost:5001** och klicka runt: bläddra bland produkter, lägg saker i varukorgen, testa att logga in.

Du kan också generera trafik via terminalen:

```bash
# Hämta produkter
curl http://localhost:5001/api/products

# Hämta en specifik produkt
curl http://localhost:5001/api/products/1

# Visa varukorgen
curl http://localhost:5001/api/cart

# Försök nå en skyddad route (ger ACL-denial)
curl -X DELETE http://localhost:5001/api/users/1
```

Gå tillbaka till Grafana-dashboarden och se hur graferna uppdateras i realtid.

## Starta och stoppa

### Stoppa allt

```bash
# Stoppa Docker-containrarna
docker compose down

# Stoppa appen med Ctrl+C i terminalen där den körs
```

### Starta allt igen

```bash
npm start &
docker compose up -d
```

## Felsökning

**Appen startar inte:**
Kontrollera att port 5001 inte redan används. Kör `lsof -i :5001` för att se om något annat lyssnar på porten.

**Prometheus visar target som DOWN:**
Kontrollera att appen körs och att `http://localhost:5001/metrics` svarar. Docker-containrar använder `host.docker.internal` för att nå värdmaskinen -- detta fungerar automatiskt med Docker Desktop på macOS och Windows.

**Grafana visar "No data":**
Vänta en minut och generera lite trafik mot appen. Prometheus behöver minst ett par scrapes (var femte sekund) och rate-beräkningar behöver minst en minuts data för att visa värden.

**Docker-kommandot hittas inte:**
Se till att Docker Desktop är startat (inte bara installerat). Docker CLI:t fungerar bara när Docker Desktop körs.
