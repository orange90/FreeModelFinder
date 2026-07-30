The desktop preparation step generates PNG/ICNS icons under `generated/`
before running `pnpm tauri build`.

To regenerate from icon.svg:
  cd apps/desktop && pnpm run prepare-icons

The macOS menu bar uses the separate monochrome template icon.
To regenerate it after editing tray-icon-template.svg:
  sips -s format png tray-icon-template.svg --out tray-icon-template.png -z 36 36
