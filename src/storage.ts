import AsyncStorage from '@react-native-async-storage/async-storage';

// Unica cosa scritta su disco: gli ID (stringhe opache tipo "ph://ABC-123") degli
// elementi che hai deciso di TENERE, per non riproporteli. Mai immagini, anteprime,
// metadati o posizioni. Di ciò che mandi nel cestino non viene salvato nulla:
// il cestino vive solo in memoria e si svuota quando chiudi l'app.
export type Section = 'photo' | 'video';

const KEPT_KEYS: Record<Section, string> = {
  photo: 'cestino.keptIds.photo',
  video: 'cestino.keptIds.video',
};
// Prima versione: un'unica lista senza distinzione foto/video.
const LEGACY_KEPT_KEY = 'cestino.keptIds';
// Prima versione: salvava anche gli ID del cestino. Oggi viene solo cancellato.
const LEGACY_TRASH_KEY = 'cestino.trashIds';

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
    // Non critico: al massimo rivedrai qualche foto.
  }
}

export const loadKeptIds = (s: Section) => readIds(KEPT_KEYS[s]);
export const saveKeptIds = (s: Section, ids: Iterable<string>) => writeIds(KEPT_KEYS[s], ids);
export const loadLegacyKeptIds = () => readIds(LEGACY_KEPT_KEY);
export const dropLegacyKeptIds = () => AsyncStorage.removeItem(LEGACY_KEPT_KEY);
export const purgeLegacyTrash = () => AsyncStorage.removeItem(LEGACY_TRASH_KEY);

export async function clearAll() {
  await AsyncStorage.multiRemove([...Object.values(KEPT_KEYS), LEGACY_KEPT_KEY, LEGACY_TRASH_KEY]);
}
