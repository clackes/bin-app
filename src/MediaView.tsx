import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  asset: MediaLibrary.Asset;
  // Only the top card plays videos; the card underneath shows the still frame.
  active: boolean;
};

export function MediaView({ asset, active }: Props) {
  const isVideo = asset.mediaType === MediaLibrary.MediaType.video;
  const [videoUri, setVideoUri] = useState<string | null>(null);

  useEffect(() => {
    if (!isVideo || !active) return;
    let cancelled = false;
    (async () => {
      // On Android asset.uri is already a playable file.
      // On iOS it is "ph://...", so ask for the local URI (downloaded from iCloud if needed).
      if (Platform.OS === 'android') {
        setVideoUri(asset.uri);
        return;
      }
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
        if (!cancelled && info.localUri) setVideoUri(info.localUri);
      } catch {
        // Keep showing the still frame.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset, isVideo, active]);

  return (
    <View style={styles.fill}>
      {/* Read from the library and shown with no cache at all: no copies on disk, nothing kept in memory after the swipe. */}
      <Image
        source={{ uri: asset.uri }}
        style={styles.fill}
        contentFit="contain"
        cachePolicy="none"
        recyclingKey={asset.id}
      />
      {isVideo && active && videoUri ? <InlineVideo uri={videoUri} /> : null}
      {isVideo ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>▶ {formatDuration(asset.duration)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function InlineVideo({ uri }: { uri: string }) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={() => {
        // The player is an imperative native object, so it is mutated directly.
        // eslint-disable-next-line react-hooks/immutability
        player.muted = !muted;
        setMuted(!muted);
      }}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <VideoView player={player} style={styles.fill} contentFit="contain" nativeControls={false} />
      </View>
      <View style={styles.mute} pointerEvents="none">
        <Text style={styles.badgeText}>{muted ? '🔇 tap for sound' : '🔊'}</Text>
      </View>
    </Pressable>
  );
}

function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mute: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
