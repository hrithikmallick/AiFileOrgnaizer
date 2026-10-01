//! HTTP client for the local FastAPI AI service.
//!
//! Network policy: the host must be loopback (`127.0.0.1` / `localhost`). Any
//! other host is refused so files never leave the machine.

use std::fs::File;
use std::io::Read;

use base64::Engine;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::core::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
pub struct AnalyzeRequest {
    pub filename: String,
    pub mime_type: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnalyzeResponse {
    pub category: String,
    pub subcategory: Option<String>,
    pub suggested_filename: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub confidence: f64,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub model_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExtractResponse {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub extraction_method: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbedResponse {
    #[serde(default)]
    pub embeddings: Vec<Vec<f32>>,
    #[serde(default)]
    pub dimension: usize,
    #[serde(default)]
    pub model_name: String,
}

#[derive(Debug, Clone)]
pub struct AiClient {
    base: String,
    http: reqwest::blocking::Client,
}

impl AiClient {
    pub fn new(base_url: &str) -> AppResult<Self> {
        assert_loopback(base_url)?;
        let http = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::Http(e.to_string()))?;
        Ok(Self {
            base: base_url.trim_end_matches('/').to_string(),
            http,
        })
    }

    pub fn health(&self) -> bool {
        self.http
            .get(format!("{}/health", self.base))
            .send()
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    pub fn analyze(&self, req: &AnalyzeRequest) -> AppResult<AnalyzeResponse> {
        let response = self
            .http
            .post(format!("{}/analyze", self.base))
            .json(req)
            .send()?;
        if !response.status().is_success() {
            return Err(AppError::AiService(format!(
                "analyze returned {}",
                response.status()
            )));
        }
        Ok(response.json()?)
    }

    /// Read a bounded prefix before crossing the local HTTP boundary.  The
    /// extractor and the service's text limits make large inputs safe to skip.
    pub fn extract(&self, path: &str, mime: &str, extension: Option<&str>) -> AppResult<ExtractResponse> {
        const MAX_EXTRACTION_BYTES: u64 = 10 * 1024 * 1024;
        #[derive(Serialize)]
        struct Body<'a> {
            content: String,
            encoding: &'static str,
            filename: &'a str,
            mime_type: &'a str,
            extension: Option<&'a str>,
        }
        let file = File::open(path)?;
        let mut bytes = Vec::new();
        file.take(MAX_EXTRACTION_BYTES).read_to_end(&mut bytes)?;
        let filename = std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(path);
        let response = self
            .http
            .post(format!("{}/extract", self.base))
            .json(&Body {
                content: base64::engine::general_purpose::STANDARD.encode(bytes),
                encoding: "base64",
                filename,
                mime_type: mime,
                extension,
            })
            .send();
        match response {
            Ok(r) if r.status().is_success() => r.json().map_err(Into::into),
            _ => Ok(ExtractResponse {
                text: String::new(),
                extraction_method: "unavailable".into(),
            }),
        }
    }

    pub fn embed(&self, text: &str) -> AppResult<EmbedResponse> {
        #[derive(Serialize)]
        struct Body<'a> {
            texts: [&'a str; 1],
        }
        let response = self
            .http
            .post(format!("{}/embed", self.base))
            .json(&Body { texts: [text] })
            .send()?;
        if !response.status().is_success() {
            return Ok(EmbedResponse {
                embeddings: Vec::new(),
                dimension: 0,
                model_name: String::new(),
            });
        }
        Ok(response.json()?)
    }

    pub fn configure_local_model(&self, base_url: &str, model_name: &str) -> AppResult<()> {
        #[derive(Serialize)]
        struct Body<'a> {
            base_url: &'a str,
            model_name: &'a str,
        }
        let response = self
            .http
            .post(format!("{}/runtime/local-model", self.base))
            .json(&Body {
                base_url,
                model_name,
            })
            .send()?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(AppError::AiService(format!(
                "local model configuration returned {}",
                response.status()
            )))
        }
    }

    pub fn disable_local_model(&self) -> AppResult<()> {
        let response = self
            .http
            .post(format!("{}/runtime/local-model/disable", self.base))
            .send()?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(AppError::AiService(format!(
                "local model disable returned {}",
                response.status()
            )))
        }
    }
}

fn assert_loopback(raw: &str) -> AppResult<()> {
    let parsed = Url::parse(raw).map_err(|e| AppError::AiService(e.to_string()))?;
    let host = parsed.host_str().unwrap_or("");
    if matches!(host, "127.0.0.1" | "localhost" | "::1") {
        Ok(())
    } else {
        Err(AppError::AiService(format!(
            "refusing non-loopback AI service host: {host}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_ok() {
        assert!(assert_loopback("http://127.0.0.1:8010").is_ok());
        assert!(assert_loopback("http://localhost:8010").is_ok());
    }

    #[test]
    fn remote_rejected() {
        assert!(assert_loopback("http://example.com").is_err());
    }
}
