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
use sea_orm::{ActiveValue, ColumnTrait, EntityTrait, QueryFilter};

pub use super::_entities::team_members::{self, ActiveModel, Entity, Model};
use super::{teams, users};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

/// Role a user holds within a specific team.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeamMemberRole {
    /// Regular team member.
    User,
    /// Team Manager.
    Manager,
}

impl TeamMemberRole {
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Manager => "manager",
        }
    }

    /// Parses a team member role string.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError::Message`] if the role is not `"user"` or `"manager"`.
    pub fn parse(s: &str) -> ModelResult<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "user" | "member" => Ok(Self::User),
            "manager" => Ok(Self::Manager),
            other => Err(ModelError::Message(format!(
                "invalid team member role '{other}': expected 'user' or 'manager'"
            ))),
        }
    }
}

/// Team membership joined with user details.
#[derive(Debug, Clone)]
pub struct MemberWithUser {
    pub id: i32,
    pub team_id: i32,
    pub user_id: i64,
    pub email: String,
    pub name: String,
    pub instance_role: String,
    pub team_role: String,
}

impl Model {
    /// Adds a user to a team with the given role, or updates their role if already a member.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError::EntityNotFound`] if the team or user does not exist.
    pub async fn add_or_update_member(
        db: &DatabaseConnection,
        team_id: i32,
        user_id: i64,
        role: TeamMemberRole,
    ) -> ModelResult<Self> {
        teams::Model::find_by_id(db, team_id).await?;
        users::Entity::find_by_id(user_id)
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)?;

        if let Some(existing) = Entity::find()
            .filter(team_members::Column::TeamId.eq(team_id))
            .filter(team_members::Column::UserId.eq(user_id))
            .one(db)
            .await?
        {
            let mut active: ActiveModel = existing.into();
            active.role = ActiveValue::set(role.as_str().to_string());
            return Ok(active.update(db).await?);
        }

        let item = ActiveModel {
            team_id: ActiveValue::set(team_id),
            user_id: ActiveValue::set(user_id),
            role: ActiveValue::set(role.as_str().to_string()),
            ..Default::default()
        };
        Ok(item.insert(db).await?)
    }

    /// Removes a user from a team.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError::EntityNotFound`] if the membership does not exist.
    pub async fn remove_member(
        db: &DatabaseConnection,
        team_id: i32,
        user_id: i64,
    ) -> ModelResult<()> {
        let existing = Entity::find()
            .filter(team_members::Column::TeamId.eq(team_id))
            .filter(team_members::Column::UserId.eq(user_id))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)?;
        let active: ActiveModel = existing.into();
        active.delete(db).await?;
        Ok(())
    }

    /// Checks whether a user is a member of the given team.
    ///
    /// # Errors
    ///
    /// Returns a database error if the query fails.
    pub async fn is_member(
        db: &DatabaseConnection,
        team_id: i32,
        user_id: i64,
    ) -> ModelResult<bool> {
        Ok(Entity::find()
            .filter(team_members::Column::TeamId.eq(team_id))
            .filter(team_members::Column::UserId.eq(user_id))
            .one(db)
            .await?
            .is_some())
    }

    /// Lists all members of a team with their user details.
    ///
    /// # Errors
    ///
    /// Returns a database error if the query fails.
    pub async fn list_for_team(
        db: &DatabaseConnection,
        team_id: i32,
    ) -> ModelResult<Vec<MemberWithUser>> {
        let rows = Entity::find()
            .filter(team_members::Column::TeamId.eq(team_id))
            .find_also_related(users::Entity)
            .all(db)
            .await?;

        let mut out = Vec::with_capacity(rows.len());
        for (member, user_opt) in rows {
            if let Some(u) = user_opt {
                out.push(MemberWithUser {
                    id: member.id,
                    team_id: member.team_id,
                    user_id: member.user_id,
                    email: u.email,
                    name: u.name,
                    instance_role: u.role,
                    team_role: member.role,
                });
            }
        }
        Ok(out)
    }
}
