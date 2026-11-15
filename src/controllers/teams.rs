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

use axum::http::StatusCode;
use loco_rs::prelude::*;
use sea_orm::{EntityTrait, QueryOrder};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::models::{_entities::users as users_entity, team_members, teams, users};

#[derive(Debug, Serialize, TS)]
#[ts(export, export_to = "../frontend/src/bindings/")]
pub struct TeamResponse {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<teams::Model> for TeamResponse {
    fn from(m: teams::Model) -> Self {
        Self {
            id: m.id,
            name: m.name.unwrap_or_default(),
            description: m.description,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize, TS)]
#[ts(export, export_to = "../frontend/src/bindings/")]
pub struct TeamMemberResponse {
    pub id: i32,
    pub team_id: i32,
    pub user_id: i64,
    pub email: String,
    pub name: String,
    pub instance_role: String,
    pub team_role: String,
}

impl From<team_members::MemberWithUser> for TeamMemberResponse {
    fn from(m: team_members::MemberWithUser) -> Self {
        Self {
            id: m.id,
            team_id: m.team_id,
            user_id: m.user_id,
            email: m.email,
            name: m.name,
            instance_role: m.instance_role,
            team_role: m.team_role,
        }
    }
}

#[derive(Debug, Serialize, TS)]
#[ts(export, export_to = "../frontend/src/bindings/")]
pub struct TeamDetailResponse {
    pub team: TeamResponse,
    pub members: Vec<TeamMemberResponse>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export, export_to = "../frontend/src/bindings/")]
pub struct UserSummaryResponse {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export, export_to = "../frontend/src/bindings/")]
pub struct CreateTeamRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export, export_to = "../frontend/src/bindings/")]
pub struct UpdateTeamRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export, export_to = "../frontend/src/bindings/")]
pub struct AddTeamMemberRequest {
    pub user_id: Option<i64>,
    pub email: Option<String>,
    pub role: String,
}

async fn load_auth_user(ctx: &AppContext, auth: &auth::JWT) -> Result<users::Model> {
    users::Model::find_by_pid(&ctx.db, &auth.claims.pid)
        .await
        .map_err(|_| Error::Unauthorized("unauthorized".to_string()))
}

fn require_admin(user: &users::Model) -> Result<()> {
    if !user.is_admin() {
        return Err(Error::CustomError(
            StatusCode::FORBIDDEN,
            loco_rs::controller::ErrorDetail::new("forbidden", "instance admin role required"),
        ));
    }
    Ok(())
}

fn map_model_err(err: ModelError) -> Error {
    match err {
        ModelError::EntityNotFound => Error::NotFound,
        ModelError::EntityAlreadyExists => {
            Error::BadRequest("team with this name already exists".to_string())
        }
        ModelError::Message(msg) => Error::BadRequest(msg),
        other => Error::Model(other),
    }
}

/// Lists teams visible to the current user.
///
/// Required role: Authenticated (any role). Instance Admins see all teams;
/// Team Managers (`manager`) and regular users (`user`) see only teams they belong to.
#[debug_handler]
pub async fn list(auth: auth::JWT, State(ctx): State<AppContext>) -> Result<Response> {
    let user = load_auth_user(&ctx, &auth).await?;
    let rows = if user.is_admin() {
        teams::Model::list_all(&ctx.db).await?
    } else {
        teams::Model::list_for_user(&ctx.db, user.id).await?
    };
    let out: Vec<TeamResponse> = rows.into_iter().map(TeamResponse::from).collect();
    format::json(out)
}

/// Creates a new team.
///
/// Required role: `admin` (Instance Admin).
#[debug_handler]
pub async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Json(body): Json<CreateTeamRequest>,
) -> Result<Response> {
    let user = load_auth_user(&ctx, &auth).await?;
    require_admin(&user)?;
    let team = teams::Model::create_team(&ctx.db, &body.name, body.description)
        .await
        .map_err(map_model_err)?;
    format::json(TeamResponse::from(team))
}

/// Returns team details and its member list.
///
/// Required role: `admin` (Instance Admin), or any member (`manager` / `user`) of the team.
#[debug_handler]
pub async fn show(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
) -> Result<Response> {
    let user = load_auth_user(&ctx, &auth).await?;
    let team = teams::Model::find_by_id(&ctx.db, id)
        .await
        .map_err(map_model_err)?;
    if !user.is_admin() && !team_members::Model::is_member(&ctx.db, id, user.id).await? {
        return Err(Error::CustomError(
            StatusCode::FORBIDDEN,
            loco_rs::controller::ErrorDetail::new(
                "forbidden",
                "team membership or admin role required",
            ),
        ));
    }
    let members = team_members::Model::list_for_team(&ctx.db, id).await?;
    format::json(TeamDetailResponse {
        team: TeamResponse::from(team),
        members: members.into_iter().map(TeamMemberResponse::from).collect(),
    })
}

/// Updates a team's name and description.
///
/// Required role: `admin` (Instance Admin).
#[debug_handler]
pub async fn update(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Json(body): Json<UpdateTeamRequest>,
) -> Result<Response> {
    let user = load_auth_user(&ctx, &auth).await?;
    require_admin(&user)?;
    let team = teams::Model::update_team(&ctx.db, id, &body.name, body.description)
        .await
        .map_err(map_model_err)?;
    format::json(TeamResponse::from(team))
}

/// Deletes a team and all its memberships.
///
/// Required role: `admin` (Instance Admin).
#[debug_handler]
pub async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
) -> Result<Response> {
    let user = load_auth_user(&ctx, &auth).await?;
    require_admin(&user)?;
    teams::Model::delete_team(&ctx.db, id)
        .await
        .map_err(map_model_err)?;
    format::empty()
}

/// Adds a regular user (`user`) or Team Manager (`manager`) to a team, or updates their team role.
///
/// Required role: `admin` (Instance Admin).
#[debug_handler]
pub async fn add_member(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Json(body): Json<AddTeamMemberRequest>,
) -> Result<Response> {
    let admin = load_auth_user(&ctx, &auth).await?;
    require_admin(&admin)?;

    let role = team_members::TeamMemberRole::parse(&body.role).map_err(map_model_err)?;
    let target_user_id = match (body.user_id, body.email.as_deref()) {
        (Some(uid), _) => uid,
        (None, Some(email)) => {
            let u = users::Model::find_by_email(&ctx.db, email.trim())
                .await
                .map_err(|_| Error::NotFound)?;
            u.id
        }
        (None, None) => {
            return Err(Error::BadRequest(
                "either user_id or email must be provided".to_string(),
            ));
        }
    };

    team_members::Model::add_or_update_member(&ctx.db, id, target_user_id, role)
        .await
        .map_err(map_model_err)?;

    let members = team_members::Model::list_for_team(&ctx.db, id).await?;
    let out: Vec<TeamMemberResponse> = members.into_iter().map(TeamMemberResponse::from).collect();
    format::json(out)
}

/// Removes a user or Team Manager from a team.
///
/// Required role: `admin` (Instance Admin).
#[debug_handler]
pub async fn remove_member(
    auth: auth::JWT,
    Path((id, user_id)): Path<(i32, i64)>,
    State(ctx): State<AppContext>,
) -> Result<Response> {
    let admin = load_auth_user(&ctx, &auth).await?;
    require_admin(&admin)?;
    team_members::Model::remove_member(&ctx.db, id, user_id)
        .await
        .map_err(map_model_err)?;
    format::empty()
}

/// Lists all instance users so an Instance Admin can assign them to teams.
///
/// Required role: `admin` (Instance Admin).
#[debug_handler]
pub async fn list_users(auth: auth::JWT, State(ctx): State<AppContext>) -> Result<Response> {
    let admin = load_auth_user(&ctx, &auth).await?;
    require_admin(&admin)?;
    let rows = users::Entity::find()
        .order_by_asc(users_entity::Column::Email)
        .all(&ctx.db)
        .await?;
    let out: Vec<UserSummaryResponse> = rows
        .into_iter()
        .map(|u| UserSummaryResponse {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
        })
        .collect();
    format::json(out)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/teams/")
        .add("/", get(list).post(create))
        .add("/users", get(list_users))
        .add("/{id}", get(show).put(update).delete(remove))
        .add("/{id}/members", post(add_member))
        .add("/{id}/members/{user_id}", delete(remove_member))
}
