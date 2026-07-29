Place PNG/ICNS icons here before running `pnpm tauri build`.
Required files: 32x32.png, 128x128.png, icon.icns

To regenerate from icon.svg:
  1) sips -s format png icon.svg --out icon-1024.png -z 1024 1024
  2) cd apps/desktop && pnpm tauri icon src-tauri/icons/icon-1024.png -o src-tauri/icons

The macOS menu bar uses the separate monochrome template icon.
To regenerate it after editing tray-icon-template.svg:
  sips -s format png tray-icon-template.svg --out tray-icon-template.png -z 36 36
