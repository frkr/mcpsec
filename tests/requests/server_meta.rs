/*

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

   END OF TERMS AND CONDITIONS

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

//! `PUT /api/servers/{id}/meta` — editing the display title/description.
//!
//! The route was registered as POST while the SPA sent PUT, so every save from
//! the server-detail screen answered 405. These tests pin the contract from
//! both sides: the verb the client actually uses, and the fallback.

use loco_rs::testing::prelude::*;
use mcpsec::app::App;
use mcpsec::models::mcp_servers;
use sea_orm::{ActiveModelTrait, EntityTrait, Set};
use serde_json::{json, Value};

use super::prepare_data;

async fn seed_server(ctx: &loco_rs::app::AppContext) -> mcp_servers::Model {
    let am = mcp_servers::ActiveModel {
        registry_name: Set("meta-target".to_string()),
        // The registry value the sync keeps overwriting.
        title: Set("Original Title".to_string()),
        description: Set(Some("Original description".to_string())),
        version: Set("1.0.0".to_string()),
        remote_url: Set("https://meta.example/mcp".to_string()),
        remote_type: Set("streamable-http".to_string()),
        registry_status: Set("active".to_string()),
        sync_source: Set(mcp_servers::SyncSource::Registry.as_str().to_string()),
        lifecycle: Set(mcp_servers::Lifecycle::Active.as_str().to_string()),
        enabled: Set(true),
        ..Default::default()
    };
    am.insert(&ctx.db).await.unwrap()
}

#[tokio::test]
#[serial_test::serial]
async fn put_meta_updates_display_fields_and_keeps_the_originals() {
    request::<App, _, _>(|request, ctx| async move {
        let logged_in = prepare_data::init_user_login(&request, &ctx).await;
        let server = seed_server(&ctx).await;

        // PUT is what the SPA sends: this exact verb must work.
        let response = request
            .put(format!("/api/servers/{}/meta", server.id).as_str())
            .json(&json!({
                "title": "Meu Título",
                "description": "Minha descrição"
            }))
            .add_header("authorization", format!("Bearer {}", logged_in.token))
            .await;
        assert_eq!(response.status_code(), 200, "{}", response.text());

        let body: Value = serde_json::from_str(&response.text()).unwrap();
        assert_eq!(body["title"], "Meu Título");
        assert_eq!(body["description"], "Minha descrição");
        // The registry values survive so a future sync can still refresh them
        // and the UI can offer "restore original".
        assert_eq!(body["original_title"], "Original Title");
        assert_eq!(body["original_description"], "Original description");
    })
    .await;
}

#[tokio::test]
#[serial_test::serial]
async fn post_meta_still_works_for_compatibility() {
    request::<App, _, _>(|request, ctx| async move {
        let logged_in = prepare_data::init_user_login(&request, &ctx).await;
        let server = seed_server(&ctx).await;

        let response = request
            .post(format!("/api/servers/{}/meta", server.id).as_str())
            .json(&json!({"title": "Via POST"}))
            .add_header("authorization", format!("Bearer {}", logged_in.token))
            .await;
        assert_eq!(response.status_code(), 200, "{}", response.text());
        let body: Value = serde_json::from_str(&response.text()).unwrap();
        assert_eq!(body["title"], "Via POST");
    })
    .await;
}

#[tokio::test]
#[serial_test::serial]
async fn empty_strings_clear_the_override() {
    request::<App, _, _>(|request, ctx| async move {
        let logged_in = prepare_data::init_user_login(&request, &ctx).await;
        let server = seed_server(&ctx).await;

        request
            .put(format!("/api/servers/{}/meta", server.id).as_str())
            .json(&json!({"title": "Custom", "description": "Custom desc"}))
            .add_header("authorization", format!("Bearer {}", logged_in.token))
            .await;

        // Blanking the field means "go back to the registry value".
        let response = request
            .put(format!("/api/servers/{}/meta", server.id).as_str())
            .json(&json!({"title": "", "description": "   "}))
            .add_header("authorization", format!("Bearer {}", logged_in.token))
            .await;
        assert_eq!(response.status_code(), 200, "{}", response.text());

        let body: Value = serde_json::from_str(&response.text()).unwrap();
        assert_eq!(body["title"], "Original Title");
        assert_eq!(body["description"], "Original description");

        let reloaded = mcp_servers::Entity::find_by_id(server.id)
            .one(&ctx.db)
            .await
            .unwrap()
            .unwrap();
        assert!(reloaded.custom_title.is_none());
        assert!(reloaded.custom_description.is_none());
    })
    .await;
}

#[tokio::test]
#[serial_test::serial]
async fn meta_on_a_missing_server_is_404_not_500() {
    request::<App, _, _>(|request, ctx| async move {
        let logged_in = prepare_data::init_user_login(&request, &ctx).await;
        let response = request
            .put("/api/servers/999999/meta")
            .json(&json!({"title": "x"}))
            .add_header("authorization", format!("Bearer {}", logged_in.token))
            .await;
        assert_eq!(response.status_code(), 404, "{}", response.text());
    })
    .await;
}

#[tokio::test]
#[serial_test::serial]
async fn meta_requires_auth() {
    request::<App, _, _>(|request, ctx| async move {
        let server = seed_server(&ctx).await;
        let response = request
            .put(format!("/api/servers/{}/meta", server.id).as_str())
            .json(&json!({"title": "x"}))
            .await;
        assert_eq!(response.status_code(), 401);
    })
    .await;
}
