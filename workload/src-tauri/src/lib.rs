use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Manager, State};

struct AppState {
    prevent_close: Arc<AtomicBool>,
}

/// Called by JS after the user confirms close (Save or Close without saving).
/// Clears the prevention flag so the next exit attempt goes through, then exits.
#[tauri::command]
fn confirm_and_exit(state: State<AppState>, app: tauri::AppHandle) {
    state.prevent_close.store(false, Ordering::SeqCst);
    app.exit(0);
}

/// Directly executes the JS close handler via eval — reliable alternative to events.
fn notify_js_close(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        window
            .eval("window.__tauriCloseRequested && window.__tauriCloseRequested()")
            .ok();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let prevent_close = Arc::new(AtomicBool::new(true));
    let pc_for_window = prevent_close.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState { prevent_close })
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();
            // Intercept close button click
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if pc_for_window.load(Ordering::SeqCst) {
                        api.prevent_close();
                        notify_js_close(&app_handle);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![confirm_and_exit])
        .build(tauri::generate_context!())
        .expect("error building app")
        // Intercept Quit menu / Cmd+Q
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if state.prevent_close.load(Ordering::SeqCst) {
                        api.prevent_exit();
                        notify_js_close(app_handle);
                    }
                }
            }
        });
}
