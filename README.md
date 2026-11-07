# HomeFlix

Il tuo "Netflix" casalingo per Raspberry Pi: scansiona una cartella di film e serie, la mostra come catalogo e la riproduce nel browser con ripresa dal punto in cui eri rimasto.

## Avvio (sul Raspberry)
```bash
# Node.js 22.13+ richiesto (SQLite è già incluso in Node, nessuna compilazione)
npm install
npm start            # http://IP-DEL-PI:3000
```
Copia i video in `media/` e premi "Aggiorna libreria".

## Organizzazione dei file
```
media/
  Inception (2010).mp4
  Breaking Bad/
    S01/Breaking Bad S01E01.mp4
    S01/Breaking Bad S01E02.mp4
```
Per le serie serve il pattern `S01E03` (oppure `1x03`). Il nome della serie è la prima cartella, o il testo prima di `S01E03` se il file è nella radice.

## Configurazione (file .env)
Copia `.env.example` in `.env` e compila i valori: `npm start` lo legge da solo. Il file `.env` non va condiviso né caricato su GitHub (è già nel `.gitignore`).

Variabili disponibili:

| Variabile | Default | Uso |
|---|---|---|
| `MEDIA_DIR` | `./media` | Cartella dei video (domani: il mount dell'SSD) |
| `DATA_DIR` | `./data` | Database SQLite |
| `PORT` | `3000` | Porta HTTP |
| `TMDB_API_KEY` | vuota | Se impostata, scarica locandine, sfondi e trame da themoviedb.org (chiave gratuita: crea un account e vai in Impostazioni > API). Senza chiave l'interfaccia usa riquadri colorati |

## Formati
Il Pi 4 non transcodifica: usa MP4 con H.264 + AAC. Per convertire un file:
```bash
ffmpeg -i input.mkv -c:v libx264 -crf 20 -c:a aac -movflags +faststart output.mp4
# se è già H.264/AAC basta il remux, istantaneo:
ffmpeg -i input.mkv -c copy -movflags +faststart output.mp4
```

## Convertire file .avi (XviD) in MP4
Richiede ffmpeg (Windows: `winget install Gyan.FFmpeg`; Linux/Pi: `sudo apt install ffmpeg`). Lo script converte ogni `.avi` in MP4 H.264 + AAC, sceglie da solo la traccia audio italiana e salva in `MEDIA_DIR` con i nomi giusti (`Serie/S01/Serie S01E01.mp4`, `Film (2010).mp4`):
```bash
npm run convert -- "C:\Video\Mr.Robot.S01.ITA.ENG.XviD" --dry-run   # prova: mostra cosa farebbe
npm run convert -- "C:\Video\Mr.Robot.S01.ITA.ENG.XviD"             # conversione vera
```
Opzioni: `--out <cartella>`, `--lang ita|eng|fre|ger|spa|jpn`, `--crf 20` (qualità, più basso = meglio), `--preset fast`. I file già convertiti vengono saltati, quindi puoi rilanciarlo senza problemi.

## Avvio automatico
Modifica il percorso in `homeflix.service` (e l'utente, se non è `pi`); la configurazione viene letta dal `.env` nella cartella del progetto. Poi:
```bash
sudo cp homeflix.service /etc/systemd/system/
sudo systemctl enable --now homeflix
```

## Collegare l'SSD in futuro
Monta il disco (es. su `/mnt/media`) e scrivi `MEDIA_DIR=/mnt/media` nel `.env`. Il database resta sulla SD, i video no.

## Sicurezza
Non c'è login: usa l'app solo in rete locale. Per vederla fuori casa installa Tailscale sul Pi e sui tuoi dispositivi, senza aprire porte sul router.
