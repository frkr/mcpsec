use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(
            m,
            "team_members",
            &[("id", ColType::PkAuto), ("role", ColType::String)],
            &[("team", ""), ("user", "")],
        )
        .await?;
        m.create_index(
            Index::create()
                .name("idx_team_members_team_user")
                .table(Alias::new("team_members"))
                .col(Alias::new("team_id"))
                .col(Alias::new("user_id"))
                .unique()
                .to_owned(),
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "team_members").await
    }
}
