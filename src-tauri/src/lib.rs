use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewWindowBuilder, WebviewUrl, Emitter};

struct AppState {
    current_state: Mutex<serde_json::Value>,
}

#[tauri::command]
fn get_state(state: State<AppState>) -> serde_json::Value {
    state.current_state.lock().unwrap().clone()
}

#[tauri::command]
fn set_state(state: serde_json::Value, app_state: State<AppState>, app: AppHandle) {
    *app_state.current_state.lock().unwrap() = state.clone();
    app.emit("state-changed", state).unwrap();
}

#[tauri::command]
async fn open_presentation_window(app: AppHandle, monitor_index: Option<usize>) {
    if let Some(window) = app.get_webview_window("presentation") {
        window.set_focus().unwrap();
    } else {
        // Detect monitors
        let monitors = app.available_monitors().unwrap_or_default();
        
        // Use requested monitor, or second monitor if available, otherwise primary
        let target_monitor = if let Some(idx) = monitor_index {
            monitors.get(idx).or(monitors.get(1)).unwrap_or(&monitors[0])
        } else if monitors.len() > 1 {
            &monitors[1]
        } else {
            &monitors[0]
        };
        
        let pos = target_monitor.position();

        let window = WebviewWindowBuilder::new(
            &app,
            "presentation",
            WebviewUrl::App("?view=presentation".into())
        )
        .title("Scripture Presentation")
        .position(pos.x as f64, pos.y as f64)
        .fullscreen(true)
        .decorations(false)
        .build()
        .unwrap();

        let app_handle = app.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                app_handle.emit("presentation-closed", ()).unwrap();
            }
        });
    }
}

#[tauri::command]
async fn close_presentation_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("presentation") {
        window.close().unwrap();
    }
}

#[tauri::command]
async fn list_monitors(app: AppHandle) -> Vec<serde_json::Value> {
    let monitors = app.available_monitors().unwrap_or_default();
    monitors.iter().enumerate().map(|(i, m)| {
        serde_json::json!({
            "index": i,
            "name": m.name().unwrap_or(&format!("Monitor {}", i)),
            "width": m.size().width,
            "height": m.size().height
        })
    }).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            current_state: Mutex::new(serde_json::json!({})),
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_state,
            open_presentation_window,
            close_presentation_window,
            list_monitors
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(main_window) = app.get_webview_window("main") {
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        if let Some(presentation) = handle.get_webview_window("presentation") {
                            let _ = presentation.close();
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
