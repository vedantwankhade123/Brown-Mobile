# Offline Expo SDK 51 manifest assets

`server/www/xdl-schemas/UNVERSIONED-schema.json` is the `data` object returned by
https://api.expo.dev/v2/project/configuration/schema/51.0.0 (retrieved 2026-10-17).
It is the SDK 51 schema, despite the filename required by Expo's local schema hook.

The launcher sets `EXPO_UNIVERSE_DIR` for its Expo process. SDK 51 uses this file
to discover manifest asset fields instead of requesting the schema online.
`EXPO_OFFLINE=1` alone only shortens that request's timeout and still produces
the "Unable to resolve manifest assets" warning when the schema cache is empty.

Keep this snapshot aligned with the Expo SDK when upgrading. No files in
node_modules are patched, and no machine-wide Expo settings are changed.
