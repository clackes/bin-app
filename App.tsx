import * as MediaLibrary from 'expo-media-library/legacy';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_ORDER, OrderPicker, orderKey, orderLabel, orderQuery, type Order } from './src/OrderPicker';
import { BackCard, SwipeCard, type Decision, type SwipeCardHandle } from './src/SwipeCard';
import {
  clearAll,
  dropLegacyKeptIds,
  loadKeptIds,
  loadLegacyKeptIds,
  purgeLegacyTrash,
  saveKeptIds,
  type Section,
} from './src/storage';

type Asset = MediaLibrary.Asset;
type HistoryEntry = { asset: Asset; decision: Decision };

const PAGE_SIZE = 60;
const PREFETCH_BELOW = 5;

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <PermissionGate />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function PermissionGate() {
  const [permission, requestPermission] = MediaLibrary.usePermissions({
    granularPermissions: ['photo', 'video'],
  });

  if (!permission) return <ActivityIndicator style={styles.center} color="#fff" />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Cestino</Text>
        <Text style={styles.body}>
          Per mostrarti foto e video l'app deve leggere la libreria. Nulla esce dal telefono, nessuna foto viene copiata e di quelle che scarti non resta traccia.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        >
          <Text style={styles.primaryBtnText}>
            {permission.canAskAgain ? 'Consenti accesso' : 'Apri Impostazioni'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return <Reviewer limited={permission.accessPrivileges === 'limited'} />;
}

const SECTIONS: { key: Section; label: string; type: MediaLibrary.MediaTypeValue }[] = [
  { key: 'photo', label: 'Foto', type: MediaLibrary.MediaType.photo },
  { key: 'video', label: 'Video', type: MediaLibrary.MediaType.video },
];

const sectionOf = (a: Asset): Section => (a.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo');

async function countAssets(type: MediaLibrary.MediaTypeValue) {
  const page = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: type });
  return page.totalCount;
}

// Stato condiviso tra le sezioni: cestino, elementi già tenuti, conteggi.
function Reviewer({ limited }: { limited: boolean }) {
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('photo');
  const [orders, setOrders] = useState<Record<Section, Order>>({ photo: DEFAULT_ORDER, video: DEFAULT_ORDER });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trash, setTrash] = useState<Asset[]>([]);
  const [totals, setTotals] = useState<Record<Section, number>>({ photo: 0, video: 0 });
  const [deleting, setDeleting] = useState(false);
  // Cambiarlo rimonta la coda della sezione (ricarica da capo saltando i già visti).
  const [deckKey, setDeckKey] = useState(0);
  // Gli ID tenuti stanno in un ref (possono essere migliaia); questo forza il ricalcolo dei conteggi.
  const [, setKeptVersion] = useState(0);

  const kept = useRef<Record<Section, Set<string>>>({ photo: new Set(), video: new Set() });
  const trashRef = useRef(trash);
  useEffect(() => {
    trashRef.current = trash;
  }, [trash]);

  const refreshTotals = useCallback(async () => {
    try {
      const [photo, video] = await Promise.all(SECTIONS.map((s) => countAssets(s.type)));
      setTotals({ photo, video });
    } catch {
      // I conteggi sono solo informativi.
    }
  }, []);

  // Avvio: recupera gli ID degli elementi tenuti. Il cestino parte sempre vuoto.
  useEffect(() => {
    (async () => {
      kept.current = {
        photo: new Set(await loadKeptIds('photo')),
        video: new Set(await loadKeptIds('video')),
      };
      // Migra la lista unica della prima versione nelle due sezioni.
      const legacy = await loadLegacyKeptIds();
      if (legacy.length > 0) {
        for (const id of legacy) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
            kept.current[sectionOf(info)].add(id);
          } catch {
            // Elemento non più esistente.
          }
        }
        await saveKeptIds('photo', kept.current.photo);
        await saveKeptIds('video', kept.current.video);
        await dropLegacyKeptIds();
      }
      await purgeLegacyTrash();
      await refreshTotals();
      setReady(true);
    })();
  }, [refreshTotals]);

  const isReviewed = useCallback(
    (a: Asset) => kept.current[sectionOf(a)].has(a.id) || trashRef.current.some((t) => t.id === a.id),
    [],
  );

  const setKept = useCallback((a: Asset, value: boolean) => {
    const s = sectionOf(a);
    if (value) kept.current[s].add(a.id);
    else kept.current[s].delete(a.id);
    saveKeptIds(s, kept.current[s]);
    setKeptVersion((v) => v + 1);
  }, []);

  const addToTrash = useCallback((a: Asset) => setTrash((t) => [...t, a]), []);
  const removeFromTrash = useCallback((a: Asset) => setTrash((t) => t.filter((x) => x.id !== a.id)), []);

  const emptyTrash = () => {
    if (trash.length === 0 || deleting) return;
    const photos = trash.filter((a) => sectionOf(a) === 'photo').length;
    const videos = trash.length - photos;
    Alert.alert(
      `Eliminare ${trash.length} elementi?`,
      `${photos} foto e ${videos} video. Il telefono ti chiederà conferma. Su iPhone finiscono in "Eliminati di recente" per 30 giorni.\n\n"Rimetti in coda" svuota il cestino senza eliminare nulla.`,
      [
        {
          text: 'Rimetti in coda',
          onPress: () => {
            setTrash([]);
            setDeckKey((k) => k + 1);
          },
        },
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const ok = await MediaLibrary.deleteAssetsAsync(trash);
              if (ok) {
                setTrash([]);
                setDeckKey((k) => k + 1);
                refreshTotals();
              }
            } catch (e) {
              // L'utente ha negato la conferma di sistema, o errore: il cestino resta com'è.
              Alert.alert('Non eliminato', String(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const resetAll = () => {
    Alert.alert('Ricominciare da capo?', 'Dimentica cosa hai già tenuto: rivedrai tutto. Non elimina nulla.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Ricomincia',
        style: 'destructive',
        onPress: async () => {
          await clearAll();
          kept.current = { photo: new Set(), video: new Set() };
          setKeptVersion((v) => v + 1);
          setTrash([]);
          setDeckKey((k) => k + 1);
        },
      },
    ]);
  };

  const remaining = (s: Section) =>
    Math.max(0, totals[s] - kept.current[s].size - trash.filter((a) => sectionOf(a) === s).length);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable style={styles.infoBtn} onPress={showPrivacy}>
            <Text style={styles.infoText}>🔒</Text>
          </Pressable>
        </View>
        <Pressable style={styles.headerCenter} onLongPress={resetAll}>
          <Text style={styles.headerTitle}>Cestino</Text>
        </Pressable>
        <View style={[styles.headerSide, styles.headerRight]}>
          <Pressable style={[styles.trashBtn, trash.length === 0 && styles.dimBg]} onPress={emptyTrash}>
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.trashText}>🗑 {trash.length}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        {SECTIONS.map((s) => {
          const active = s.key === section;
          return (
            <Pressable
              key={s.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setSection(s.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{s.label}</Text>
              <Text style={[styles.tabCount, active && styles.tabTextActive]}>
                {ready ? `${remaining(s.key)} da vedere` : ' '}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.orderChip} onPress={() => setPickerOpen(true)}>
        <Text style={styles.orderText} numberOfLines={1}>
          ⇅ {orderLabel(orders[section])}
        </Text>
      </Pressable>

      <OrderPicker
        visible={pickerOpen}
        section={section}
        current={orders[section]}
        onSelect={(o) => setOrders((prev) => ({ ...prev, [section]: o }))}
        onClose={() => setPickerOpen(false)}
      />

      {limited ? (
        <Pressable onPress={() => MediaLibrary.presentPermissionsPickerAsync()}>
          <Text style={styles.banner}>
            Accesso limitato: vedi solo alcuni elementi. Tocca per sceglierne altri, o dai accesso completo da
            Impostazioni.
          </Text>
        </Pressable>
      ) : null}

      {ready ? (
        <Deck
          key={`${section}-${orderKey(orders[section])}-${deckKey}`}
          section={section}
          order={orders[section]}
          trashCount={trash.length}
          isReviewed={isReviewed}
          setKept={setKept}
          addToTrash={addToTrash}
          removeFromTrash={removeFromTrash}
        />
      ) : (
        <ActivityIndicator style={styles.center} color="#fff" />
      )}
    </View>
  );
}

type DeckProps = {
  section: Section;
  order: Order;
  trashCount: number;
  isReviewed: (a: Asset) => boolean;
  setKept: (a: Asset, value: boolean) => void;
  addToTrash: (a: Asset) => void;
  removeFromTrash: (a: Asset) => void;
};

// Coda di una sola sezione. Viene rimontata (key) quando cambi sezione.
function Deck({ section, order, trashCount, isReviewed, setKept, addToTrash, removeFromTrash }: DeckProps) {
  const [queue, setQueue] = useState<Asset[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const cursor = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const cardRef = useRef<SwipeCardHandle>(null);
  const mediaType = SECTIONS.find((s) => s.key === section)!.type;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const fresh: Asset[] = [];
      // Salta le pagine già viste finché non trova qualcosa di nuovo.
      while (hasMoreRef.current && fresh.length < 20) {
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          after: cursor.current,
          mediaType,
          ...orderQuery(order),
        });
        cursor.current = page.endCursor;
        hasMoreRef.current = page.hasNextPage;
        for (const a of page.assets) {
          if (!isReviewed(a)) fresh.push(a);
        }
      }
      setQueue((q) => {
        const seen = new Set(q.map((a) => a.id));
        return [...q, ...fresh.filter((a) => !seen.has(a.id))];
      });
    } catch (e) {
      Alert.alert('Errore', `Non riesco a leggere la libreria: ${String(e)}`);
    } finally {
      setHasMore(hasMoreRef.current);
      loadingRef.current = false;
      setLoading(false);
    }
  }, [mediaType, order, isReviewed]);

  useEffect(() => {
    if (queue.length < PREFETCH_BELOW) loadMore();
  }, [queue.length, loadMore]);

  const decide = (asset: Asset, decision: Decision) => {
    setQueue((q) => q.filter((a) => a.id !== asset.id));
    setHistory((h) => [...h.slice(-49), { asset, decision }]);
    if (decision === 'keep') setKept(asset, true);
    else addToTrash(asset);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    if (last.decision === 'keep') setKept(last.asset, false);
    else removeFromTrash(last.asset);
    setQueue((q) => [last.asset, ...q.filter((a) => a.id !== last.asset.id)]);
  };

  const top = queue[0];
  const next = queue[1];
  const finished = !loading && !hasMore && queue.length === 0;
  const noun = section === 'photo' ? 'foto' : 'video';

  return (
    <>
      <View style={styles.deck}>
        {finished ? (
          <View style={styles.center}>
            <Text style={styles.title}>Finito! 🎉</Text>
            <Text style={styles.body}>
              {order.kind === 'album'
                ? `Non ci sono altri ${noun} da rivedere in "${order.title}".`
                : `Non ci sono altri ${noun} da rivedere.`}
              {trashCount > 0 ? `\nHai ${trashCount} elementi nel cestino: tocca 🗑 in alto per eliminarli.` : ''}
            </Text>
          </View>
        ) : !top ? (
          <ActivityIndicator style={styles.center} color="#fff" />
        ) : (
          <>
            {next ? <BackCard key={`back-${next.id}`} asset={next} /> : null}
            <SwipeCard key={top.id} ref={cardRef} asset={top} onDecision={(d) => decide(top, d)} />
          </>
        )}
      </View>

      <Text style={styles.meta}>{top ? describe(top) : ' '}</Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.roundBtn, { borderColor: '#FF453A' }]}
          onPress={() => cardRef.current?.swipe('trash')}
          disabled={!top}
        >
          <Text style={[styles.roundText, { color: '#FF453A' }]}>✕</Text>
        </Pressable>
        <Pressable style={styles.undoBtn} onPress={undo} disabled={history.length === 0}>
          <Text style={[styles.iconText, history.length === 0 && styles.dim]}>↶</Text>
        </Pressable>
        <Pressable
          style={[styles.roundBtn, { borderColor: '#34C759' }]}
          onPress={() => cardRef.current?.swipe('keep')}
          disabled={!top}
        >
          <Text style={[styles.roundText, { color: '#34C759' }]}>✓</Text>
        </Pressable>
      </View>
    </>
  );
}

function showPrivacy() {
  Alert.alert(
    'Le tue foto restano tue',
    [
      '• Nessuna connessione: l\'app non ha codice di rete, niente server, account o statistiche.',
      '• Le foto vengono mostrate leggendole dalla libreria, senza copie né cache su disco.',
      '• Il cestino vive solo in memoria: non viene mai scritto da nessuna parte. Se chiudi l\'app si svuota senza eliminare nulla.',
      '• L\'unica cosa salvata sul telefono è l\'elenco degli ID (codici tipo "ph://…") delle foto che hai deciso di tenere, per non riproportele. Tieni premuto "Cestino" per cancellarlo.',
    ].join('\n\n'),
  );
}

function describe(a: Asset) {
  const date = new Date(a.creationTime).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return a.mediaType === MediaLibrary.MediaType.video ? `Video · ${date}` : `Foto · ${date}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E0E10' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 12 },
  body: { color: '#AEAEB2', fontSize: 16, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  primaryBtn: { backgroundColor: '#0A84FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  headerSide: { width: 80 },
  headerRight: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 9 },
  tabActive: { backgroundColor: '#3A3A3C' },
  tabText: { color: '#8E8E93', fontSize: 15, fontWeight: '700' },
  tabCount: { color: '#8E8E93', fontSize: 12 },
  tabTextActive: { color: '#fff' },
  infoBtn: { width: 40, height: 40, justifyContent: 'center' },
  infoText: { fontSize: 20 },
  undoBtn: { width: 48, height: 72, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontSize: 28 },
  dim: { opacity: 0.3 },
  trashBtn: {
    minWidth: 64,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF453A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dimBg: { backgroundColor: '#3A3A3C' },
  trashText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  orderChip: {
    alignSelf: 'center',
    maxWidth: '90%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
  },
  orderText: { color: '#0A84FF', fontSize: 14, fontWeight: '600' },
  banner: {
    color: '#FFD60A',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  deck: { flex: 1, marginHorizontal: 12, marginTop: 4 },
  meta: { color: '#AEAEB2', fontSize: 14, textAlign: 'center', marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28, paddingVertical: 16 },
  roundBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  roundText: { fontSize: 32, fontWeight: '800' },
});
