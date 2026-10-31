use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

const TABLES: &[&str] = &[
    "settings",
    "categories",
    "menuItems",
    "customers",
    "orders",
    "expenses",
    "rawMaterials",
    "warehouses",
    "recipes",
    "suppliers",
    "purchaseInvoices",
    "employees",
    "shifts",
    "appUsers",
    "auditLogs",
    "settlements",
    "accounts",
    "journalVouchers",
    "bankCheques",
    "cashRegisters",
];

struct AppServerState {
    data_dir: PathBuf,
    db_file: PathBuf,
    port_file: PathBuf,
    domain_file: PathBuf,
    active_port: u16,
    custom_domain: String,
    bound_ports: HashSet<u16>,
    db_state: Value,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn value_to_key_str(v: &Value) -> Option<String> {
    match v {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn get_record_key(table_name: &str, item: &Value) -> Option<String> {
    let obj = item.as_object()?;
    if table_name == "settings" {
        return Some("settings_singleton".to_string());
    }
    if table_name == "orders" {
        if let Some(inv) = obj.get("invoiceNumber").and_then(value_to_key_str) {
            return Some(format!("inv_{}", inv));
        }
    }
    if table_name == "journalVouchers" {
        if let Some(vnum) = obj.get("voucherNumber").and_then(value_to_key_str) {
            return Some(format!("vch_{}", vnum));
        }
    }
    if table_name == "accounts" {
        if let Some(code) = obj.get("code").and_then(value_to_key_str) {
            return Some(format!("acc_{}", code));
        }
    }
    if table_name == "appUsers" {
        if let Some(uname) = obj.get("username").and_then(value_to_key_str) {
            return Some(format!("usr_{}", uname.to_lowercase()));
        }
    }
    if let Some(id) = obj.get("id").and_then(value_to_key_str) {
        return Some(format!("id_{}", id));
    }
    None
}

fn get_record_timestamp(item: &Value) -> u64 {
    if let Some(obj) = item.as_object() {
        if let Some(ms) = obj.get("_updatedAtMs").and_then(|v| v.as_u64()) {
            return ms;
        }
        if let Some(ms) = obj.get("_updatedAtMs").and_then(|v| v.as_f64()) {
            if ms > 0.0 {
                return ms as u64;
            }
        }
    }
    0
}

fn is_deleted_in_map(
    del_table: Option<&Map<String, Value>>,
    rec_key: &str,
    item: &Value,
    item_ts: u64,
) -> bool {
    let Some(map) = del_table else {
        return false;
    };
    let mut del_at = map.get(rec_key).and_then(|v| v.as_u64()).unwrap_or(0);
    if del_at == 0 {
        if let Some(id_str) = item
            .as_object()
            .and_then(|o| o.get("id"))
            .and_then(value_to_key_str)
        {
            let id_key = format!("id_{}", id_str);
            del_at = map.get(&id_key).and_then(|v| v.as_u64()).unwrap_or(0);
            if del_at == 0 {
                del_at = map.get(&id_str).and_then(|v| v.as_u64()).unwrap_or(0);
            }
        }
    }
    del_at > 0 && (item_ts == 0 || del_at >= item_ts)
}

fn merge_database_objects(existing_db: &Value, incoming_db: &Value) -> Value {
    let mut merged = Map::new();
    let empty_map = Map::new();
    let ex_obj = existing_db.as_object().unwrap_or(&empty_map);
    let inc_obj = incoming_db.as_object().unwrap_or(&empty_map);

    // 1. Merge deletedRecords tombstones
    let mut merged_deleted = Map::new();
    let ex_deleted = ex_obj
        .get("deletedRecords")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);
    let inc_deleted = inc_obj
        .get("deletedRecords")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);

    for &t in TABLES {
        let mut t_del = Map::new();
        if let Some(ex_t) = ex_deleted.get(t).and_then(|v| v.as_object()) {
            for (k, v) in ex_t {
                if let Some(ts) = v.as_u64() {
                    t_del.insert(k.clone(), json!(ts));
                }
            }
        }
        if let Some(inc_t) = inc_deleted.get(t).and_then(|v| v.as_object()) {
            for (k, v) in inc_t {
                if let Some(ts) = v.as_u64() {
                    let prev = t_del.get(k).and_then(|pv| pv.as_u64()).unwrap_or(0);
                    if ts > prev {
                        t_del.insert(k.clone(), json!(ts));
                    }
                }
            }
        }
        if !t_del.is_empty() {
            merged_deleted.insert(t.to_string(), Value::Object(t_del));
        }
    }

    // 2. Merge each table with tombstone filtering and chronological conflict resolution
    for &table_name in TABLES {
        let ex_arr = ex_obj
            .get(table_name)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let inc_arr = inc_obj
            .get(table_name)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let del_table = merged_deleted.get(table_name).and_then(|v| v.as_object());

        if table_name == "settings" {
            let ex_first = ex_arr.first().and_then(|v| v.as_object());
            let inc_first = inc_arr.first().and_then(|v| v.as_object());
            if ex_first.is_some() || inc_first.is_some() {
                let mut s_map = Map::new();
                let ex_ts = ex_arr.first().map(get_record_timestamp).unwrap_or(0);
                let inc_ts = inc_arr.first().map(get_record_timestamp).unwrap_or(0);

                if inc_ts >= ex_ts {
                    if let Some(ef) = ex_first {
                        for (k, v) in ef {
                            s_map.insert(k.clone(), v.clone());
                        }
                    }
                    if let Some(inf) = inc_first {
                        for (k, v) in inf {
                            s_map.insert(k.clone(), v.clone());
                        }
                    }
                } else {
                    if let Some(inf) = inc_first {
                        for (k, v) in inf {
                            s_map.insert(k.clone(), v.clone());
                        }
                    }
                    if let Some(ef) = ex_first {
                        for (k, v) in ef {
                            s_map.insert(k.clone(), v.clone());
                        }
                    }
                }
                s_map.insert("id".to_string(), json!(1));
                s_map.insert(
                    "_updatedAtMs".to_string(),
                    json!(std::cmp::max(ex_ts, inc_ts).max(now_ms())),
                );
                merged.insert(table_name.to_string(), json!([Value::Object(s_map)]));
            } else {
                merged.insert(table_name.to_string(), json!([]));
            }
            continue;
        }

        let mut ordered_keys: Vec<String> = Vec::new();
        let mut by_key: std::collections::HashMap<String, Value> = std::collections::HashMap::new();

        for item in ex_arr {
            if let Some(k) = get_record_key(table_name, &item) {
                let ts = get_record_timestamp(&item);
                if is_deleted_in_map(del_table, &k, &item, ts) {
                    continue;
                }
                if !by_key.contains_key(&k) {
                    ordered_keys.push(k.clone());
                }
                by_key.insert(k, item);
            }
        }

        for item in inc_arr {
            if let Some(k) = get_record_key(table_name, &item) {
                let inc_ts = get_record_timestamp(&item);
                if is_deleted_in_map(del_table, &k, &item, inc_ts) {
                    by_key.remove(&k);
                    continue;
                }
                if let Some(ex_item) = by_key.get(&k) {
                    let ex_ts = get_record_timestamp(ex_item);
                    if inc_ts >= ex_ts {
                        let mut merged_item = ex_item.as_object().cloned().unwrap_or_default();
                        if let Some(inc_item_obj) = item.as_object() {
                            for (ik, iv) in inc_item_obj {
                                merged_item.insert(ik.clone(), iv.clone());
                            }
                        }
                        if merged_item.get("_updatedAtMs").is_none() {
                            merged_item.insert(
                                "_updatedAtMs".to_string(),
                                json!(std::cmp::max(inc_ts, ex_ts).max(now_ms())),
                            );
                        }
                        by_key.insert(k, Value::Object(merged_item));
                    }
                } else {
                    let mut new_item = item.clone();
                    if let Some(obj) = new_item.as_object_mut() {
                        if obj.get("_updatedAtMs").is_none() {
                            obj.insert("_updatedAtMs".to_string(), json!(now_ms()));
                        }
                    }
                    ordered_keys.push(k.clone());
                    by_key.insert(k, new_item);
                }
            }
        }

        let mut final_list = Vec::new();
        for k in ordered_keys {
            if let Some(v) = by_key.remove(&k) {
                final_list.push(v);
            }
        }
        merged.insert(table_name.to_string(), Value::Array(final_list));
    }

    merged.insert(
        "deletedRecords".to_string(),
        Value::Object(merged_deleted),
    );
    Value::Object(merged)
}

fn detect_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    // Primary outbound LAN IP via UDP socket connect (does not send any packets)
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip().to_string();
                if !ip.starts_with("127.") && !ip.starts_with("169.254.") {
                    ips.push(ip);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(output) = std::process::Command::new("ipconfig")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("IPv4") || line.contains("IP Address") {
                    if let Some(colon_pos) = line.find(':') {
                        let ip_part = line[colon_pos + 1..].trim();
                        let clean_ip: String = ip_part
                            .chars()
                            .take_while(|c| c.is_ascii_digit() || *c == '.')
                            .collect();
                        if clean_ip.split('.').count() == 4
                            && !clean_ip.starts_with("127.")
                            && !clean_ip.starts_with("169.254.")
                            && !ips.contains(&clean_ip)
                        {
                            ips.push(clean_ip);
                        }
                    }
                }
            }
        }
    }

    ips
}

fn get_hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Windows-POS-Server".to_string())
}

fn list_windows_printers() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            let printers: Vec<String> = text
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            if !printers.is_empty() {
                return printers;
            }
        }
    }
    vec![
        "XP-80C".to_string(),
        "POS-80".to_string(),
        "EPSON TM-T20".to_string(),
        "BIXOLON SRP-330".to_string(),
    ]
}

fn send_json_response(stream: &mut TcpStream, status_code: u16, body: &Value) {
    let status_text = match status_code {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Internal Server Error",
    };
    let json_bytes = serde_json::to_vec(body).unwrap_or_else(|_| b"{}".to_vec());
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nCache-Control: no-store, no-cache, must-revalidate\r\nConnection: close\r\n\r\n",
        status_code,
        status_text,
        json_bytes.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(&json_bytes);
    let _ = stream.flush();
}

fn send_empty_options_response(stream: &mut TcpStream) {
    let header = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nAccess-Control-Max-Age: 86400\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.flush();
}

fn spawn_listener_on_port(port: u16, shared_state: Arc<Mutex<AppServerState>>) {
    {
        let mut guard = match shared_state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        if guard.bound_ports.contains(&port) {
            return;
        }
        guard.bound_ports.insert(port);
    }

    thread::spawn(move || {
        let addr = format!("0.0.0.0:{}", port);
        if let Ok(listener) = TcpListener::bind(&addr) {
            for stream in listener.incoming().flatten() {
                let state_clone = Arc::clone(&shared_state);
                thread::spawn(move || {
                    handle_http_client(stream, state_clone);
                });
            }
        }
    });
}

fn handle_http_client(mut stream: TcpStream, shared_state: Arc<Mutex<AppServerState>>) {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(15)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(15)));

    let mut buffer = Vec::with_capacity(8192);
    let mut temp = [0u8; 4096];
    let mut header_end_idx = None;
    let mut content_length = 0usize;

    loop {
        match stream.read(&mut temp) {
            Ok(0) => break,
            Ok(n) => {
                buffer.extend_from_slice(&temp[..n]);
                if header_end_idx.is_none() {
                    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                        header_end_idx = Some(pos + 4);
                        let header_str = String::from_utf8_lossy(&buffer[..pos]);
                        for line in header_str.lines() {
                            if line.to_ascii_lowercase().starts_with("content-length:") {
                                if let Some(val) = line.split(':').nth(1) {
                                    content_length = val.trim().parse::<usize>().unwrap_or(0);
                                }
                            }
                        }
                    }
                }
                if let Some(h_end) = header_end_idx {
                    if buffer.len() >= h_end + content_length {
                        break;
                    }
                }
                if buffer.len() > 50 * 1024 * 1024 {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let Some(h_end) = header_end_idx else {
        return;
    };

    let header_str = String::from_utf8_lossy(&buffer[..h_end]);
    let first_line = header_str.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_uppercase();
    let raw_path = parts.next().unwrap_or("/");
    let path = raw_path.split('?').next().unwrap_or("/");

    if method == "OPTIONS" {
        send_empty_options_response(&mut stream);
        return;
    }

    let body_bytes = if buffer.len() >= h_end {
        &buffer[h_end..std::cmp::min(buffer.len(), h_end + content_length)]
    } else {
        &[]
    };

    match (method.as_str(), path) {
        ("GET", "/api/db/version") => {
            let guard = match shared_state.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let rev = guard
                .db_state
                .get("rev")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let updated_at = guard
                .db_state
                .get("updatedAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let has_data = guard
                .db_state
                .get("data")
                .and_then(|v| v.as_object())
                .map(|o| !o.is_empty())
                .unwrap_or(false);
            let port = guard.active_port;
            drop(guard);

            send_json_response(
                &mut stream,
                200,
                &json!({
                    "rev": rev,
                    "updatedAt": updated_at,
                    "hasData": has_data,
                    "serverTimeMs": now_ms(),
                    "port": port
                }),
            );
        }
        ("GET", "/api/db/state") => {
            let guard = match shared_state.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let mut resp = guard.db_state.clone();
            if let Some(obj) = resp.as_object_mut() {
                obj.insert("serverTimeMs".to_string(), json!(now_ms()));
            }
            drop(guard);
            send_json_response(&mut stream, 200, &resp);
        }
        ("POST", "/api/db/sync") => {
            let parsed: Value = serde_json::from_slice(body_bytes).unwrap_or_else(|_| json!({}));
            if let Some(incoming_data) = parsed.get("data") {
                let force_overwrite = parsed
                    .get("forceOverwrite")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let mut guard = match shared_state.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                let current_rev = guard
                    .db_state
                    .get("rev")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let current_data = guard
                    .db_state
                    .get("data")
                    .cloned()
                    .unwrap_or_else(|| json!({}));

                let new_data = if force_overwrite {
                    incoming_data.clone()
                } else {
                    merge_database_objects(&current_data, incoming_data)
                };

                let new_state = json!({
                    "rev": current_rev + 1,
                    "updatedAt": format!("{}", now_ms()),
                    "data": new_data
                });
                guard.db_state = new_state.clone();
                let _ = fs::create_dir_all(&guard.data_dir);
                if let Ok(bytes) = serde_json::to_vec(&guard.db_state) {
                    let _ = fs::write(&guard.db_file, bytes);
                }
                drop(guard);

                send_json_response(
                    &mut stream,
                    200,
                    &json!({
                        "ok": true,
                        "state": new_state,
                        "serverTimeMs": now_ms()
                    }),
                );
            } else {
                send_json_response(
                    &mut stream,
                    400,
                    &json!({ "ok": false, "error": "Invalid sync payload" }),
                );
            }
        }
        ("POST", "/api/db/raw-reset") => {
            let mut guard = match shared_state.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let current_rev = guard
                .db_state
                .get("rev")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let new_state = json!({
                "rev": current_rev + 100,
                "updatedAt": format!("{}", now_ms()),
                "data": {
                    "settings": [{ "id": 1, "isRawInitialized": true, "_updatedAtMs": now_ms() }],
                    "deletedRecords": {}
                }
            });
            guard.db_state = new_state.clone();
            let _ = fs::create_dir_all(&guard.data_dir);
            if let Ok(bytes) = serde_json::to_vec(&guard.db_state) {
                let _ = fs::write(&guard.db_file, bytes);
            }
            drop(guard);

            send_json_response(
                &mut stream,
                200,
                &json!({
                    "ok": true,
                    "state": new_state,
                    "serverTimeMs": now_ms()
                }),
            );
        }
        ("GET", "/api/network/info") => {
            let guard = match shared_state.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let port = guard.active_port;
            let custom_domain = guard.custom_domain.clone();
            let rev = guard
                .db_state
                .get("rev")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            drop(guard);

            let ips = detect_local_ips();
            let primary_url = if let Some(first_ip) = ips.first() {
                format!("http://{}:{}", first_ip, port)
            } else {
                format!("http://localhost:{}", port)
            };
            let domain_url = if !custom_domain.is_empty() {
                if custom_domain.starts_with("http") {
                    Some(custom_domain.clone())
                } else {
                    Some(format!("https://{}", custom_domain))
                }
            } else {
                None
            };

            send_json_response(
                &mut stream,
                200,
                &json!({
                    "ok": true,
                    "hostname": get_hostname(),
                    "platform": "win32",
                    "isLinuxServer": false,
                    "port": port,
                    "customDomain": custom_domain,
                    "domainUrl": domain_url,
                    "localIps": ips,
                    "primaryUrl": primary_url,
                    "isServerRunning": true,
                    "rev": rev,
                    "serverTimeMs": now_ms()
                }),
            );
        }
        ("POST", "/api/network/set-port") => {
            let parsed: Value = serde_json::from_slice(body_bytes).unwrap_or_else(|_| json!({}));
            let new_port = parsed
                .get("port")
                .and_then(|v| {
                    v.as_u64()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
                })
                .unwrap_or(0) as u16;

            if new_port >= 1024 {
                {
                    let mut guard = match shared_state.lock() {
                        Ok(g) => g,
                        Err(p) => p.into_inner(),
                    };
                    guard.active_port = new_port;
                    let _ = fs::create_dir_all(&guard.data_dir);
                    let _ = fs::write(&guard.port_file, new_port.to_string());
                }
                spawn_listener_on_port(new_port, Arc::clone(&shared_state));
                send_json_response(
                    &mut stream,
                    200,
                    &json!({
                        "ok": true,
                        "port": new_port,
                        "message": "پورت سرور مرکزی ویندوز با موفقیت تغییر یافت و هم‌اکنون فعال است."
                    }),
                );
            } else {
                send_json_response(
                    &mut stream,
                    400,
                    &json!({
                        "ok": false,
                        "error": "شماره پورت باید بین ۱۰۲۴ تا ۶۵۵۳۵ باشد."
                    }),
                );
            }
        }
        ("POST", "/api/network/set-domain") => {
            let parsed: Value = serde_json::from_slice(body_bytes).unwrap_or_else(|_| json!({}));
            let domain = parsed
                .get("domain")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .trim_end_matches('/')
                .to_string();

            let mut guard = match shared_state.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            guard.custom_domain = domain.clone();
            let _ = fs::create_dir_all(&guard.data_dir);
            let _ = fs::write(&guard.domain_file, &domain);
            drop(guard);

            send_json_response(
                &mut stream,
                200,
                &json!({
                    "ok": true,
                    "customDomain": domain
                }),
            );
        }
        ("GET", "/api/printers/list") => {
            let printers = list_windows_printers();
            send_json_response(&mut stream, 200, &json!({ "ok": true, "printers": printers }));
        }
        ("GET", "/api/license/status") | ("POST", "/api/license/activate") => {
            send_json_response(
                &mut stream,
                200,
                &json!({
                    "activated": true,
                    "machineId": "ARKA-ENT-OPEN",
                    "customerName": "نسخه کامل سازمانی (بدون قفل)",
                    "activatedAt": "2025-01-01T00:00:00.000Z"
                }),
            );
        }
        _ => {
            send_json_response(
                &mut stream,
                200,
                &json!({
                    "ok": true,
                    "service": "Arka POS Embedded Windows Central Server",
                    "serverTimeMs": now_ms()
                }),
            );
        }
    }
}

fn start_embedded_central_server(app_dir: PathBuf) {
    let data_dir = app_dir.join("data");
    let _ = fs::create_dir_all(&data_dir);
    let db_file = data_dir.join("central_db.json");
    let port_file = data_dir.join("server_port.conf");
    let domain_file = data_dir.join("server_domain.conf");

    let active_port: u16 = fs::read_to_string(&port_file)
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
        .filter(|&p| p >= 1024)
        .unwrap_or(4040);

    let custom_domain = fs::read_to_string(&domain_file)
        .ok()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let db_state: Value = fs::read_to_string(&db_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| {
            json!({
                "rev": 0,
                "updatedAt": format!("{}", now_ms()),
                "data": {}
            })
        });

    let shared_state = Arc::new(Mutex::new(AppServerState {
        data_dir,
        db_file,
        port_file,
        domain_file,
        active_port,
        custom_domain,
        bound_ports: HashSet::new(),
        db_state,
    }));

    // Always bind active configured port (e.g. custom port or 4040)
    spawn_listener_on_port(active_port, Arc::clone(&shared_state));

    // If user configured a custom port != 4040, also listen on 4040 for local WebView2 discovery
    if active_port != 4040 {
        spawn_listener_on_port(4040, Arc::clone(&shared_state));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Force WebView2 to disable stale HTTP/disk cache, allow LAN network sync and enable direct kiosk thermal printing
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--kiosk-printing --disable-print-preview --disable-http-cache --disable-cache --disk-cache-size=1 --disable-web-security --allow-running-insecure-content",
    );

    let app_dir = std::env::var_os("LOCALAPPDATA")
        .map(|p| PathBuf::from(p).join("com.arkasystem.pos.enterprise.v2"))
        .unwrap_or_else(|| PathBuf::from("./arka_data"));

    // 2. Auto-purge stale WebView2 cache on Windows if app version changed or upgraded
    {
        let ver_file = app_dir.join("installed_version.txt");
        let current_ver = "2.1.0";

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

    // 3. Start Embedded Central HTTP & Sync Server on Windows Tauri
    start_embedded_central_server(app_dir);

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
