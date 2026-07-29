use reqwest::blocking::Client;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::{Command as StdCommand, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

const TRAY_ID: &str = "freemodelfinder-tray";
const TRAY_ICON: tauri::image::Image<'_> = tauri::include_image!("icons/tray-icon-template.png");
const STARTING_STATUS_FRAMES: [&str; 4] = [
    "🧡服务启动中",
    "🧡服务启动中·",
    "🧡服务启动中··",
    "🧡服务启动中···",
];
const AUTO_ROUTE_STRATEGIES: [(&str, &str); 3] = [
    ("capability", "规格优先 · capability"),
    ("speed", "速度优先 · speed"),
    ("rate-limit", "请求限制优先 · rate-limit"),
];
const DEFAULT_PORT: u16 = 11435;
const CONTROL_PROTOCOL: u32 = 1;
const GITHUB_LATEST_RELEASE: &str =
    "https://api.github.com/repos/orange90/FreeModelFinder/releases/latest";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthPayload {
    service: String,
    version: String,
    #[serde(default)]
    instance_id: Option<String>,
    #[serde(default)]
    desktop_control_protocol: Option<u32>,
    #[serde(default)]
    ui_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeDescriptor {
    pid: u32,
    port: u16,
    instance_id: String,
    protocol_version: u32,
    service_version: String,
    started_at: u64,
    control_token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopModel {
    value: String,
    label: String,
}

#[derive(Debug, Clone, Deserialize)]
struct DesktopProvider {
    label: String,
    models: Vec<DesktopModel>,
}

#[derive(Debug, Clone, Deserialize)]
struct AutoState {
    available: bool,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    strategy: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopState {
    instance_id: String,
    revision: u64,
    catalog_revision: u64,
    default_model: Option<String>,
    selection_valid: bool,
    onboarding_required: bool,
    auto: AutoState,
    providers: Vec<DesktopProvider>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayAccess {
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    require_auth: bool,
}

#[derive(Debug, Deserialize)]
struct ReleasePayload {
    tag_name: String,
    html_url: String,
}

#[derive(Default)]
struct RuntimeInner {
    descriptor: Option<RuntimeDescriptor>,
    child: Option<CommandChild>,
    service_status: String,
    status_item: Option<MenuItem<tauri::Wry>>,
    desktop_state: Option<DesktopState>,
    model_actions: HashMap<String, String>,
    starting: bool,
    startup_generation: u64,
    quitting: bool,
    restart_failures: u8,
    health_failures: u8,
    new_release: Option<(String, String)>,
}

#[derive(Clone, Default)]
struct DesktopRuntime(Arc<Mutex<RuntimeInner>>);

#[derive(Debug, Default, PartialEq, Eq)]
struct SystemProxySettings {
    http: Option<String>,
    https: Option<String>,
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn runtime_paths_for(home: &std::path::Path, override_dir: Option<&str>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(path) = override_dir.map(str::trim).filter(|path| !path.is_empty()) {
        paths.push(PathBuf::from(path).join("runtime.json"));
    }
    for path in [
        home.join(".freemodelfinder/runtime.json"),
        home.join("Library/Caches/FreeModelFinder/runtime.json"),
    ] {
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    paths
}

fn runtime_paths() -> Vec<PathBuf> {
    let override_dir = std::env::var("FREEMODELFINDER_HOME").ok();
    runtime_paths_for(&home_dir(), override_dir.as_deref())
}

fn log_dir() -> PathBuf {
    home_dir().join("Library/Logs/FreeModelFinder")
}

fn service_log_path() -> PathBuf {
    log_dir().join("service.log")
}

fn setup_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| home_dir().join("Library/Application Support/FreeModelFinder"))
        .join("desktop.json")
}

fn http_client(timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .timeout(timeout)
        .user_agent(format!(
            "FreeModelFinder/{} macOS",
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .map_err(|error| error.to_string())
}

fn read_descriptors() -> Vec<RuntimeDescriptor> {
    runtime_paths()
        .into_iter()
        .filter_map(|path| fs::read_to_string(path).ok())
        .filter_map(|payload| serde_json::from_str(&payload).ok())
        .collect()
}

fn probe_health(port: u16) -> Result<Option<HealthPayload>, String> {
    let client = http_client(Duration::from_millis(900))?;
    let response = match client
        .get(format!("http://127.0.0.1:{port}/healthz"))
        .send()
    {
        Ok(response) => response,
        Err(error) if error.is_connect() || error.is_timeout() => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if !response.status().is_success() {
        return Err(format!("端口 {port} 已被其他服务占用"));
    }
    let health = response
        .json::<HealthPayload>()
        .map_err(|_| format!("端口 {port} 已被非 FreeModelFinder 服务占用"))?;
    if health.service != "freemodelfinder" {
        return Err(format!("端口 {port} 已被非 FreeModelFinder 服务占用"));
    }
    Ok(Some(health))
}

fn compatible_descriptor(descriptor: &RuntimeDescriptor, health: &HealthPayload) -> bool {
    descriptor.protocol_version == CONTROL_PROTOCOL
        && health.desktop_control_protocol == Some(CONTROL_PROTOCOL)
        && health.instance_id.as_deref() == Some(descriptor.instance_id.as_str())
        && descriptor.service_version == health.version
        && health.ui_available
}

fn fetch_desktop_state(descriptor: &RuntimeDescriptor) -> Result<DesktopState, String> {
    let response = http_client(Duration::from_secs(3))?
        .get(format!(
            "http://127.0.0.1:{}/api/desktop/state",
            descriptor.port
        ))
        .header("origin", "tauri://localhost")
        .header("x-fmf-client", "ui")
        .header("x-fmf-control-token", &descriptor.control_token)
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("桌面状态请求失败 ({})", response.status()));
    }
    response.json().map_err(|error| error.to_string())
}

fn post_default_model(descriptor: &RuntimeDescriptor, model: &str) -> Result<(), String> {
    let response = http_client(Duration::from_secs(5))?
        .post(format!(
            "http://127.0.0.1:{}/api/default-model",
            descriptor.port
        ))
        .header("origin", "tauri://localhost")
        .header("x-fmf-client", "ui")
        .header("x-fmf-control-token", &descriptor.control_token)
        .json(&serde_json::json!({ "model": model }))
        .send()
        .map_err(|error| error.to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        let payload = response.text().unwrap_or_default();
        Err(if payload.is_empty() {
            "模型切换失败".to_string()
        } else {
            payload
        })
    }
}

fn post_auto_route(descriptor: &RuntimeDescriptor, strategy: &str) -> Result<(), String> {
    let response = http_client(Duration::from_secs(5))?
        .post(format!(
            "http://127.0.0.1:{}/api/auto-route",
            descriptor.port
        ))
        .header("origin", "tauri://localhost")
        .header("x-fmf-client", "ui")
        .header("x-fmf-control-token", &descriptor.control_token)
        .json(&serde_json::json!({
            "enabled": true,
            "strategy": strategy,
        }))
        .send()
        .map_err(|error| error.to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        let payload = response.text().unwrap_or_default();
        Err(if payload.is_empty() {
            "自动路由设置失败".to_string()
        } else {
            payload
        })
    }
}

fn fetch_gateway_access(descriptor: &RuntimeDescriptor) -> Result<GatewayAccess, String> {
    let response = http_client(Duration::from_secs(3))?
        .get(format!("http://127.0.0.1:{}/api/gateway", descriptor.port))
        .header("origin", "tauri://localhost")
        .header("x-fmf-client", "ui")
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("网关设置请求失败 ({})", response.status()));
    }
    response.json().map_err(|error| error.to_string())
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn access_snippet(kind: &str, port: u16, model: &str, access: &GatewayAccess) -> Option<String> {
    let url = format!("http://127.0.0.1:{port}/v1/chat/completions");
    let authorization = access
        .require_auth
        .then_some(access.api_key.as_deref())
        .flatten()
        .map(|key| format!("Bearer {key}"));

    match kind {
        "curl" => {
            let payload = serde_json::json!({
                "model": model,
                "messages": [{ "role": "user", "content": "Hello! Please introduce yourself." }],
            })
            .to_string();
            let mut lines = vec![
                format!("curl {} \\", shell_single_quote(&url)),
                "  -H 'Content-Type: application/json' \\".to_string(),
            ];
            if let Some(value) = authorization {
                lines.push(format!(
                    "  -H {} \\",
                    shell_single_quote(&format!("Authorization: {value}"))
                ));
            }
            lines.push(format!("  -d {}", shell_single_quote(&payload)));
            Some(lines.join("\n"))
        }
        "python" => {
            let model = serde_json::to_string(model).ok()?;
            let mut headers = vec!["    \"Content-Type\": \"application/json\",".to_string()];
            if let Some(value) = authorization {
                let value = serde_json::to_string(&value).ok()?;
                headers.push(format!("    \"Authorization\": {value},"));
            }
            Some(format!(
                "import json\nfrom urllib.request import Request, urlopen\n\nrequest = Request(\n    {url:?},\n    data=json.dumps({{\n        \"model\": {model},\n        \"messages\": [{{\n            \"role\": \"user\",\n            \"content\": \"Hello! Please introduce yourself.\",\n        }}],\n    }}).encode(\"utf-8\"),\n    headers={{\n{headers}\n    }},\n    method=\"POST\",\n)\n\nwith urlopen(request) as response:\n    result = json.load(response)\n\nprint(result[\"choices\"][0][\"message\"][\"content\"])",
                headers = headers.join("\n")
            ))
        }
        _ => None,
    }
}

fn copy_to_clipboard(content: &str) -> Result<(), String> {
    let mut child = StdCommand::new("/usr/bin/pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法访问系统剪贴板：{error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "无法写入系统剪贴板".to_string())?
        .write_all(content.as_bytes())
        .map_err(|error| format!("写入系统剪贴板失败：{error}"))?;
    let status = child
        .wait()
        .map_err(|error| format!("等待系统剪贴板失败：{error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("系统剪贴板拒绝了写入操作".to_string())
    }
}

fn rotate_logs() -> Result<(), String> {
    fs::create_dir_all(log_dir()).map_err(|error| error.to_string())?;
    let path = service_log_path();
    let too_large = fs::metadata(&path)
        .map(|metadata| metadata.len() >= 5 * 1024 * 1024)
        .unwrap_or(false);
    if !too_large {
        return Ok(());
    }
    let oldest = log_dir().join("service.log.2");
    let _ = fs::remove_file(oldest);
    let _ = fs::rename(
        log_dir().join("service.log.1"),
        log_dir().join("service.log.2"),
    );
    fs::rename(path, log_dir().join("service.log.1")).map_err(|error| error.to_string())
}

fn append_service_log(bytes: &[u8]) {
    if fs::create_dir_all(log_dir()).is_err() {
        return;
    }
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(service_log_path())
    {
        let _ = file.write_all(bytes);
        let _ = file.write_all(b"\n");
    }
}

fn proxy_url(values: &HashMap<String, String>, prefix: &str) -> Option<String> {
    if values.get(&format!("{prefix}Enable")).map(String::as_str) != Some("1") {
        return None;
    }
    let raw_host = values.get(&format!("{prefix}Proxy"))?.trim();
    if raw_host.is_empty()
        || raw_host
            .chars()
            .any(|character| character.is_whitespace() || "/@?#".contains(character))
    {
        return None;
    }
    let port = values
        .get(&format!("{prefix}Port"))?
        .trim()
        .parse::<u16>()
        .ok()
        .filter(|port| *port > 0)?;
    let host = if raw_host.contains(':') && !raw_host.starts_with('[') {
        format!("[{raw_host}]")
    } else {
        raw_host.to_string()
    };
    Some(format!("http://{host}:{port}"))
}

fn parse_scutil_proxy(output: &str) -> SystemProxySettings {
    let values = output
        .lines()
        .filter_map(|line| {
            let (key, value) = line.trim().split_once(" : ")?;
            Some((key.to_string(), value.trim().to_string()))
        })
        .collect::<HashMap<_, _>>();
    SystemProxySettings {
        http: proxy_url(&values, "HTTP"),
        https: proxy_url(&values, "HTTPS"),
    }
}

fn supported_environment_proxy() -> Option<String> {
    [
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
        "ALL_PROXY",
        "all_proxy",
    ]
    .into_iter()
    .filter_map(|key| std::env::var(key).ok())
    .map(|value| value.trim().to_string())
    .find(|value| {
        let lower = value.to_ascii_lowercase();
        lower.starts_with("http://") || lower.starts_with("https://")
    })
}

fn system_proxy_for_sidecar() -> Option<String> {
    if supported_environment_proxy().is_some() {
        return None;
    }
    let output = StdCommand::new("/usr/sbin/scutil")
        .arg("--proxy")
        .output()
        .ok()
        .filter(|output| output.status.success())?;
    let settings = parse_scutil_proxy(&String::from_utf8_lossy(&output.stdout));
    settings.https.or(settings.http)
}

fn set_status(app: &AppHandle, runtime: &DesktopRuntime, status: impl Into<String>) {
    if let Ok(mut inner) = runtime.0.lock() {
        inner.service_status = status.into();
    }
    schedule_menu_rebuild(app, runtime);
}

fn start_status_animation(app: AppHandle, runtime: DesktopRuntime, generation: u64) {
    thread::spawn(move || {
        let mut frame_index = 1;
        loop {
            thread::sleep(Duration::from_millis(400));
            let update = runtime.0.lock().ok().and_then(|mut inner| {
                if !inner.starting || inner.quitting || inner.startup_generation != generation {
                    return None;
                }
                let status = STARTING_STATUS_FRAMES[frame_index].to_string();
                frame_index = (frame_index + 1) % STARTING_STATUS_FRAMES.len();
                inner.service_status = status.clone();
                Some((inner.status_item.clone(), status))
            });
            let Some((status_item, status)) = update else {
                break;
            };
            if let Some(status_item) = status_item {
                let _ = status_item.set_text(status);
            } else {
                schedule_menu_rebuild(&app, &runtime);
            }
        }
    });
}

fn ui_dir(app: &AppHandle) -> PathBuf {
    let bundled = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("dist-ui");
    if bundled.join("index.html").exists() {
        return bundled;
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist-ui")
}

fn spawn_sidecar(app: &AppHandle, runtime: &DesktopRuntime) -> Result<(), String> {
    rotate_logs()?;
    let args = vec![
        "--port".to_string(),
        DEFAULT_PORT.to_string(),
        "--ui-dir".to_string(),
        ui_dir(app).to_string_lossy().to_string(),
        "--parent-pid".to_string(),
        std::process::id().to_string(),
    ];
    let mut command = app
        .shell()
        .sidecar("freemodelfinder-server")
        .map_err(|error| error.to_string())?
        .args(args);
    if let Some(proxy) = system_proxy_for_sidecar() {
        append_service_log(format!("[desktop-proxy] using macOS system proxy {proxy}").as_bytes());
        command = command.env("HTTPS_PROXY", &proxy).env("HTTP_PROXY", &proxy);
    }
    let (mut receiver, child) = command
        .spawn()
        .map_err(|error| format!("无法启动内置服务：{error}"))?;
    if let Ok(mut inner) = runtime.0.lock() {
        inner.child = Some(child);
    }

    let app_handle = app.clone();
    let runtime_handle = runtime.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    append_service_log(&line);
                }
                CommandEvent::Error(error) => append_service_log(error.as_bytes()),
                CommandEvent::Terminated(payload) => {
                    let quitting = runtime_handle
                        .0
                        .lock()
                        .map(|inner| inner.quitting)
                        .unwrap_or(false);
                    if !quitting {
                        set_status(
                            &app_handle,
                            &runtime_handle,
                            format!("服务已退出 ({:?})", payload.code),
                        );
                    }
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

fn adopt_if_compatible() -> Result<Option<RuntimeDescriptor>, String> {
    let mut incompatible_service_found = false;
    let mut probe_error = None;
    for descriptor in read_descriptors() {
        match probe_health(descriptor.port) {
            Ok(Some(health)) if compatible_descriptor(&descriptor, &health) => {
                return Ok(Some(descriptor))
            }
            Ok(Some(_)) => incompatible_service_found = true,
            Ok(None) => {}
            Err(error) => {
                if probe_error.is_none() {
                    probe_error = Some(error);
                }
            }
        }
    }
    if incompatible_service_found {
        Err("检测到不兼容的 FreeModelFinder 服务，请先停止旧服务".to_string())
    } else if let Some(error) = probe_error {
        Err(error)
    } else {
        Ok(None)
    }
}

fn ensure_service(app: &AppHandle, runtime: &DesktopRuntime, force: bool) -> Result<(), String> {
    let startup_generation = {
        let mut inner = runtime.0.lock().map_err(|error| error.to_string())?;
        if inner.starting || inner.quitting {
            return Ok(());
        }
        if inner.restart_failures >= 3 && !force {
            return Err("服务连续启动失败，请查看日志后手动重试".to_string());
        }
        inner.starting = true;
        inner.startup_generation = inner.startup_generation.wrapping_add(1);
        inner.startup_generation
    };
    set_status(app, runtime, STARTING_STATUS_FRAMES[0]);
    start_status_animation(app.clone(), runtime.clone(), startup_generation);

    let result = (|| {
        if let Some(descriptor) = adopt_if_compatible()? {
            let mut inner = runtime.0.lock().map_err(|error| error.to_string())?;
            inner.descriptor = Some(descriptor);
            inner.restart_failures = 0;
            inner.health_failures = 0;
            return Ok(());
        }

        match probe_health(DEFAULT_PORT)? {
            Some(_) => {
                return Err("检测到无法安全接管的 FreeModelFinder 服务，请先停止旧服务".into())
            }
            None => {}
        }

        if let Ok(mut inner) = runtime.0.lock() {
            if let Some(child) = inner.child.take() {
                let _ = child.kill();
            }
        }
        spawn_sidecar(app, runtime)?;

        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            thread::sleep(Duration::from_millis(350));
            if let Some(descriptor) = adopt_if_compatible()? {
                let mut inner = runtime.0.lock().map_err(|error| error.to_string())?;
                inner.descriptor = Some(descriptor);
                inner.restart_failures = 0;
                inner.health_failures = 0;
                return Ok(());
            }
        }
        Err("本地服务在 10 秒内没有就绪".to_string())
    })();

    if let Ok(mut inner) = runtime.0.lock() {
        inner.starting = false;
        if result.is_err() {
            inner.restart_failures = inner.restart_failures.saturating_add(1);
        }
    }
    match &result {
        Ok(_) => set_status(app, runtime, "💚服务运行中"),
        Err(error) => set_status(app, runtime, format!("服务异常：{error}")),
    }
    result
}

fn request_service_shutdown(descriptor: &RuntimeDescriptor) -> Result<(), String> {
    let response = http_client(Duration::from_secs(3))?
        .post(format!(
            "http://127.0.0.1:{}/api/runtime/shutdown",
            descriptor.port
        ))
        .header("origin", "tauri://localhost")
        .header("x-fmf-client", "ui")
        .header("x-fmf-control-token", &descriptor.control_token)
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("服务拒绝关闭 ({})", response.status()));
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        thread::sleep(Duration::from_millis(200));
        if probe_health(descriptor.port)?.is_none() {
            return Ok(());
        }
    }

    let current_matches = read_descriptors().into_iter().any(|current| {
        current.instance_id == descriptor.instance_id && current.pid == descriptor.pid
    });
    if !current_matches {
        return Err("运行实例已经变化，已取消退出".to_string());
    }
    #[cfg(target_os = "macos")]
    unsafe {
        if libc::kill(descriptor.pid as i32, libc::SIGTERM) != 0 {
            return Err("服务未能在超时后终止".to_string());
        }
    }
    Ok(())
}

fn open_dashboard(app: &AppHandle, runtime: &DesktopRuntime) -> Result<(), String> {
    let port = runtime
        .0
        .lock()
        .ok()
        .and_then(|inner| inner.descriptor.as_ref().map(|value| value.port))
        .unwrap_or(DEFAULT_PORT);
    app.opener()
        .open_url(format!("http://127.0.0.1:{port}"), None::<&str>)
        .map_err(|error| error.to_string())
}

fn rebuild_menu(app: &AppHandle, runtime: &DesktopRuntime) -> tauri::Result<()> {
    let (status, desktop, release) = {
        let inner = runtime.0.lock().expect("desktop runtime lock poisoned");
        (
            inner.service_status.clone(),
            inner.desktop_state.clone(),
            inner.new_release.clone(),
        )
    };
    let menu = Menu::new(app)?;
    let status_item = MenuItem::with_id(
        app,
        "service_status",
        if status.is_empty() {
            STARTING_STATUS_FRAMES[0]
        } else {
            &status
        },
        false,
        None::<&str>,
    )?;
    menu.append(&status_item)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let switch_menu = Submenu::with_id(app, "switch_model", "切换模型", true)?;
    let selected = desktop
        .as_ref()
        .and_then(|state| state.default_model.as_deref());
    let auto_available = desktop
        .as_ref()
        .map(|state| state.auto.available)
        .unwrap_or(false);
    let auto_menu = Submenu::with_id(app, "auto_route", "自动选择", auto_available)?;
    for (strategy, label) in AUTO_ROUTE_STRATEGIES {
        let checked = desktop
            .as_ref()
            .map(|state| {
                selected == Some("auto")
                    && state.auto.enabled
                    && state.auto.strategy.as_deref().unwrap_or("capability") == strategy
            })
            .unwrap_or(false);
        auto_menu.append(&CheckMenuItem::with_id(
            app,
            format!("auto_route:{strategy}"),
            label,
            auto_available,
            checked,
            None::<&str>,
        )?)?;
    }
    switch_menu.append(&auto_menu)?;

    let mut actions = HashMap::new();
    if let Some(state) = &desktop {
        if !state.selection_valid {
            if let Some(value) = &state.default_model {
                switch_menu.append(&MenuItem::with_id(
                    app,
                    "invalid_model",
                    format!("当前不可用：{value}"),
                    false,
                    None::<&str>,
                )?)?;
            }
        }
        switch_menu.append(&PredefinedMenuItem::separator(app)?)?;
        for (provider_index, provider) in state.providers.iter().enumerate() {
            let provider_menu = Submenu::new(app, &provider.label, true)?;
            for (model_index, model) in provider.models.iter().enumerate() {
                let id = format!("model:{provider_index}:{model_index}");
                provider_menu.append(&CheckMenuItem::with_id(
                    app,
                    &id,
                    &model.label,
                    true,
                    selected == Some(model.value.as_str()),
                    None::<&str>,
                )?)?;
                actions.insert(id, model.value.clone());
            }
            switch_menu.append(&provider_menu)?;
        }
    }
    menu.append(&switch_menu)?;
    let access_menu = Submenu::with_id(app, "access_method", "接入方法", desktop.is_some())?;
    access_menu.append(&MenuItem::with_id(
        app,
        "copy_access:curl",
        "curl",
        desktop.is_some(),
        None::<&str>,
    )?)?;
    access_menu.append(&MenuItem::with_id(
        app,
        "copy_access:python",
        "python 代码",
        desktop.is_some(),
        None::<&str>,
    )?)?;
    menu.append(&access_menu)?;
    menu.append(&MenuItem::with_id(
        app,
        "open_dashboard",
        "打开 Dashboard",
        desktop.is_some(),
        None::<&str>,
    )?)?;
    let launch_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    menu.append(&CheckMenuItem::with_id(
        app,
        "launch_at_login",
        "登录时启动",
        true,
        launch_enabled,
        None::<&str>,
    )?)?;
    if let Some((version, _)) = release {
        menu.append(&MenuItem::with_id(
            app,
            "open_update",
            format!("发现新版本 {version}…"),
            true,
            None::<&str>,
        )?)?;
    }
    if status.contains("异常") || status.contains("退出") {
        menu.append(&MenuItem::with_id(
            app,
            "retry_service",
            "重试本地服务",
            true,
            None::<&str>,
        )?)?;
        menu.append(&MenuItem::with_id(
            app,
            "open_logs",
            "打开日志文件夹",
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "quit",
        "退出 FreeModelFinder",
        true,
        None::<&str>,
    )?)?;
    if let Ok(mut inner) = runtime.0.lock() {
        inner.model_actions = actions;
        inner.status_item = Some(status_item);
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

fn schedule_menu_rebuild(app: &AppHandle, runtime: &DesktopRuntime) {
    let app_handle = app.clone();
    let runtime_handle = runtime.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = rebuild_menu(&app_handle, &runtime_handle);
    });
}

fn show_error(app: &AppHandle, title: &str, message: impl AsRef<str>) {
    app.dialog()
        .message(message.as_ref())
        .title(title)
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

fn show_copy_confirmation(app: &AppHandle) {
    app.dialog()
        .message("已复制到剪贴板")
        .title("接入代码")
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

fn handle_menu_event(app: &AppHandle, runtime: &DesktopRuntime, id: &str) {
    if let Some(kind) = id.strip_prefix("copy_access:") {
        if !matches!(kind, "curl" | "python") {
            return;
        }
        let (descriptor, model) = runtime
            .0
            .lock()
            .ok()
            .map(|inner| {
                let model = inner
                    .desktop_state
                    .as_ref()
                    .filter(|state| state.selection_valid)
                    .and_then(|state| state.default_model.clone())
                    .unwrap_or_else(|| "auto".to_string());
                (inner.descriptor.clone(), model)
            })
            .unwrap_or((None, "auto".to_string()));
        if let Some(descriptor) = descriptor {
            let app_handle = app.clone();
            let kind = kind.to_string();
            thread::spawn(move || {
                let result = fetch_gateway_access(&descriptor).and_then(|access| {
                    access_snippet(&kind, descriptor.port, &model, &access)
                        .ok_or_else(|| "不支持的接入方法".to_string())
                        .and_then(|snippet| copy_to_clipboard(&snippet))
                });
                match result {
                    Ok(_) => show_copy_confirmation(&app_handle),
                    Err(error) => show_error(&app_handle, "复制接入代码失败", error),
                }
            });
        }
        return;
    }

    if let Some(strategy) = id.strip_prefix("auto_route:") {
        let strategy = match strategy {
            "capability" | "speed" | "rate-limit" => strategy.to_string(),
            _ => return,
        };
        let descriptor = runtime
            .0
            .lock()
            .ok()
            .and_then(|inner| inner.descriptor.clone());
        if let Some(descriptor) = descriptor {
            let app_handle = app.clone();
            let runtime_handle = runtime.clone();
            thread::spawn(move || {
                let result = post_auto_route(&descriptor, &strategy)
                    .and_then(|_| post_default_model(&descriptor, "auto"));
                match result {
                    Ok(_) => {
                        if let Ok(state) = fetch_desktop_state(&descriptor) {
                            if let Ok(mut inner) = runtime_handle.0.lock() {
                                inner.desktop_state = Some(state);
                            }
                        }
                        schedule_menu_rebuild(&app_handle, &runtime_handle);
                    }
                    Err(error) => show_error(&app_handle, "自动路由设置失败", error),
                }
            });
        }
        return;
    }

    if id.starts_with("model:") {
        let (descriptor, model) = runtime
            .0
            .lock()
            .ok()
            .map(|inner| {
                (
                    inner.descriptor.clone(),
                    inner.model_actions.get(id).cloned(),
                )
            })
            .unwrap_or((None, None));
        if let (Some(descriptor), Some(model)) = (descriptor, model) {
            let app_handle = app.clone();
            let runtime_handle = runtime.clone();
            thread::spawn(move || match post_default_model(&descriptor, &model) {
                Ok(_) => {
                    if let Ok(state) = fetch_desktop_state(&descriptor) {
                        if let Ok(mut inner) = runtime_handle.0.lock() {
                            inner.desktop_state = Some(state);
                        }
                    }
                    schedule_menu_rebuild(&app_handle, &runtime_handle);
                }
                Err(error) => show_error(&app_handle, "模型切换失败", error),
            });
        }
        return;
    }

    match id {
        "open_dashboard" => {
            if let Err(error) = open_dashboard(app, runtime) {
                show_error(app, "无法打开 Dashboard", error);
            }
        }
        "launch_at_login" => {
            let result = if app.autolaunch().is_enabled().unwrap_or(false) {
                app.autolaunch().disable()
            } else {
                app.autolaunch().enable()
            };
            if let Err(error) = result {
                show_error(app, "登录启动设置失败", error.to_string());
            }
            schedule_menu_rebuild(app, runtime);
        }
        "open_update" => {
            let url = runtime
                .0
                .lock()
                .ok()
                .and_then(|inner| inner.new_release.as_ref().map(|value| value.1.clone()));
            if let Some(url) = url {
                let _ = app.opener().open_url(url, None::<&str>);
            }
        }
        "retry_service" => {
            if let Ok(mut inner) = runtime.0.lock() {
                inner.restart_failures = 0;
            }
            let app_handle = app.clone();
            let runtime_handle = runtime.clone();
            thread::spawn(move || {
                let _ = ensure_service(&app_handle, &runtime_handle, true);
            });
        }
        "open_logs" => {
            let _ = fs::create_dir_all(log_dir());
            let _ = app
                .opener()
                .open_path(log_dir().to_string_lossy(), None::<&str>);
        }
        "quit" => {
            let descriptor = runtime
                .0
                .lock()
                .ok()
                .and_then(|inner| inner.descriptor.clone());
            if let Ok(mut inner) = runtime.0.lock() {
                inner.quitting = true;
            }
            let app_handle = app.clone();
            let runtime_handle = runtime.clone();
            thread::spawn(move || {
                let result = descriptor
                    .as_ref()
                    .map(request_service_shutdown)
                    .unwrap_or(Ok(()));
                match result {
                    Ok(_) => app_handle.exit(0),
                    Err(error) => {
                        if let Ok(mut inner) = runtime_handle.0.lock() {
                            inner.quitting = false;
                        }
                        show_error(&app_handle, "无法安全退出", error);
                    }
                }
            });
        }
        _ => {}
    }
}

fn write_setup_complete(app: &AppHandle) -> Result<(), String> {
    let path = setup_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        path,
        format!(
            "{{\n  \"setupVersion\": \"{}\"\n}}\n",
            env!("CARGO_PKG_VERSION")
        ),
    )
    .map_err(|error| error.to_string())
}

fn run_initialization(app: AppHandle, runtime: DesktopRuntime) {
    let first_run = !setup_path(&app).exists();
    if first_run {
        let accepted = app
            .dialog()
            .message(
                "FreeModelFinder 会初始化一个仅监听本机的模型服务，不需要管理员权限。退出状态栏工具时，该服务也会关闭。",
            )
            .title("初始化本地服务")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "初始化".to_string(),
                "退出".to_string(),
            ))
            .blocking_show();
        if !accepted {
            app.exit(0);
            return;
        }
    }

    match ensure_service(&app, &runtime, true) {
        Ok(_) => {
            if first_run {
                if let Err(error) = write_setup_complete(&app) {
                    show_error(&app, "初始化未完成", error);
                    return;
                }
            }
            let descriptor = runtime
                .0
                .lock()
                .ok()
                .and_then(|inner| inner.descriptor.clone());
            if let Some(descriptor) = descriptor {
                if let Ok(state) = fetch_desktop_state(&descriptor) {
                    let should_open = first_run && state.onboarding_required;
                    if let Ok(mut inner) = runtime.0.lock() {
                        inner.desktop_state = Some(state);
                    }
                    schedule_menu_rebuild(&app, &runtime);
                    if should_open {
                        let _ = open_dashboard(&app, &runtime);
                    }
                }
            }
        }
        Err(error) => show_error(&app, "本地服务初始化失败", error),
    }
    start_state_monitor(app, runtime);
}

fn start_state_monitor(app: AppHandle, runtime: DesktopRuntime) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));
        let (quitting, descriptor) = runtime
            .0
            .lock()
            .ok()
            .map(|inner| (inner.quitting, inner.descriptor.clone()))
            .unwrap_or((true, None));
        if quitting {
            break;
        }
        let mut healthy = false;
        if let Some(descriptor) = descriptor {
            if let Ok(Some(health)) = probe_health(descriptor.port) {
                if compatible_descriptor(&descriptor, &health) {
                    healthy = true;
                    if let Ok(state) = fetch_desktop_state(&descriptor) {
                        let changed = runtime
                            .0
                            .lock()
                            .map(|mut inner| {
                                let changed = inner
                                    .desktop_state
                                    .as_ref()
                                    .map(|current| {
                                        current.instance_id != state.instance_id
                                            || current.revision != state.revision
                                            || current.catalog_revision != state.catalog_revision
                                    })
                                    .unwrap_or(true);
                                inner.desktop_state = Some(state);
                                changed
                            })
                            .unwrap_or(false);
                        if changed {
                            schedule_menu_rebuild(&app, &runtime);
                        }
                    }
                }
            }
        }
        if !healthy {
            let should_restart = runtime
                .0
                .lock()
                .map(|mut inner| {
                    inner.health_failures = inner.health_failures.saturating_add(1);
                    inner.health_failures >= 3
                })
                .unwrap_or(false);
            if should_restart {
                let _ = ensure_service(&app, &runtime, false);
            }
        } else if let Ok(mut inner) = runtime.0.lock() {
            inner.health_failures = 0;
        }
    });
}

fn check_for_updates(app: AppHandle, runtime: DesktopRuntime) {
    thread::spawn(move || loop {
        let result = (|| {
            let release = http_client(Duration::from_secs(10))?
                .get(GITHUB_LATEST_RELEASE)
                .send()
                .map_err(|error| error.to_string())?
                .error_for_status()
                .map_err(|error| error.to_string())?
                .json::<ReleasePayload>()
                .map_err(|error| error.to_string())?;
            let latest = Version::parse(release.tag_name.trim_start_matches('v'))
                .map_err(|error| error.to_string())?;
            let current =
                Version::parse(env!("CARGO_PKG_VERSION")).map_err(|error| error.to_string())?;
            if latest > current {
                if let Ok(mut inner) = runtime.0.lock() {
                    inner.new_release = Some((release.tag_name, release.html_url));
                }
                schedule_menu_rebuild(&app, &runtime);
            }
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            append_service_log(format!("[desktop-update] {error}").as_bytes());
        }
        thread::sleep(Duration::from_secs(24 * 60 * 60));
    });
}

fn main() {
    let runtime = DesktopRuntime::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let runtime = app.state::<DesktopRuntime>().inner().clone();
            let _ = open_dashboard(app, &runtime);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(runtime.clone())
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let initial_menu = Menu::new(app)?;
            initial_menu.append(&MenuItem::with_id(
                app,
                "service_status",
                STARTING_STATUS_FRAMES[0],
                false,
                None::<&str>,
            )?)?;
            TrayIconBuilder::with_id(TRAY_ID)
                .menu(&initial_menu)
                .show_menu_on_left_click(true)
                .tooltip("FreeModelFinder")
                .icon(TRAY_ICON)
                .icon_as_template(true)
                .on_menu_event(|app, event| {
                    let runtime = app.state::<DesktopRuntime>().inner().clone();
                    handle_menu_event(app, &runtime, event.id.as_ref());
                })
                .build(app)?;

            let app_handle = app.handle().clone();
            let runtime_handle = runtime.clone();
            thread::spawn(move || run_initialization(app_handle, runtime_handle));
            check_for_updates(app.handle().clone(), runtime.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running FreeModelFinder desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_compatibility_requires_matching_instance_and_protocol() {
        let descriptor = RuntimeDescriptor {
            pid: 42,
            port: DEFAULT_PORT,
            instance_id: "instance".into(),
            protocol_version: CONTROL_PROTOCOL,
            service_version: "1.0.0".into(),
            started_at: 1,
            control_token: "token".into(),
        };
        let health = HealthPayload {
            service: "freemodelfinder".into(),
            version: "1.0.0".into(),
            instance_id: Some("instance".into()),
            desktop_control_protocol: Some(CONTROL_PROTOCOL),
            ui_available: true,
        };
        assert!(compatible_descriptor(&descriptor, &health));
        let mut mismatch = health.clone();
        mismatch.instance_id = Some("other".into());
        assert!(!compatible_descriptor(&descriptor, &mismatch));
        let mut api_only = health;
        api_only.ui_available = false;
        assert!(!compatible_descriptor(&descriptor, &api_only));
    }

    #[test]
    fn runtime_paths_cover_primary_fallback_and_override_directories() {
        let home = PathBuf::from("test-home");
        let paths = runtime_paths_for(&home, None);
        assert_eq!(paths.len(), 2);
        assert_eq!(paths[0], home.join(".freemodelfinder/runtime.json"));
        assert_eq!(
            paths[1],
            home.join("Library/Caches/FreeModelFinder/runtime.json")
        );

        let overridden = runtime_paths_for(&home, Some("custom-home"));
        assert_eq!(overridden[0], PathBuf::from("custom-home/runtime.json"));
        assert_eq!(overridden.len(), 3);
    }

    #[test]
    fn parses_enabled_macos_http_proxies() {
        let settings = parse_scutil_proxy(
            r#"<dictionary> {
  HTTPEnable : 1
  HTTPPort : 8080
  HTTPProxy : proxy.local
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
}"#,
        );
        assert_eq!(settings.http.as_deref(), Some("http://proxy.local:8080"));
        assert_eq!(settings.https.as_deref(), Some("http://127.0.0.1:7890"));
    }

    #[test]
    fn ignores_disabled_or_malformed_macos_proxies() {
        let settings = parse_scutil_proxy(
            r#"HTTPEnable : 0
HTTPPort : 8080
HTTPProxy : proxy.local
HTTPSEnable : 1
HTTPSPort : not-a-port
HTTPSProxy : proxy.local/path"#,
        );
        assert_eq!(settings, SystemProxySettings::default());
    }

    #[test]
    fn builds_directly_runnable_access_snippets() {
        let open = GatewayAccess {
            api_key: None,
            require_auth: false,
        };
        let curl = access_snippet("curl", 11435, "custom:model", &open).unwrap();
        assert!(curl.contains("http://127.0.0.1:11435/v1/chat/completions"));
        assert!(curl.contains("custom:model"));
        assert!(curl.contains("Hello! Please introduce yourself."));
        assert!(!curl.contains("Authorization:"));

        let secured = GatewayAccess {
            api_key: Some("fmf-secret".into()),
            require_auth: true,
        };
        let python = access_snippet("python", 11436, "auto", &secured).unwrap();
        assert!(python.contains("http://127.0.0.1:11436/v1/chat/completions"));
        assert!(python.contains("\"Authorization\": \"Bearer fmf-secret\""));
        assert!(python.contains("\"model\": \"auto\""));
        assert!(python.contains("Hello! Please introduce yourself."));
    }
}
