import * as MediaLibrary from 'expo-media-library/legacy';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_ORDER, OrderPicker, orderKey, orderLabel, orderQuery, type Order } from './src/OrderPicker';
import { BackCard, SwipeCard, type Decision, type SwipeCardHandle } from './src/SwipeCard';
import { clearAll, loadKeptIds, saveKeptIds, type Section } from './src/storage';

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
        <Text style={styles.title}>Bin</Text>
        <Text style={styles.body}>
          To show you your photos and videos, the app needs to read your library. Nothing leaves your phone, nothing is copied, and nothing you discard leaves a trace.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        >
          <Text style={styles.primaryBtnText}>
            {permission.canAskAgain ? 'Allow access' : 'Open Settings'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return <Reviewer limited={permission.accessPrivileges === 'limited'} />;
}

const SECTIONS: { key: Section; label: string; type: MediaLibrary.MediaTypeValue }[] = [
  { key: 'photo', label: 'Photos', type: MediaLibrary.MediaType.photo },
  { key: 'video', label: 'Videos', type: MediaLibrary.MediaType.video },
];

const sectionOf = (a: Asset): Section => (a.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo');

async function countAssets(type: MediaLibrary.MediaTypeValue) {
  const page = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: type });
  return page.totalCount;
}

// State shared across sections: bin, kept items, counts.
function Reviewer({ limited }: { limited: boolean }) {
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('photo');
  const [orders, setOrders] = useState<Record<Section, Order>>({ photo: DEFAULT_ORDER, video: DEFAULT_ORDER });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trash, setTrash] = useState<Asset[]>([]);
  const [totals, setTotals] = useState<Record<Section, number>>({ photo: 0, video: 0 });
  const [deleting, setDeleting] = useState(false);
  // Changing it remounts the section queue (reloads from the start, skipping reviewed items).
  const [deckKey, setDeckKey] = useState(0);
  // Kept IDs live in a ref (there can be thousands); this forces the counts to recompute.
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
      // Counts are informational only.
    }
  }, []);

  // Startup: load the IDs of kept items. The bin always starts empty.
  useEffect(() => {
    (async () => {
      kept.current = {
        photo: new Set(await loadKeptIds('photo')),
        video: new Set(await loadKeptIds('video')),
      };
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
      `Delete ${trash.length} ${trash.length === 1 ? 'item' : 'items'}?`,
      `${photos} ${photos === 1 ? 'photo' : 'photos'} and ${videos} ${videos === 1 ? 'video' : 'videos'}. Your phone will ask you to confirm. On iPhone they stay in "Recently Deleted" for 30 days.\n\n"Put back" empties the bin without deleting anything.`,
      [
        {
          text: 'Put back',
          onPress: () => {
            setTrash([]);
            setDeckKey((k) => k + 1);
          },
        },
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
              // The user declined the system prompt, or an error occurred: the bin stays as it is.
              Alert.alert('Not deleted', String(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const resetAll = () => {
    Alert.alert('Start over?', 'Forgets what you have already kept, so you will see everything again. Nothing is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start over',
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
          <Text style={styles.headerTitle}>Bin</Text>
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
                {ready ? `${remaining(s.key)} to review` : ' '}
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
            Limited access: you only see some items. Tap to pick more, or grant full access in Settings.
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

// Queue for a single section. Remounted (key) when the section or order changes.
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
      // Skip already-reviewed pages until something new turns up.
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
      Alert.alert('Error', `Could not read the library: ${String(e)}`);
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
  const noun = section === 'photo' ? 'photos' : 'videos';

  return (
    <>
      <View style={styles.deck}>
        {finished ? (
          <View style={styles.center}>
            <Text style={styles.title}>All done! 🎉</Text>
            <Text style={styles.body}>
              {order.kind === 'album'
                ? `No more ${noun} to review in "${order.title}".`
                : `No more ${noun} to review.`}
              {trashCount > 0 ? `\nYou have ${trashCount} ${trashCount === 1 ? 'item' : 'items'} in the bin: tap 🗑 at the top to delete them.` : ''}
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
    'Your photos stay yours',
    [
      '• No connection: the app has no networking code. No servers, accounts or analytics.',
      '• Photos are shown straight from your library, with no copies and no cache.',
      '• The bin only lives in memory and is never written anywhere. If you close the app it empties without deleting anything.',
      '• The only thing saved on your phone is the list of IDs (codes like "ph://…") of the items you chose to keep, so they are not shown again. Long-press "Bin" to clear it.',
    ].join('\n\n'),
  );
}

function describe(a: Asset) {
  const date = new Date(a.creationTime).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return a.mediaType === MediaLibrary.MediaType.video ? `Video · ${date}` : `Photo · ${date}`;
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
