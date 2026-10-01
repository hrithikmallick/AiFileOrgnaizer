mod ai;
mod commands;
mod core;
mod db;
mod fs;

use std::path::PathBuf;

use commands::AppState;
use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("local_ai_organizer=info")
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".").join("data"));
            std::fs::create_dir_all(&dir)?;
            let db_path = dir.join("organizer.sqlite");
            let db = Database::open(&db_path)?;
            let resource_root = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources"));
            // Tauri's development and installed layouts differ by one
            // `resources` directory. Accept both without changing the
            // packaged layout.
            let resources = if resource_root.join("model-manifest.json").is_file() {
                resource_root
            } else {
                resource_root.join("resources")
            };
            app.manage(AppState::new(db, resources));
            let state = app.state::<AppState>();
            commands::restart_watcher(&app.handle(), &state).map_err(std::io::Error::other)?;
            let service = state.local_service.clone();
            let model = state.local_model.clone();
            let db_path = state.db.path().to_path_buf();
            std::thread::spawn(move || commands::start_bundled_stack_from_paths(service, model, db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_category_tree,
            commands::get_local_model_status,
            commands::start_local_model,
            commands::stop_local_model,
            commands::get_stats,
            commands::list_files,
            commands::list_review_items,
            commands::update_analysis,
            commands::set_review_status,
            commands::start_scan,
            commands::cancel_scan,
            commands::apply_changes,
            commands::list_operations,
            commands::undo_batch_cmd,
            commands::undo_operation_cmd,
            commands::find_duplicates,
            commands::semantic_search,
            commands::get_settings,
            commands::save_settings,
            commands::list_rules,
            commands::update_rule,
            commands::list_watched_folders,
            commands::toggle_watched_folder,
            commands::add_watched_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Local AI File Organizer");
}
