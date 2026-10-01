//! SHA-256 hashing with streaming I/O so large files do not sit in RAM.

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::core::error::AppResult;

const BUFFER: usize = 1024 * 1024;

pub fn sha256_file(path: &Path) -> AppResult<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(BUFFER, file);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; BUFFER];
    loop {
        let read = reader.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_empty() {
        // SHA-256 of empty input is a well-known constant.
        assert_eq!(
            sha256_bytes(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
