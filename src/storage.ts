import AsyncStorage from '@react-native-async-storage/async-storage';

// The only thing written to disk: the IDs (opaque strings like "ph://ABC-123") of the
// items you chose to KEEP, so they are not shown again. Never images, thumbnails,
// metadata or locations. Nothing about what you send to the bin is saved:
// the bin only lives in memory and empties when you close the app.
export type Section = 'photo' | 'video';

const KEPT_KEYS: Record<Section, string> = {
  photo: 'bin.keptIds.photo',
  video: 'bin.keptIds.video',
};

async function readIds(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function writeIds(key: string, ids: Iterable<string>) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Not critical: at worst you will see a few photos again.
  }
}

export const loadKeptIds = (s: Section) => readIds(KEPT_KEYS[s]);
export const saveKeptIds = (s: Section, ids: Iterable<string>) => writeIds(KEPT_KEYS[s], ids);

export async function clearAll() {
  await AsyncStorage.multiRemove(Object.values(KEPT_KEYS));
}
