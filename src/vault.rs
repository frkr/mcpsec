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

//! Encrypted credential vault for upstream MCP server headers.
//!
//! Uses AES-256-GCM with a 96-bit random nonce per encryption. The 256-bit key
//! is derived via SHA-256 from `MCPSEC_VAULT_KEY` (falling back to `JWT_SECRET`
//! or a development-only default so local dev/tests work without extra setup).

use std::collections::BTreeMap;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};

const PREFIX: &str = "v1:";
const NONCE_LEN: usize = 12;

fn derive_key() -> [u8; 32] {
    let secret = std::env::var("MCPSEC_VAULT_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            std::env::var("JWT_SECRET")
                .ok()
                .filter(|s| !s.trim().is_empty())
        })
        .unwrap_or_else(|| "mcpsec-dev-vault-key-change-in-production".to_string());
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hasher.finalize().into()
}

/// Encrypts a map of HTTP header name -> value into a `v1:<base64>` string.
///
/// # Errors
///
/// Returns an error string if serialization or AES-GCM encryption fails.
pub fn encrypt_headers(headers: &BTreeMap<String, String>) -> Result<String, String> {
    let plaintext = serde_json::to_vec(headers).map_err(|e| format!("serialize headers: {e}"))?;
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("vault key: {e}"))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::rng().fill_bytes(&mut nonce_bytes);
    #[allow(deprecated)]
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| format!("encrypt headers: {e}"))?;

    let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(format!("{PREFIX}{}", B64.encode(combined)))
}

/// Decrypts a `v1:<base64>` string back into a map of HTTP header name -> value.
///
/// # Errors
///
/// Returns an error string if the format is invalid, base64 decoding fails,
/// or AES-GCM authentication fails.
pub fn decrypt_headers(encoded: &str) -> Result<BTreeMap<String, String>, String> {
    let payload = encoded
        .strip_prefix(PREFIX)
        .ok_or_else(|| "unsupported vault payload version".to_string())?;
    let combined = B64
        .decode(payload)
        .map_err(|e| format!("decode vault payload: {e}"))?;
    if combined.len() <= NONCE_LEN {
        return Err("corrupted vault payload".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("vault key: {e}"))?;
    #[allow(deprecated)]
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("decrypt headers: {e}"))?;
    serde_json::from_slice(&plaintext).map_err(|e| format!("parse vault headers: {e}"))
}
