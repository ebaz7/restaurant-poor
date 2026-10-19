#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enable silent direct printing to default Windows thermal printer without showing printer selection dialog
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--kiosk-printing --disable-print-preview",
    );

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
