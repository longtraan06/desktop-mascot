use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

static ALIVE: AtomicBool = AtomicBool::new(true);
static TICK_QUEUED: AtomicBool = AtomicBool::new(false);
static DRAG_ENGAGED: AtomicBool = AtomicBool::new(false);
static IGNORING: AtomicBool = AtomicBool::new(false);
static DOCK_ARMED: AtomicBool = AtomicBool::new(false);
static BOT_SIZE: AtomicI32 = AtomicI32::new(140);
static IDLE_MINUTES: AtomicI32 = AtomicI32::new(5);
static IDLE_SENT: AtomicBool = AtomicBool::new(false);
static IDLE_TICKS: AtomicI32 = AtomicI32::new(0);
static AUTO_HIDE: AtomicBool = AtomicBool::new(true);
static HIDDEN_FOR_FULLSCREEN: AtomicBool = AtomicBool::new(false);
static FULLSCREEN_STREAK: AtomicI32 = AtomicI32::new(0);
static BUTTON_DOWN: AtomicBool = AtomicBool::new(false);
static HELD_ON_BOT: AtomicBool = AtomicBool::new(false);

const YAW_MAX: f64 = 16.0;
const PITCH_MAX: f64 = 13.0;
const RAYON: f64 = 100.0;
const VIEW: f64 = 316.0;
const PAD_CSS: f64 = 16.0;
const SLOP_CSS: f64 = 10.0;

struct Zone {
    on: bool,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Approach {
    on: bool,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

static APPROACH: Mutex<Approach> = Mutex::new(Approach {
    on: false,
    x: 0.0,
    y: 0.0,
    w: 0.0,
    h: 0.0,
});

struct Overlay {
    radii: Vec<f64>,
    bubble: Zone,
    hub: Zone,
    anchor_on: bool,
    anchor_x: f64,
    anchor_y: f64,
}

static OVERLAY: Mutex<Overlay> = Mutex::new(Overlay {
    radii: Vec::new(),
    bubble: Zone {
        on: false,
        x: 0.0,
        y: 0.0,
        w: 0.0,
        h: 0.0,
    },
    hub: Zone {
        on: false,
        x: 0.0,
        y: 0.0,
        w: 0.0,
        h: 0.0,
    },
    anchor_on: false,
    anchor_x: 0.0,
    anchor_y: 0.0,
});

#[cfg(target_os = "windows")]
#[repr(C)]
struct POINT {
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct LASTINPUTINFO {
    cb_size: u32,
    dw_time: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(target_os = "windows")]
extern "system" {
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    fn GetAsyncKeyState(v_key: i32) -> i16;
    fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> i32;
    fn GetTickCount() -> u32;
    fn GetForegroundWindow() -> *mut std::ffi::c_void;
    fn GetWindowRect(hwnd: *mut std::ffi::c_void, rect: *mut RECT) -> i32;
}

#[derive(Clone, serde::Serialize)]
pub struct MascotGaze {
    pub yaw: f64,
    pub pitch: f64,
    pub x: f64,
    pub y: f64,
}

fn cursor_pos() -> (i32, i32) {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) != 0 {
            return (pt.x, pt.y);
        }
    }
    (0, 0)
}

fn gaze_angles(dx: f64, dy: f64, monitor_w: f64, monitor_h: f64) -> (f64, f64) {
    let half_w = (monitor_w * 0.5).max(1.0);
    let half_h = (monitor_h * 0.5).max(1.0);
    let nx = (dx / half_w).clamp(-1.0, 1.0);
    let ny = (dy / half_h).clamp(-1.0, 1.0);
    (
        (nx * YAW_MAX).clamp(-YAW_MAX, YAW_MAX),
        (-ny * PITCH_MAX).clamp(-PITCH_MAX, PITCH_MAX),
    )
}

fn hits_profile(dx: f64, dy: f64, radii: &[f64], unit: f64, slop: f64) -> bool {
    let dist = (dx * dx + dy * dy).sqrt();
    if radii.len() < 3 || unit <= 0.0 {
        let r = unit.max(0.0) + slop;
        return dist <= r;
    }
    if dist <= slop {
        return true;
    }
    let mut ang = dy.atan2(dx);
    if ang < 0.0 {
        ang += std::f64::consts::TAU;
    }
    let n = radii.len() as f64;
    let f = ang / std::f64::consts::TAU * n;
    let i = (f.floor() as usize) % radii.len();
    let j = (i + 1) % radii.len();
    let t = (f - f.floor()).clamp(0.0, 1.0);
    let radius = radii[i] * (1.0 - t) + radii[j] * t;
    dist <= radius.max(0.0) * unit + slop
}

fn hits_zone(px: f64, py: f64, origin_x: f64, origin_y: f64, scale: f64, zone: &Zone) -> bool {
    if !zone.on || zone.w <= 0.0 || zone.h <= 0.0 {
        return false;
    }
    let x = origin_x + zone.x * scale;
    let y = origin_y + zone.y * scale;
    let w = zone.w * scale;
    let h = zone.h * scale;
    px >= x && py >= y && px <= x + w && py <= y + h
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum IdleEdge {
    Sleep,
    Wake,
    None,
}

fn bot_center(origin_x: f64, origin_y: f64, css_w: f64, css_h: f64, size_css: f64, scale: f64) -> (f64, f64) {
    if let Ok(overlay) = OVERLAY.lock() {
        if overlay.anchor_on {
            return (
                origin_x + overlay.anchor_x * scale,
                origin_y + overlay.anchor_y * scale,
            );
        }
    }
    (
        origin_x + css_w * scale * 0.5,
        origin_y + (css_h - PAD_CSS - size_css * 0.5) * scale,
    )
}

fn track_press(on_us: bool) -> bool {
    let down = left_button_down();
    let was = BUTTON_DOWN.swap(down, Ordering::Relaxed);
    if !down {
        HELD_ON_BOT.store(false, Ordering::Relaxed);
        return false;
    }
    if !was && on_us {
        HELD_ON_BOT.store(true, Ordering::Relaxed);
    }
    let held = HELD_ON_BOT.load(Ordering::Relaxed);
    if !was && !held {
        return true;
    }
    false
}

fn left_button_down() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        return (GetAsyncKeyState(0x01) as u16) & 0x8000 != 0;
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn idle_edge(idle_ms: u32, limit_ms: u32, sent: bool) -> IdleEdge {
    if limit_ms == 0 {
        return if sent { IdleEdge::Wake } else { IdleEdge::None };
    }
    if idle_ms >= limit_ms {
        if sent { IdleEdge::None } else { IdleEdge::Sleep }
    } else if sent {
        IdleEdge::Wake
    } else {
        IdleEdge::None
    }
}

fn covers_monitor(left: i32, top: i32, right: i32, bottom: i32, mx: i32, my: i32, mw: u32, mh: u32) -> bool {
    let w = right.saturating_sub(left);
    let h = bottom.saturating_sub(top);
    w >= mw as i32 - 8 && h >= mh as i32 - 8 && left <= mx + 8 && top <= my + 8
}

fn system_idle_ms() -> u32 {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut info = LASTINPUTINFO {
            cb_size: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dw_time: 0,
        };
        if GetLastInputInfo(&mut info) == 0 {
            return 0;
        }
        return GetTickCount().wrapping_sub(info.dw_time);
    }
    #[cfg(not(target_os = "windows"))]
    0
}

fn notice_idle(win: &tauri::WebviewWindow) {
    let minutes = IDLE_MINUTES.load(Ordering::Relaxed);
    let limit = if minutes <= 0 { 0 } else { minutes as u32 * 60 * 1000 };
    let idle = system_idle_ms();
    match idle_edge(idle, limit, IDLE_SENT.load(Ordering::Relaxed)) {
        IdleEdge::Sleep => {
            IDLE_SENT.store(true, Ordering::Relaxed);
            IDLE_TICKS.store(0, Ordering::Relaxed);
            let _ = win.emit("mascot-idle", ());
        }
        IdleEdge::Wake => {
            IDLE_SENT.store(false, Ordering::Relaxed);
            IDLE_TICKS.store(0, Ordering::Relaxed);
            let _ = win.emit("mascot-activity", ());
        }
        IdleEdge::None if limit > 0 && idle >= limit => {
            let tick = IDLE_TICKS.fetch_add(1, Ordering::Relaxed);
            if tick > 0 && tick % 200 == 0 {
                let _ = win.emit("mascot-idle", ());
            }
        }
        IdleEdge::None => {
            IDLE_TICKS.store(0, Ordering::Relaxed);
        }
    }
}

fn foreground_is_fullscreen(app: &AppHandle, ours: Option<*mut std::ffi::c_void>) -> bool {
    #[cfg(target_os = "windows")]
    {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() || ours == Some(hwnd) {
            return false;
        }
        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
            return false;
        }
        let Ok(monitors) = app.available_monitors() else {
            return false;
        };
        return monitors.iter().any(|monitor| {
            let pos = monitor.position();
            let size = monitor.size();
            covers_monitor(rect.left, rect.top, rect.right, rect.bottom, pos.x, pos.y, size.width, size.height)
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, ours);
        false
    }
}

fn notice_fullscreen(app: &AppHandle, win: &tauri::WebviewWindow) {
    if DRAG_ENGAGED.load(Ordering::Relaxed) || HELD_ON_BOT.load(Ordering::Relaxed) {
        return;
    }
    if !AUTO_HIDE.load(Ordering::Relaxed) {
        FULLSCREEN_STREAK.store(0, Ordering::Relaxed);
        if HIDDEN_FOR_FULLSCREEN.swap(false, Ordering::Relaxed) {
            let _ = win.show();
        }
        return;
    }
    let fullscreen = foreground_is_fullscreen(app, our_hwnd(win));
    let streak = if fullscreen {
        FULLSCREEN_STREAK.fetch_add(1, Ordering::Relaxed) + 1
    } else {
        FULLSCREEN_STREAK.fetch_sub(1, Ordering::Relaxed) - 1
    };
    if streak > 8 {
        FULLSCREEN_STREAK.store(8, Ordering::Relaxed);
    } else if streak < -8 {
        FULLSCREEN_STREAK.store(-8, Ordering::Relaxed);
    }
    let stable = FULLSCREEN_STREAK.load(Ordering::Relaxed);
    if stable >= 8 && win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        HIDDEN_FOR_FULLSCREEN.store(true, Ordering::Relaxed);
    } else if stable <= -8 && HIDDEN_FOR_FULLSCREEN.swap(false, Ordering::Relaxed) {
        let _ = win.show();
    }
}

fn our_hwnd(win: &tauri::WebviewWindow) -> Option<*mut std::ffi::c_void> {
    #[cfg(target_os = "windows")]
    {
        return win.hwnd().ok().map(|hwnd| hwnd.0 as *mut std::ffi::c_void);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = win;
        None
    }
}

fn in_zone(px: f64, py: f64, zone: &Approach) -> bool {
    zone.on && zone.w > 0.0 && zone.h > 0.0 && px >= zone.x && py >= zone.y && px <= zone.x + zone.w && py <= zone.y + zone.h
}

fn notice_dock(win: &tauri::WebviewWindow, px: f64, py: f64) {
    let near = APPROACH.lock().map(|zone| in_zone(px, py, &zone)).unwrap_or(false);
    if !near {
        DOCK_ARMED.store(true, Ordering::Relaxed);
        return;
    }
    if !DOCK_ARMED.swap(false, Ordering::Relaxed) {
        return;
    }
    if let Ok(mut zone) = APPROACH.lock() {
        zone.on = false;
    }
    let _ = win.emit("mascot-undock", ());
}

fn wants_pointer(shape: bool, bubble: bool, hub: bool, drag: bool) -> bool {
    drag || shape || bubble || hub
}

fn monitor_span(app: &AppHandle, win: &tauri::WebviewWindow, cx: i32, cy: i32) -> (f64, f64) {
    if let Ok(monitors) = app.available_monitors() {
        for monitor in monitors {
            let pos = monitor.position();
            let size = monitor.size();
            let x = pos.x as f64;
            let y = pos.y as f64;
            let w = size.width as f64;
            let h = size.height as f64;
            if (cx as f64) >= x && (cx as f64) < x + w && (cy as f64) >= y && (cy as f64) < y + h {
                return (w.max(1.0), h.max(1.0));
            }
        }
    }
    if let Ok(Some(monitor)) = win.current_monitor() {
        let size = monitor.size();
        return (size.width.max(1) as f64, size.height.max(1) as f64);
    }
    (1920.0, 1080.0)
}

fn on_pointer(app: &AppHandle, cx: i32, cy: i32) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let Ok(origin) = win.inner_position() else {
        return;
    };
    let Ok(inner) = win.inner_size() else {
        return;
    };
    let scale = win.scale_factor().unwrap_or(1.0).max(0.01);
    let css_w = inner.width as f64 / scale;
    let css_h = inner.height as f64 / scale;
    let size_css = BOT_SIZE.load(Ordering::Relaxed).max(1) as f64;
    let unit = RAYON * size_css / VIEW * scale;
    let slop = SLOP_CSS * scale;
    let (bot_cx, bot_cy) = bot_center(origin.x as f64, origin.y as f64, css_w, css_h, size_css, scale);
    let dx = cx as f64 - bot_cx;
    let dy = cy as f64 - bot_cy;

    let (monitor_w, monitor_h) = monitor_span(app, &win, cx, cy);
    let (yaw, pitch) = gaze_angles(dx, dy, monitor_w, monitor_h);
    let outer = win.outer_position().unwrap_or(origin);
    let _ = win.emit(
        "mascot-gaze",
        MascotGaze {
            yaw,
            pitch,
            x: outer.x as f64,
            y: outer.y as f64,
        },
    );

    let overlay = OVERLAY.lock().ok();
    let shape = overlay
        .as_ref()
        .map(|g| hits_profile(dx, dy, &g.radii, unit, slop))
        .unwrap_or(false);
    let bubble = overlay
        .as_ref()
        .map(|g| hits_zone(cx as f64, cy as f64, origin.x as f64, origin.y as f64, scale, &g.bubble))
        .unwrap_or(false);
    let hub = overlay
        .as_ref()
        .map(|g| hits_zone(cx as f64, cy as f64, origin.x as f64, origin.y as f64, scale, &g.hub))
        .unwrap_or(false);
    drop(overlay);

    let drag = DRAG_ENGAGED.load(Ordering::Relaxed);
    let outside_press = track_press(shape || bubble || hub || drag);
    let held = HELD_ON_BOT.load(Ordering::Relaxed) || drag;
    if outside_press && OVERLAY.lock().map(|overlay| overlay.hub.on).unwrap_or(false) {
        let _ = win.emit("mascot-dismiss", ());
    }
    notice_idle(&win);
    notice_fullscreen(app, &win);
    notice_dock(&win, cx as f64, cy as f64);
    let receive = wants_pointer(shape, bubble, hub, held);
    let ignoring = !receive;
    if ignoring != IGNORING.load(Ordering::Relaxed) {
        if win.set_ignore_cursor_events(ignoring).is_ok() {
            IGNORING.store(ignoring, Ordering::Relaxed);
        }
    }
}

fn spawn_pointer(app: AppHandle) {
    std::thread::spawn(move || {
        while ALIVE.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(25));
            if !ALIVE.load(Ordering::Relaxed) {
                break;
            }
            if TICK_QUEUED.swap(true, Ordering::Relaxed) {
                continue;
            }
            let (x, y) = cursor_pos();
            let tick = app.clone();
            if app
                .run_on_main_thread(move || {
                    TICK_QUEUED.store(false, Ordering::Relaxed);
                    if ALIVE.load(Ordering::Relaxed) {
                        on_pointer(&tick, x, y);
                    }
                })
                .is_err()
            {
                TICK_QUEUED.store(false, Ordering::Relaxed);
                break;
            }
        }
    });
}

#[tauri::command]
fn get_mascot_gaze(app: AppHandle, window: tauri::WebviewWindow) -> MascotGaze {
    let (cx, cy) = cursor_pos();
    let (yaw, pitch, x, y) = if let (Ok(origin), Ok(inner)) = (window.inner_position(), window.inner_size()) {
        let scale = window.scale_factor().unwrap_or(1.0).max(0.01);
        let css_h = inner.height as f64 / scale;
        let size_css = BOT_SIZE.load(Ordering::Relaxed).max(1) as f64;
        let (bot_cx, bot_cy) = bot_center(
            origin.x as f64,
            origin.y as f64,
            inner.width as f64 / scale,
            css_h,
            size_css,
            scale,
        );
        let (w, h) = monitor_span(&app, &window, cx, cy);
        let (yaw, pitch) = gaze_angles(cx as f64 - bot_cx, cy as f64 - bot_cy, w, h);
        let outer = window.outer_position().unwrap_or(origin);
        (yaw, pitch, outer.x as f64, outer.y as f64)
    } else {
        (0.0, 0.0, 0.0, 0.0)
    };
    MascotGaze { yaw, pitch, x, y }
}

#[tauri::command]
fn get_global_cursor_pos() -> (i32, i32) {
    cursor_pos()
}

#[tauri::command]
fn set_click_through(window: tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())?;
    IGNORING.store(ignore, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn start_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_hub_open(open: bool) {
    if !open {
        if let Ok(mut overlay) = OVERLAY.lock() {
            overlay.hub.on = false;
        }
    }
}

#[tauri::command]
fn set_bot_anchor(x: f64, y: f64, on: bool) {
    if let Ok(mut overlay) = OVERLAY.lock() {
        overlay.anchor_on = on;
        overlay.anchor_x = x;
        overlay.anchor_y = y;
    }
}

#[tauri::command]
fn set_bot_size(size: i32) {
    BOT_SIZE.store(size.max(1), Ordering::Relaxed);
}

#[tauri::command]
fn set_hit_profile(radii: Vec<f64>) {
    if let Ok(mut overlay) = OVERLAY.lock() {
        overlay.radii = if radii.len() >= 3 { radii } else { Vec::new() };
    }
}

#[tauri::command]
fn set_bubble_rect(open: bool, x: f64, y: f64, w: f64, h: f64) {
    if let Ok(mut overlay) = OVERLAY.lock() {
        overlay.bubble = Zone { on: open, x, y, w, h };
    }
}

#[tauri::command]
fn set_hub_rect(open: bool, x: f64, y: f64, w: f64, h: f64) {
    if let Ok(mut overlay) = OVERLAY.lock() {
        overlay.hub = Zone { on: open, x, y, w, h };
    }
}

#[tauri::command]
fn set_drag_engaged(engaged: bool) {
    DRAG_ENGAGED.store(engaged, Ordering::Relaxed);
}

#[tauri::command]
fn set_idle_minutes(minutes: i32) {
    IDLE_MINUTES.store(minutes.max(0), Ordering::Relaxed);
}

#[tauri::command]
fn set_auto_hide(enabled: bool) {
    AUTO_HIDE.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn set_dock_zone(on: bool, x: f64, y: f64, w: f64, h: f64) {
    if let Ok(mut zone) = APPROACH.lock() {
        *zone = Approach { on, x, y, w, h };
    }
    DOCK_ARMED.store(false, Ordering::Relaxed);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_mascot_gaze,
            get_global_cursor_pos,
            set_click_through,
            start_drag,
            set_hub_open,
            set_bot_size,
            set_bot_anchor,
            set_hit_profile,
            set_bubble_rect,
            set_hub_rect,
            set_drag_engaged,
            set_dock_zone,
            set_idle_minutes,
            set_auto_hide
        ])
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Hiện Mascot", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Ẩn Mascot", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            spawn_pointer(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building bloub desktop mascot")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                ALIVE.store(false, Ordering::Relaxed);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gaze_stays_inside_the_limb() {
        let (yaw, pitch) = gaze_angles(50_000.0, -80_000.0, 1920.0, 1080.0);
        assert!(yaw.abs() <= YAW_MAX);
        assert!(pitch.abs() <= PITCH_MAX);
        assert!(yaw > 0.0);
        assert!(pitch > 0.0);
    }

    #[test]
    fn gaze_uses_the_monitor_not_a_fixed_box() {
        let (near, _) = gaze_angles(480.0, 0.0, 1920.0, 1080.0);
        let (far, _) = gaze_angles(480.0, 0.0, 3840.0, 2160.0);
        assert!(near > far);
        assert!((near - 8.0).abs() < 0.01);
    }

    #[test]
    fn profile_hit_is_not_a_circle() {
        let mut radii = vec![0.2; 64];
        radii[0] = 1.0;
        let unit = 100.0;
        assert!(hits_profile(90.0, 0.0, &radii, unit, 0.0));
        assert!(!hits_profile(0.0, 90.0, &radii, unit, 0.0));
        assert!(hits_profile(0.0, 0.0, &radii, unit, 10.0));
    }

    #[test]
    fn bubble_and_hub_do_not_cover_the_window() {
        let zone = Zone {
            on: true,
            x: 10.0,
            y: 20.0,
            w: 40.0,
            h: 30.0,
        };
        assert!(hits_zone(15.0, 25.0, 0.0, 0.0, 1.0, &zone));
        assert!(!hits_zone(200.0, 200.0, 0.0, 0.0, 1.0, &zone));
        let hidden = Zone { on: false, ..zone };
        assert!(!hits_zone(15.0, 25.0, 0.0, 0.0, 1.0, &hidden));
        assert!(!wants_pointer(false, false, false, false));
        assert!(wants_pointer(false, false, true, false));
        assert!(wants_pointer(false, false, false, true));
    }

    #[test]
    fn idle_follows_system_input_not_a_local_timer() {
        assert_eq!(idle_edge(1_000, 5 * 60 * 1000, false), IdleEdge::None);
        assert_eq!(idle_edge(5 * 60 * 1000, 5 * 60 * 1000, false), IdleEdge::Sleep);
        assert_eq!(idle_edge(5 * 60 * 1000, 5 * 60 * 1000, true), IdleEdge::None);
        assert_eq!(idle_edge(10, 5 * 60 * 1000, true), IdleEdge::Wake);
        assert_eq!(idle_edge(10 * 60 * 1000, 0, false), IdleEdge::None);
        assert_eq!(idle_edge(10 * 60 * 1000, 0, true), IdleEdge::Wake);
    }

    #[test]
    fn fullscreen_means_the_whole_monitor() {
        assert!(covers_monitor(0, 0, 1920, 1080, 0, 0, 1920, 1080));
        assert!(!covers_monitor(0, 0, 1920, 1040, 0, 0, 1920, 1080));
        assert!(covers_monitor(1920, 0, 3840, 1080, 1920, 0, 1920, 1080));
    }
}
