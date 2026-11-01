#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20220101_000001_users;

mod m20261101_002524_mcp_servers;
mod m20261101_002620_mcp_tools;
mod m20261101_002709_app_settings;
mod m20261101_002759_sync_runs;
mod m20261101_002846_tool_calls;
mod m20261101_010000_mcp_proxy_sessions;
mod m20261101_010001_mcp_proxy_grants;
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20220101_000001_users::Migration),
            Box::new(m20261101_002524_mcp_servers::Migration),
            Box::new(m20261101_002620_mcp_tools::Migration),
            Box::new(m20261101_002709_app_settings::Migration),
            Box::new(m20261101_002759_sync_runs::Migration),
            Box::new(m20261101_002846_tool_calls::Migration),
            Box::new(m20261101_010000_mcp_proxy_sessions::Migration),
            Box::new(m20261101_010001_mcp_proxy_grants::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}
