# HomeFlix

Il tuo "Netflix" casalingo: una webapp personale che trasforma una cartella di film e serie TV in una piattaforma di streaming, pensata per girare su un Raspberry Pi (ma funziona su qualsiasi PC con Node.js).

Apri il browser da PC, telefono o smart TV, scegli un titolo e lo guardi in streaming dalla tua rete di casa.

## Cosa fa

- **Catalogo automatico**: scansiona una cartella, riconosce film e serie dai nomi dei file e costruisce la libreria.
- **Interfaccia in stile streaming**: banner in evidenza, file di titoli a scorrimento orizzontale, schede dettaglio con stagioni ed episodi, ricerca e filtri Film / Serie TV.
- **Locandine, sfondi e trame** scaricati da [TMDB](https://www.themoviedb.org/) (opzionale, con chiave gratuita).
- **Riproduzione nel browser** con salto in avanti e indietro (il server usa le HTTP range requests, quindi non scarica tutto il file).
- **"Continua a guardare"**: ricorda il punto in cui eri rimasto e riprende da lì. Mostra una sola scheda per ogni titolo: per le serie l'ultimo episodio guardato, oppure il successivo se l'avevi finito.
- **Episodio successivo automatico** a fine puntata.
- **Convertitore incluso**: trasforma qualsiasi video (avi, mkv, mov, ts...) in MP4 compatibili con il browser, in alta qualità e senza upscaling, scegliendo da solo la traccia audio italiana.
- **Esplora per genere**: sfogli la libreria divisa per genere (Azione, Commedia, Fantascienza...) e filtri tra film e serie TV, con il pulsante "Scegli per me" che propone un titolo a caso.
- **Lista desideri**: cerca film e serie su TMDB, salvali in una lista e vedi su quali piattaforme di streaming sono disponibili nel tuo paese (dati JustWatch).
- **Aggiungere video dal browser**: carichi uno o più file, anche da telefono, e il server li converte e li aggiunge alla libreria da solo.
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
| `TMDB_REGION` | `IT` | Paese per la disponibilità in streaming (codice a due lettere). |
| `UPLOAD_DIR` | `./data/uploads` | Cartella temporanea per i caricamenti (viene svuotata a conversione finita). |

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

### Convertire qualsiasi video con lo script incluso

```bash
npm run convert -- "C:\Video\Mr.Robot.S01.ITA.ENG.XviD" --dry-run   # prova: mostra cosa farebbe
npm run convert -- "C:\Video\Mr.Robot.S01.ITA.ENG.XviD"             # conversione vera
```

Accetta una cartella (anche con sottocartelle) o un singolo file, in qualsiasi formato: `avi, mkv, mp4, m4v, mov, wmv, asf, flv, mpg, mpeg, ts, m2ts, mts, vob, webm, divx, 3gp, ogm, ogv, rmvb`. Per ogni file lo script:

- **Mantiene la qualità e la risoluzione originale**: nessun upscaling, mai. La ricodifica usa H.264 con CRF 18 (qualità visivamente trasparente).
- **Non tocca ciò che è già compatibile**: video H.264 / audio AAC vengono solo travasati in MP4, senza perdita e in pochi secondi.
- **Ricodifica solo se serve** (XviD, HEVC, MPEG-2, VC-1, 10 bit...) e corregge da solo i problemi tipici: video interlacciati dei DVD e delle registrazioni TV (deinterlaccio), pixel non quadrati dei DVD (proporzioni corrette), HDR (convertito in SDR con tone mapping, se il tuo ffmpeg ha `zscale`), dimensioni dispari.
- **Sceglie la traccia audio italiana**, prima dal metadato di lingua del file e, se manca, dall'ordine nel nome (`ITA.ENG` = prima traccia, `ENG.ITA` = seconda). Audio surround e formati come DTS/AC3 diventano AAC stereo, mentre un AAC stereo già presente viene copiato.
- **Toglie il superfluo**: sottotitoli, capitoli e metadati vengono scartati, e se nel file c'è una copertina non viene scambiata per il video.
- **Salva in `MEDIA_DIR` con i nomi giusti** (`Serie/S01/Serie S01E01.mp4`, `Film (2010).mp4`) e **salta i file già convertiti**, quindi si può rilanciare senza problemi.

Con `--dry-run` per ogni file stampa cosa farà (copia o ricodifica, e perché) e quale traccia audio sceglie.

Opzioni: `--out <cartella>`, `--lang ita|eng|fre|ger|spa|jpn`, `--crf 18` (qualità: più basso = migliore e più pesante, 16-20 consigliato), `--preset medium` (`slow` dà file un po' più piccoli a parità di qualità ma è più lento) e `--max-height 1080` (riduce solo i video più alti di così, ad esempio i 4K, per risparmiare spazio; non ingrandisce mai quelli più bassi). Conviene convertire sul PC e non sul Raspberry, che è molto più lento.

## Esplorare per genere

La scheda **Esplora** (barra in basso su telefono) divide la libreria per genere:

- filtri Tutto / Film / Serie TV e un elenco di generi. Senza scegliere un genere vedi una fila per ogni genere; scegliendone uno, la griglia dei titoli di quel genere. **Scegli per me** apre un titolo a caso tra quelli visibili. I generi arrivano da TMDB al momento della scansione, quindi servono la chiave TMDB e un "Aggiorna" dopo l'impostazione. Anche i titoli già in libreria li riceveranno alla prima scansione.

## Aggiungere titoli dall'app

Dalle schede **La mia lista** e **Aggiungi** (barra in basso su telefono):

- **La mia lista**: cerchi un titolo (serve la chiave TMDB), lo aggiungi alla lista e vedi se è in streaming, a noleggio o in vendita nel tuo paese. Se poi il titolo entra in libreria, compare l'etichetta "In libreria". La stessa informazione è nella scheda di ogni titolo.
- **Carica dal tuo dispositivo**: trascina i video nell'area tratteggiata (o toccala per sceglierli), controlli l'elenco con le barre di avanzamento, scegli la lingua dell'audio e avvii. Il caricamento avviene dal browser, poi il server converte con lo stesso script di `npm run convert` e aggiorna la libreria.
- **Attività**: nella scheda Aggiungi vedi in diretta ogni lavoro con la sua barra. Da qualsiasi schermata, un indicatore in basso segnala che c'è qualcosa in corso e una notifica ti avvisa quando un titolo è pronto. Mostra lo stato di caricamenti e conversioni. Il server lavora un file alla volta, per non sovraccaricare il Raspberry.

Per i titoli che non hai, la lista desideri ti dice dove guardarli legalmente.

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
│   ├── tmdb.js        ricerca titoli e piattaforme di streaming
│   ├── jobs.js        coda di caricamenti e conversioni
│   ├── db.js          database SQLite (titoli, file, progressi)
│   └── scan-cli.js    scansione da riga di comando (npm run scan)
├── public/
│   └── index.html     interfaccia web (un solo file, senza build)
├── scripts/
│   └── convert.js     convertitore di qualsiasi video in MP4
├── media/             i tuoi video (ignorata da Git)
├── .env.example       modello di configurazione
└── homeflix.service   servizio systemd per il Raspberry
```

Le API principali, se vuoi collegarci altro: `GET /api/titles`, `GET /api/titles/:id`, `GET /api/continue`, `PUT /api/progress/:fileId`, `POST /api/scan` e `GET /stream/:fileId`. Per le funzioni di aggiunta: `GET /api/discover`, `GET /api/providers`, `GET|POST|DELETE /api/wishlist`, `POST /api/upload` e `GET /api/jobs`.

## Sicurezza

**HomeFlix non ha un login**: chiunque raggiunga la porta del server può guardare e usare l'app. Usalo solo nella rete di casa e non aprire la porta sul router. Per guardarlo anche fuori casa installa [Tailscale](https://tailscale.com/) sul Raspberry e sui tuoi dispositivi: crea una rete privata senza esporre nulla a internet.

Per lo stesso motivo, **chiunque sulla rete può anche caricare file e avviare conversioni** dalla scheda Aggiungi: un motivo in più per non esporre la porta a internet.

Non pubblicare mai il file `.env` (contiene la chiave TMDB): è già escluso da Git insieme a `media/`, `data/` e `node_modules/`.

## Limiti attuali e idee future

- Nessun login né profili utente: i progressi di visione sono unici per tutta l'app.
- Nessun supporto ai sottotitoli, e nessun selettore della traccia audio nel player.
- Le serie sono riconosciute solo con `S01E03` o `1x03` nel nome.
- Il convertitore scarta i sottotitoli incorporati.

Idee: login semplice, sottotitoli WebVTT, selettore audio, scansione automatica quando compaiono nuovi file.

## Note

Questo progetto è per uso personale. Locandine e metadati provengono da TMDB; se pubblichi il progetto, l'uso dell'API TMDB richiede di riportare l'attribuzione prevista dai [termini d'uso](https://www.themoviedb.org/terms-of-use): *"This product uses the TMDB API but is not endorsed or certified by TMDB."*
