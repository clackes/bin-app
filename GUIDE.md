# Bin — guide

A personal iPhone app: go through your photos and videos one at a time and decide what to keep and what to delete.
Free, no App Store, no subscriptions, no internet.

- At the top, pick a section: **Photos** or **Videos** (each shows how many are left to review)
- Below the tabs, **⇅** picks where to start: newest first, oldest first, an album (including the ones iOS makes automatically: Screenshots, Selfies, Favorites…) and, for videos, longest first. Each section remembers its choice while the app is open.
- **Swipe right** (or ✓) → keep
- **Swipe left** (or ✕) → goes to the bin
- **↶** between the two buttons → undo the last choice
- **🗑 N** at the top right → actually deletes everything in the bin, photos and videos together (iOS asks for confirmation once for the whole batch; items stay in **Recently Deleted** for 30 days). "Put back" empties the bin without deleting anything.
- **🔒** at the top left → privacy summary
- In videos: **tap** to turn sound on/off
- **Long-press the "Bin" title** → start over (forgets what you have already kept, deletes nothing)

## Privacy

- **No network:** the app contains no code that uses the internet. No servers, accounts or analytics.
- **No copies:** photos and videos are read from your library and shown with caching turned off: no copies on disk, nothing kept in memory after the swipe.
- **The bin is never saved:** it only lives in memory while the app is open. If you close the app before tapping 🗑, it empties and nothing is deleted.
- **The only thing saved:** the list of IDs (codes like `ph://ABC-123`) of the items you chose to **keep**, so they are not shown again. No images, dates or locations. Long-press "Bin" to clear it.
- Signing with a free Apple ID only lets the app run on your own iPhone: Apple receives neither your photos nor the code.

---

## Installing on your iPhone (free Apple ID, the app lasts 7 days)

You build on your **Mac** with Xcode and install on the iPhone over a cable. The phone needs about **40 MB** free.

### One-time setup

1. Make Xcode the active developer tool (asks for your Mac password):

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

2. Open **Xcode** once, accept the license and let it install the iOS components if it offers to.
3. **Xcode → Settings → Accounts → +** → sign in with your Apple ID.
4. Connect the iPhone to the Mac with a cable, unlock it and tap **Trust This Computer**.
5. On the iPhone: **Settings → Privacy & Security → Developer Mode → on** (the phone restarts).

### Install (and reinstall every 7 days)

From the project folder, with the iPhone connected:

```bash
npx expo run:ios --device --configuration Release
```

- Pick your iPhone from the list.
- If it asks for a signing **Team**, pick your name (*Personal Team*).
- If it says the bundle id `com.clackes.bin` is not available, change it in `app.json` (e.g. `com.yourname.bin2`) and run it again.

On first launch on the iPhone: **Settings → General → VPN & Device Management → your Apple ID → Trust**. Then open **Bin** and choose **Allow Full Access**.

`Release` builds a standalone app: it works with the Mac turned off. After 7 days it stops opening: reconnect the phone and run the same command again (the saved IDs are kept).

If you still have the older Italian version (**Cestino**) on the phone, you can delete it: Bin is a separate app.

### Freeing space on the Mac

Every build leaves temporary files in Xcode (a few GB). To delete them:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData
```

---

## Code layout

```
App.tsx              screens, queue, bin, deletion
src/SwipeCard.tsx    swipeable card (PanResponder + Animated)
src/MediaView.tsx    photo / video (expo-image, expo-video)
src/OrderPicker.tsx  order picker (date, duration, album)
src/storage.ts       saves only the IDs of kept items
app.json             name, bundle id, permission texts
```

Checks to run before rebuilding after a change:

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

## Common problems

- **There is no "People" order:** Apple does not give apps access to the face recognition in Photos. Workaround: in Photos, make an album with that person and pick it with ⇅.
- **I only see some photos:** you granted limited access. Tap the yellow banner, or go to Settings → Bin → Photos → Full Access.
- **iCloud photos are slow to appear:** they are downloaded on the spot, so you need a connection.
- **"Untrusted Developer":** trust it again in VPN & Device Management.
- **Signing errors in Xcode:** check you did step 3 (account in Xcode) and picked the Personal Team.
- **Odd errors after changing `app.json`:** run `npx expo prebuild --clean`, then the install command again.
