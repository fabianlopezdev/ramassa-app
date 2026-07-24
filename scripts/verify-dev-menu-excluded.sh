#!/usr/bin/env bash
#
# Proves the developer menu (RAPP-19) is absent from a PRODUCTION bundle.
#
# `tests/dev-menu-production-gate.test.ts` guards the source shape on every
# commit; this script is the end-to-end proof, because the shape only matters if
# Metro actually folds the `__DEV__` branches away. It exports a real production
# bundle and greps it for markers that exist ONLY inside the dev menu.
#
# It takes minutes, so it is not a pre-commit gate. Run it whenever the gate
# changes, when upgrading Expo or Metro (dead-code elimination is a bundler
# behaviour, not a language guarantee), and at each phase closure.
#
#   bash scripts/verify-dev-menu-excluded.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
MOBILE_DIR="apps/mobile"
EXPORT_DIR="$MOBILE_DIR/dist"

# Each marker appears only in dev-menu code. The seed password is the one that
# matters most: it must never reach a shipped bundle under any circumstances.
MARKERS=(
  'ramassa-dev-password'
  'Developer menu'
  'Open the developer menu'
  'dev menu forced'
  'amina.alhassan@example.test'
  'Native I18nManager.isRTL'
)

echo "==> Exporting a production bundle (this takes a few minutes)"
rm -rf "$EXPORT_DIR"
(cd "$MOBILE_DIR" && bunx expo export --platform web)

BUNDLES=$(find "$EXPORT_DIR" -name '*.js' -type f)
if [ -z "$BUNDLES" ]; then
  echo "FAIL: no JS bundle produced at $EXPORT_DIR" >&2
  exit 1
fi

echo "==> Grepping $(echo "$BUNDLES" | wc -l | tr -d ' ') bundle file(s)"
FAILED=0
for marker in "${MARKERS[@]}"; do
  # shellcheck disable=SC2086
  if grep -l -- "$marker" $BUNDLES > /dev/null 2>&1; then
    echo "FAIL: dev-menu marker present in the production bundle: $marker" >&2
    FAILED=1
  else
    echo "  ok: absent -> $marker"
  fi
done

rm -rf "$EXPORT_DIR"

if [ "$FAILED" -ne 0 ]; then
  echo "The dev menu leaked into the production bundle. Check that every reference" >&2
  echo "to @/components/dev or @/lib/dev is a require() inside a __DEV__ branch." >&2
  exit 1
fi

echo "==> PASS: the developer menu is absent from the production bundle"
