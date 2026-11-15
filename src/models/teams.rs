/*
   Copyright 2026 Davi Saranszky Mesquita

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

use loco_rs::prelude::*;
use sea_orm::{ActiveValue, ColumnTrait, EntityTrait, QueryFilter, QueryOrder};

use super::_entities::team_members;
pub use super::_entities::teams::{self, ActiveModel, Entity, Model};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

impl Model {
    /// Finds a team by ID.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError::EntityNotFound`] if the team does not exist.
    pub async fn find_by_id(db: &DatabaseConnection, id: i32) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// Lists all teams ordered by name.
    ///
    /// # Errors
    ///
    /// Returns a database error if the query fails.
    pub async fn list_all(db: &DatabaseConnection) -> ModelResult<Vec<Self>> {
        Ok(Entity::find()
            .order_by_asc(teams::Column::Name)
            .all(db)
            .await?)
    }

    /// Lists teams that a specific user belongs to.
    ///
    /// # Errors
    ///
    /// Returns a database error if the query fails.
    pub async fn list_for_user(db: &DatabaseConnection, user_id: i64) -> ModelResult<Vec<Self>> {
        let memberships = team_members::Entity::find()
            .filter(team_members::Column::UserId.eq(user_id))
            .all(db)
            .await?;
        let team_ids: Vec<i32> = memberships.into_iter().map(|m| m.team_id).collect();
        if team_ids.is_empty() {
            return Ok(Vec::new());
        }
        Ok(Entity::find()
            .filter(teams::Column::Id.is_in(team_ids))
            .order_by_asc(teams::Column::Name)
            .all(db)
            .await?)
    }

    /// Creates a new team with a unique non-empty name.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError::Message`] if the name is empty or already taken.
    pub async fn create_team(
        db: &DatabaseConnection,
        name: &str,
        description: Option<String>,
    ) -> ModelResult<Self> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(ModelError::Message("team name cannot be empty".to_string()));
        }
        if Entity::find()
            .filter(teams::Column::Name.eq(trimmed))
            .one(db)
            .await?
            .is_some()
        {
            return Err(ModelError::EntityAlreadyExists);
        }

        let desc = description
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty());

        let item = ActiveModel {
            name: ActiveValue::set(Some(trimmed.to_string())),
            description: ActiveValue::set(desc),
            ..Default::default()
        };
        Ok(item.insert(db).await?)
    }

    /// Updates a team's name and description.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError::EntityNotFound`] if the team does not exist, or
    /// [`ModelError::EntityAlreadyExists`] / [`ModelError::Message`] on invalid name.
    pub async fn update_team(
        db: &DatabaseConnection,
        id: i32,
        name: &str,
        description: Option<String>,
    ) -> ModelResult<Self> {
        let existing = Self::find_by_id(db, id).await?;
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(ModelError::Message("team name cannot be empty".to_string()));
        }
        if existing.name.as_deref() != Some(trimmed)
            && Entity::find()
                .filter(teams::Column::Name.eq(trimmed))
                .one(db)
                .await?
                .is_some()
        {
            return Err(ModelError::EntityAlreadyExists);
        }

        let desc = description
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty());

        let mut active: ActiveModel = existing.into();
        active.name = ActiveValue::set(Some(trimmed.to_string()));
        active.description = ActiveValue::set(desc);
        Ok(active.update(db).await?)
    }

    /// Deletes a team by ID.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError::EntityNotFound`] if the team does not exist.
    pub async fn delete_team(db: &DatabaseConnection, id: i32) -> ModelResult<()> {
        let existing = Self::find_by_id(db, id).await?;
        let active: ActiveModel = existing.into();
        active.delete(db).await?;
        Ok(())
    }
}
