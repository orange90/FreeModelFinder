use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

struct SidecarState(Mutex<Option<Child>>);

fn spawn_sidecar() -> Option<Child> {
    // Prefer a `freemodelfinder-server` binary on PATH (installed via pnpm/npm),
    // otherwise fall back to `npx @freemodelfinder/server`.
    if let Ok(child) = Command::new("freemodelfinder-server")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        return Some(child);
    }
    Command::new("npx")
        .args(["-y", "@freemodelfinder/server"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

#[tauri::command]
fn restart_server(state: tauri::State<SidecarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
    *guard = spawn_sidecar();
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            // spawn sidecar
            let state = app.state::<SidecarState>();
            *state.0.lock().unwrap() = spawn_sidecar();

            // build tray menu
            let open = MenuItem::with_id(app, "open", "Open FreeModelFinder", true, None::<&str>)?;
            let restart =
                MenuItem::with_id(app, "restart", "Restart Gateway", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &restart, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("FreeModelFinder")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "restart" => {
                        let state = app.state::<SidecarState>();
                        let mut guard = state.0.lock().unwrap();
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                        *guard = spawn_sidecar();
                    }
                    "quit" => {
                        let state = app.state::<SidecarState>();
                        if let Some(mut child) = state.0.lock().unwrap().take() {
                            let _ = child.kill();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        // no-op; menu opens on right click
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![restart_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
