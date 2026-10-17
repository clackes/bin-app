# Cestino — guida

App personale per iPhone: decidi una foto/video alla volta cosa tenere e cosa eliminare.
Gratis, senza App Store, senza abbonamenti, senza internet.

- In alto scegli la sezione: **Foto** o **Video** (ognuna con quanti ne restano da vedere)
- Sotto le schede, **⇅** sceglie da dove partire: più recenti, più vecchi, un album (anche quelli automatici di iOS: Screenshot, Selfie, Preferiti…) e, per i video, i più lunghi prima. Ogni sezione ricorda la sua scelta finché l'app è aperta.
- **Swipe a destra** (o ✓) → tieni
- **Swipe a sinistra** (o ✕) → finisce nel cestino
- **↶** tra i due pulsanti → annulla l'ultima scelta
- **🗑 N** in alto a destra → elimina davvero tutto il cestino, foto e video insieme (iOS chiede conferma una volta sola per tutto il blocco; le foto restano 30 giorni in **Eliminati di recente**). "Rimetti in coda" svuota il cestino senza eliminare nulla.
- **🔒** in alto a sinistra → riepilogo privacy
- Nei video: **tocca** per attivare/disattivare l'audio
- **Tieni premuto il titolo "Cestino"** → ricomincia da capo (dimentica cosa hai già tenuto, non elimina nulla)

## Privacy

- **Niente rete:** l'app non contiene codice che usa internet. Nessun server, account o statistiche.
- **Nessuna copia:** foto e video vengono letti dalla libreria e mostrati con la cache disattivata: niente copie su disco, nulla resta in memoria dopo lo swipe.
- **Il cestino non viene mai salvato:** vive solo in memoria finché l'app è aperta. Se la chiudi prima di toccare 🗑, si svuota e non viene eliminato nulla.
- **Unica cosa salvata:** l'elenco degli ID (codici tipo `ph://ABC-123`) degli elementi che hai deciso di **tenere**, così non te li ripropone. Niente immagini, date o posizioni. Tieni premuto "Cestino" per cancellarlo.
- La firma con Apple ID gratuito serve solo a far girare l'app sul tuo iPhone: Apple non riceve le foto né il codice.

---

## Installazione sull'iPhone (Apple ID gratuito, l'app dura 7 giorni)

Si compila sul **Mac** con Xcode (già installato) e si installa sull'iPhone via cavo. Sul telefono servono circa **40 MB** liberi.

### Una volta sola

1. Attiva Xcode come strumento di sviluppo (chiede la password del Mac):

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

2. Apri **Xcode** una volta, accetta la licenza e lascia installare i componenti iOS se li propone.
3. **Xcode → Settings → Accounts → +** → accedi con il tuo Apple ID.
4. Collega l'iPhone al Mac col cavo, sbloccalo e tocca **Autorizza questo computer**.
5. Sull'iPhone: **Impostazioni → Privacy e sicurezza → Modalità sviluppatore → attiva** (il telefono si riavvia).

### Installare (e reinstallare ogni 7 giorni)

Dalla cartella del progetto, con l'iPhone collegato:

```bash
npx expo run:ios --device --configuration Release
```

- Scegli il tuo iPhone dalla lista.
- Se chiede un **Team** di firma, scegli il tuo nome (*Personal Team*).
- Se dice che il bundle id `com.clackes.cestino` non è disponibile, cambialo in `app.json` (es. `com.tuonome.cestino2`) e rilancia.

Al primo avvio sull'iPhone: **Impostazioni → Generale → VPN e gestione dispositivi → il tuo Apple ID → Autorizza**. Poi apri **Cestino** e scegli **Consenti accesso completo**.

`Release` crea un'app autonoma: funziona anche con il Mac spento. Dopo 7 giorni non si apre più: ricollega il telefono e rilancia lo stesso comando (gli ID salvati restano).

### Liberare spazio sul Mac

Ogni build lascia file temporanei in Xcode (anche qualche GB). Per cancellarli:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData
```

---

## Struttura del codice

```
App.tsx              schermate, coda, cestino, eliminazione
src/SwipeCard.tsx    carta con swipe (PanResponder + Animated)
src/MediaView.tsx    foto / video (expo-image, expo-video)
src/OrderPicker.tsx  scelta dell'ordine (data, durata, album)
src/storage.ts       salvataggio dei soli ID degli elementi tenuti
app.json             nome, bundle id, testi dei permessi
```

Controlli prima di ricompilare dopo una modifica:

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

## Problemi comuni

- **Non c'è l'ordinamento per Persone:** Apple non dà alle app accesso al riconoscimento dei volti di Foto. Alternativa: in Foto crea un album con quella persona e sceglilo con ⇅.

- **Vedo solo alcune foto:** hai dato accesso limitato. Tocca il banner giallo, oppure Impostazioni → Cestino → Foto → Accesso completo.
- **Foto su iCloud lente a comparire:** vengono scaricate al momento, serve connessione.
- **"Sviluppatore non autorizzato":** ripeti l'autorizzazione in VPN e gestione dispositivi.
- **Errori di firma in Xcode:** controlla di aver fatto il passo 3 (account in Xcode) e di aver scelto il Personal Team.
- **Errori strani dopo aver cambiato `app.json`:** `npx expo prebuild --clean` e rilancia il comando di installazione.
