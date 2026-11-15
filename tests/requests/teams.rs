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

use loco_rs::testing::prelude::*;
use mcpsec::app::App;
use serial_test::serial;

#[tokio::test]
#[serial]
async fn unauthenticated_teams_list_returns_401() {
    request::<App, _, _>(|request, _ctx| async move {
        let res = request.get("/api/teams/").await;
        assert_eq!(res.status_code(), 401);
    })
    .await;
}
