import * as MediaLibrary from 'expo-media-library/legacy';
import { useImperativeHandle, useState, type Ref } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import { MediaView } from './MediaView';

export type Decision = 'keep' | 'trash';
export type SwipeCardHandle = { swipe: (d: Decision) => void };

const SCREEN_W = Dimensions.get('window').width;
const THRESHOLD = SCREEN_W * 0.28;

type Props = {
  asset: MediaLibrary.Asset;
  onDecision: (d: Decision) => void;
  ref?: Ref<SwipeCardHandle>;
};

export function SwipeCard({ asset, onDecision, ref }: Props) {
  // A card lives for a single item (key = asset.id), so the initial onDecision is enough.
  const [{ pos, flyOut, responder }] = useState(() => {
    const pos = new Animated.ValueXY();
    let done = false;
    const springBack = () => Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    const flyOut = (d: Decision) => {
      if (done) return;
      done = true;
      Animated.timing(pos, {
        toValue: { x: (d === 'keep' ? 1 : -1) * SCREEN_W * 1.5, y: 0 },
        duration: 220,
        useNativeDriver: true,
      }).start(() => onDecision(d));
    };
    const responder = PanResponder.create({
      // Taps go to children (e.g. video sound); a swipe only starts on horizontal movement.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => pos.setValue({ x: g.dx, y: g.dy * 0.3 }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD || g.vx > 0.8) flyOut('keep');
        else if (g.dx < -THRESHOLD || g.vx < -0.8) flyOut('trash');
        else springBack();
      },
      onPanResponderTerminate: springBack,
    });
    return { pos, flyOut, responder };
  });

  useImperativeHandle(ref, () => ({ swipe: flyOut }), [flyOut]);

  const rotate = pos.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const keepOpacity = pos.x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const trashOpacity = pos.x.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[styles.card, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }]}
    >
      <MediaView asset={asset} active />
      <Animated.View style={[styles.stamp, styles.keepStamp, { opacity: keepOpacity }]} pointerEvents="none">
        <Text style={[styles.stampText, { color: '#34C759' }]}>KEEP</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.trashStamp, { opacity: trashOpacity }]} pointerEvents="none">
        <Text style={[styles.stampText, { color: '#FF453A' }]}>DELETE</Text>
      </Animated.View>
    </Animated.View>
  );
}

// Card under the active one: preview only, no gestures.
export function BackCard({ asset }: { asset: MediaLibrary.Asset }) {
  return (
    <View style={[styles.card, styles.back]} pointerEvents="none">
      <MediaView asset={asset} active={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  back: { transform: [{ scale: 0.95 }], opacity: 0.6 },
  stamp: {
    position: 'absolute',
    top: 40,
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  keepStamp: { left: 24, borderColor: '#34C759', transform: [{ rotate: '-15deg' }] },
  trashStamp: { right: 24, borderColor: '#FF453A', transform: [{ rotate: '15deg' }] },
  stampText: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
});
