# Bin

A personal iOS app for cleaning up your photo library: one photo or video at a time, **swipe right to keep, left to bin**, then a single deletion confirmed by the system.

Free, no App Store and no subscriptions: install it on your own iPhone with a free Apple ID (the app lasts 7 days, then you reinstall it).

## Privacy

- No networking code: no servers, accounts or analytics.
- Photos and videos are shown with no cache: no copies on disk.
- The bin only lives in memory and is never saved.
- The only thing kept on the phone is the list of IDs of the items you kept, so they are not shown again.

## Stack

Expo SDK 58 (React Native), `expo-media-library`, `expo-image`, `expo-video`, swiping with `PanResponder` + `Animated`.

## Installation

See [GUIDE.md](GUIDE.md).
