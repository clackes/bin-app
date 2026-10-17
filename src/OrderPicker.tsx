import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Section } from './storage';

export type Order =
  | { kind: 'newest' }
  | { kind: 'oldest' }
  | { kind: 'longest' }
  | { kind: 'album'; id: string; title: string };

export const DEFAULT_ORDER: Order = { kind: 'newest' };

export function orderKey(o: Order) {
  return o.kind === 'album' ? `album:${o.id}` : o.kind;
}

export function orderLabel(o: Order) {
  switch (o.kind) {
    case 'newest':
      return 'Newest first';
    case 'oldest':
      return 'Oldest first';
    case 'longest':
      return 'Longest first';
    case 'album':
      return `Album: ${o.title}`;
  }
}

// Parameters for getAssetsAsync. Inside an album, newest comes first.
export function orderQuery(o: Order): Pick<MediaLibrary.AssetsOptions, 'sortBy' | 'album'> {
  switch (o.kind) {
    case 'newest':
      return { sortBy: [[MediaLibrary.SortBy.creationTime, false]] };
    case 'oldest':
      return { sortBy: [[MediaLibrary.SortBy.creationTime, true]] };
    case 'longest':
      return { sortBy: [[MediaLibrary.SortBy.duration, false]] };
    case 'album':
      return { album: o.id, sortBy: [[MediaLibrary.SortBy.creationTime, false]] };
  }
}

type Props = {
  visible: boolean;
  section: Section;
  current: Order;
  onSelect: (o: Order) => void;
  onClose: () => void;
};

export function OrderPicker({ visible, section, current, onSelect, onClose }: Props) {
  const [albums, setAlbums] = useState<MediaLibrary.Album[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })
      .then((list) => {
        if (cancelled) return;
        setAlbums(
          list
            .filter((a) => a.assetCount > 0)
            .sort((a, b) => a.title.localeCompare(b.title)),
        );
      })
      .catch(() => !cancelled && setAlbums([]));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const base: Order[] =
    section === 'video'
      ? [{ kind: 'newest' }, { kind: 'oldest' }, { kind: 'longest' }]
      : [{ kind: 'newest' }, { kind: 'oldest' }];
  const pick = (o: Order) => {
    onSelect(o);
    onClose();
  };
  const isCurrent = (o: Order) => orderKey(o) === orderKey(current);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.heading}>Where should I start?</Text>
        {base.map((o) => (
          <Row key={orderKey(o)} label={orderLabel(o)} selected={isCurrent(o)} onPress={() => pick(o)} />
        ))}
        <Text style={styles.subheading}>Albums</Text>
        {albums === null ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
        ) : (
          <FlatList
            data={albums}
            keyExtractor={(a) => a.id}
            style={styles.list}
            renderItem={({ item }) => {
              const o: Order = { kind: 'album', id: item.id, title: item.title };
              return (
                <Row
                  label={item.title}
                  detail={String(item.assetCount)}
                  selected={isCurrent(o)}
                  onPress={() => pick(o)}
                />
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No albums found.</Text>}
          />
        )}
      </View>
    </Modal>
  );
}

function Row({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={[styles.rowText, selected && styles.selected]} numberOfLines={1}>
        {selected ? '● ' : ''}
        {label}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  heading: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  subheading: { color: '#8E8E93', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 4 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
  },
  rowText: { flex: 1, color: '#fff', fontSize: 16 },
  selected: { color: '#0A84FF', fontWeight: '700' },
  detail: { color: '#8E8E93', fontSize: 14, marginLeft: 12 },
  empty: { color: '#8E8E93', paddingVertical: 12 },
});
