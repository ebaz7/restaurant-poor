#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Force WebView2 to disable stale HTTP/disk cache and enable direct kiosk thermal printing
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--kiosk-printing --disable-print-preview --disable-http-cache --disable-cache --disk-cache-size=1",
    );

    // 2. Auto-purge stale WebView2 cache on Windows if app version changed or upgraded
    if let Some(proj_dirs) = std::env::var_os("LOCALAPPDATA") {
        let app_dir = std::path::PathBuf::from(proj_dirs).join("com.arkasystem.pos.enterprise.v2");
        let ver_file = app_dir.join("installed_version.txt");
        let current_ver = "2.0.0";

        let need_purge = match std::fs::read_to_string(&ver_file) {
            Ok(v) => v.trim() != current_ver,
            Err(_) => true,
        };

        if need_purge {
            let eb_cache = app_dir.join("EBWebView").join("Default").join("Cache");
            let _ = std::fs::remove_dir_all(eb_cache);

            let eb_code_cache = app_dir.join("EBWebView").join("Default").join("Code Cache");
            let _ = std::fs::remove_dir_all(eb_code_cache);

            let eb_sw = app_dir.join("EBWebView").join("Default").join("Service Worker");
            let _ = std::fs::remove_dir_all(eb_sw);

            let _ = std::fs::create_dir_all(&app_dir);
            let _ = std::fs::write(&ver_file, current_ver);
        }
    }

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
