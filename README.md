# HomeFlix

Il tuo "Netflix" casalingo: una webapp personale che trasforma una cartella di film e serie TV in una piattaforma di streaming, pensata per girare su un Raspberry Pi (ma funziona su qualsiasi PC con Node.js).

Apri il browser da PC, telefono o smart TV, scegli un titolo e lo guardi in streaming dalla tua rete di casa.

## Cosa fa

- **Catalogo automatico**: scansiona una cartella, riconosce film e serie dai nomi dei file e costruisce la libreria.
- **Interfaccia in stile streaming**: banner in evidenza, file di titoli a scorrimento orizzontale, schede dettaglio con stagioni ed episodi, ricerca e filtri Film / Serie TV.
- **Locandine, sfondi e trame** scaricati da [TMDB](https://www.themoviedb.org/) (opzionale, con chiave gratuita).
- **Riproduzione nel browser** con salto in avanti e indietro (il server usa le HTTP range requests, quindi non scarica tutto il file).
- **"Continua a guardare"**: ricorda il punto in cui eri rimasto e riprende da lì.
- **Episodio successivo automatico** a fine puntata.
- **Convertitore incluso**: trasforma i vecchi `.avi` (XviD) in MP4 compatibili con il browser, scegliendo da solo la traccia audio italiana.
- **Leggero**: backend Node.js + SQLite integrato, nessun database da installare né librerie native da compilare.

## Requisiti

- **Node.js 22.13 o superiore** ([nodejs.org](https://nodejs.org)). Controlla con `node -v`.
- **ffmpeg**, solo se vuoi usare il convertitore: Windows `winget install Gyan.FFmpeg`, Linux / Raspberry `sudo apt install ffmpeg`.

## Avvio rapido

```bash
npm install
cp .env.example .env     # su Windows: copy .env.example .env
npm start
```

Poi apri **http://localhost:3000**, metti i video nella cartella `media/` e premi **Aggiorna** in alto a destra.

> **Windows / PowerShell**: se `npm` risponde che l'esecuzione di script è disabilitata, usa `npm.cmd install` e `npm.cmd start`, oppure sblocca gli script con `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

Per usarlo da un altro dispositivo della stessa rete apri `http://IP-DEL-COMPUTER:3000`. Se non si connette, di solito è il firewall che blocca la porta.

## Configurazione

Tutte le impostazioni stanno nel file `.env` (copia di `.env.example`), che viene letto all'avvio. Dopo ogni modifica riavvia il server.

| Variabile | Default | Descrizione |
|---|---|---|
| `MEDIA_DIR` | `./media` | Cartella con film e serie. Domani può essere l'SSD, per esempio `/mnt/media`. Su Windows usa le barre normali: `D:/Video`. |
| `TMDB_API_KEY` | vuota | Chiave **v3** di TMDB per locandine, sfondi e trame. Senza chiave l'app funziona con riquadri colorati. |
| `PORT` | `3000` | Porta del server. |
| `DATA_DIR` | `./data` | Dove salvare il database SQLite. |

### Ottenere la chiave TMDB (gratis)

1. Crea un account su [themoviedb.org](https://www.themoviedb.org/) e conferma l'email.
2. Vai in **Impostazioni → API** e premi **Request an API Key**, scegliendo il tipo **Developer** e compilando il modulo (uso personale).
3. Copia la **API Key (v3 auth)**, la stringa corta, non il lungo "Read Access Token", e incollala in `.env`.
4. Riavvia, premi **Aggiorna** e ricarica la pagina (`Ctrl+F5`).

## Come organizzare i file

```
media/
├── Inception (2010).mp4
└── Breaking Bad/
    └── S01/
        ├── Breaking Bad S01E01.mp4
        └── Breaking Bad S01E02.mp4
```

- **Film**: `Titolo (anno).mp4`. L'anno aiuta TMDB a trovare il film giusto.
- **Serie**: serve il pattern `S01E03` (o `1x03`) nel nome del file. Il nome della serie è la prima cartella, oppure il testo prima di `S01E03` se il file è nella radice.
- **Formati letti**: `.mp4`, `.m4v`, `.webm`, `.mkv`.

## Formati video compatibili

Il browser riproduce direttamente solo certi formati, e il Raspberry non è abbastanza potente per ricodificare al volo. Il formato sicuro è **MP4 con video H.264 e audio AAC**. File con video HEVC, audio DTS/AC3 o contenitori vecchi come AVI spesso non partono.

### Convertire i vecchi `.avi`

```bash
npm run convert -- "C:\Video\Mr.Robot.S01.ITA.ENG.XviD" --dry-run   # prova: mostra cosa farebbe
npm run convert -- "C:\Video\Mr.Robot.S01.ITA.ENG.XviD"             # conversione vera
```

Lo script:
- cerca gli `.avi` (anche nelle sottocartelle) e li converte in MP4 H.264 + AAC stereo;
- sceglie la traccia audio italiana, prima dal metadato di lingua del file e, se manca, dall'ordine nel nome (`ITA.ENG` = prima traccia, `ENG.ITA` = seconda);
- salva in `MEDIA_DIR` con i nomi giusti (`Serie/S01/Serie S01E01.mp4`, `Film (2010).mp4`);
- salta i file già convertiti, quindi si può rilanciare senza problemi.

Opzioni: `--out <cartella>`, `--lang ita|eng|fre|ger|spa|jpn`, `--crf 20` (qualità, più basso = migliore), `--preset fast`. Conviene convertire sul PC e non sul Raspberry, che è molto più lento.

Per altri formati (per esempio MKV con HEVC) il comando ffmpeg base è:

```bash
ffmpeg -i input.mkv -c:v libx264 -crf 20 -c:a aac -ac 2 -movflags +faststart output.mp4
```

## Uso dell'interfaccia

- **Home**: banner in evidenza e file di titoli. Cliccando una locandina si apre la scheda con il pulsante Riproduci / Riprendi.
- **Serie TV / Film**: elenco completo dei titoli di quel tipo.
- **Cerca**: filtra per nome mentre scrivi.
- **Aggiorna**: rilegge la cartella dei media e aggiunge o rimuove i titoli.
- **Player**: controlli personalizzati (play/pausa, ±10 secondi, barra di avanzamento, volume, schermo intero, prossimo episodio). Da telefono: tocco per mostrare/nascondere i controlli, doppio tocco ai lati per saltare di 10 secondi, schermo intero in orizzontale. Da tastiera: `Esc` chiude, `←` e `→` saltano di 10 secondi, `Spazio` pausa, `F` schermo intero, `M` muto.
- **Da telefono**: barra di navigazione in basso (Home, Serie TV, Film, Cerca) e tasto Indietro del telefono per chiudere schede e player.

## Installarlo sul Raspberry Pi

1. Installa Node.js 22.13 o superiore (il pacchetto `apt` di Raspberry OS è troppo vecchio: usa [NodeSource](https://github.com/nodesource/distributions) oppure `nvm`).
2. Copia o clona il progetto sul Pi, poi `npm install`.
3. Crea il `.env` (`cp .env.example .env`) e imposta `MEDIA_DIR`.
4. Prova con `npm start`.

**Avvio automatico all'accensione** con systemd: modifica percorso e utente in `homeflix.service`, poi:

```bash
sudo cp homeflix.service /etc/systemd/system/
sudo systemctl enable --now homeflix
```

**Collegare un SSD o un NAS in futuro**: monta il disco (per esempio su `/mnt/media`) e scrivi `MEDIA_DIR=/mnt/media` nel `.env`. Per la libreria conviene un SSD USB e non la scheda SD, che è lenta e si usura. Per guardare in alta qualità è meglio il cavo ethernet del Wi-Fi.

## Struttura del progetto

```
homeflix/
├── src/
│   ├── server.js      server web, API e streaming dei video
│   ├── scanner.js     scansione cartelle e riconoscimento dei nomi, metadati TMDB
│   ├── db.js          database SQLite (titoli, file, progressi)
│   └── scan-cli.js    scansione da riga di comando (npm run scan)
├── public/
│   └── index.html     interfaccia web (un solo file, senza build)
├── scripts/
│   └── convert.js     convertitore .avi -> .mp4
├── media/             i tuoi video (ignorata da Git)
├── .env.example       modello di configurazione
└── homeflix.service   servizio systemd per il Raspberry
```

Le API principali, se vuoi collegarci altro: `GET /api/titles`, `GET /api/titles/:id`, `GET /api/continue`, `PUT /api/progress/:fileId`, `POST /api/scan` e `GET /stream/:fileId`.

## Sicurezza

**HomeFlix non ha un login**: chiunque raggiunga la porta del server può guardare e usare l'app. Usalo solo nella rete di casa e non aprire la porta sul router. Per guardarlo anche fuori casa installa [Tailscale](https://tailscale.com/) sul Raspberry e sui tuoi dispositivi: crea una rete privata senza esporre nulla a internet.

Non pubblicare mai il file `.env` (contiene la chiave TMDB): è già escluso da Git insieme a `media/`, `data/` e `node_modules/`.

## Limiti attuali e idee future

- Nessun login né profili utente: i progressi di visione sono unici per tutta l'app.
- Nessun supporto ai sottotitoli, e nessun selettore della traccia audio nel player.
- Le serie sono riconosciute solo con `S01E03` o `1x03` nel nome.
- Il convertitore tratta solo file `.avi`.

Idee: login semplice, sottotitoli WebVTT, selettore audio, scansione automatica quando compaiono nuovi file.

## Note

Questo progetto è per uso personale. Locandine e metadati provengono da TMDB; se pubblichi il progetto, l'uso dell'API TMDB richiede di riportare l'attribuzione prevista dai [termini d'uso](https://www.themoviedb.org/terms-of-use): *"This product uses the TMDB API but is not endorsed or certified by TMDB."*
