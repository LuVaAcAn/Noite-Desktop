use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, io::Cursor};
use symphonia::{
    core::{
        codecs::{CodecParameters, DecoderOptions, CODEC_TYPE_NULL},
        errors::Error as SymphoniaError,
        formats::FormatOptions,
        io::MediaSourceStream,
        meta::MetadataOptions,
        probe::Hint,
    },
    default::{get_codecs, get_probe},
};
use tauri::AppHandle;

use crate::{CommandError, CommandResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAudio {
    storage_path: String,
    absolute_path: String,
    mime_type: String,
}

fn audio_extension(mime: &str, bytes: &[u8]) -> Option<&'static str> {
    match mime {
        "audio/mpeg" | "audio/mp3" if bytes.starts_with(b"ID3") || bytes.first() == Some(&0xff) => {
            Some("mp3")
        }
        "audio/wav" | "audio/x-wav"
            if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") =>
        {
            Some("wav")
        }
        "audio/ogg" | "application/ogg" if bytes.starts_with(b"OggS") => Some("ogg"),
        "audio/mp4" | "audio/x-m4a" | "audio/aac" if bytes.get(4..8) == Some(b"ftyp") => {
            Some("m4a")
        }
        "audio/aac" if bytes.len() > 2 && bytes[0] == 0xff && bytes[1] & 0xf6 == 0xf0 => {
            Some("aac")
        }
        _ => None,
    }
}

fn decodable_track(parameters: &CodecParameters) -> bool {
    parameters.codec != CODEC_TYPE_NULL
}

fn audio_error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

fn incompatible_audio() -> CommandError {
    audio_error(
        "unsupported_audio",
        "Tu archivo no es compatible con Noite. Importa un MP3, M4A, WAV u OGG compatible.",
    )
}

fn validate_audio_decode(bytes: &[u8], extension: &str) -> CommandResult<()> {
    let mut hint = Hint::new();
    hint.with_extension(extension);
    let stream = MediaSourceStream::new(Box::new(Cursor::new(bytes.to_vec())), Default::default());
    let probed = get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| incompatible_audio())?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|track| decodable_track(&track.codec_params))
        .ok_or_else(incompatible_audio)?;
    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let mut decoder = get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|_| incompatible_audio())?;

    // Decodificar al menos un paquete evita aceptar archivos que únicamente
    // imitan una firma válida o que contienen una pista dañada.
    for _ in 0..64 {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => break,
        };
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) if decoded.frames() > 0 => return Ok(()),
            Ok(_) | Err(SymphoniaError::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }
    Err(incompatible_audio())
}

#[tauri::command]
pub fn import_audio_data_url(
    app: AppHandle,
    data_url: String,
    file_name: String,
) -> CommandResult<ImportedAudio> {
    const MAX_BYTES: usize = 100 * 1024 * 1024;
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| audio_error("invalid_audio_data", "El audio no tiene un formato válido."))?;
    if !header.starts_with("data:audio/") || !header.ends_with(";base64") {
        return Err(audio_error(
            "invalid_audio_source",
            "Solo se admiten archivos de audio locales.",
        ));
    }
    let mime = header
        .trim_start_matches("data:")
        .trim_end_matches(";base64");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| audio_error("unreadable_audio", "No se pudo leer el audio."))?;
    if bytes.len() > MAX_BYTES {
        return Err(audio_error(
            "audio_too_large",
            "El audio supera los 100 MB permitidos.",
        ));
    }
    let extension = audio_extension(mime, &bytes).ok_or_else(incompatible_audio)?;
    validate_audio_decode(&bytes, extension)?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let hint: String = file_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(32)
        .collect();
    let name = if hint.is_empty() {
        format!("{digest}.{extension}")
    } else {
        format!("{hint}-{}.{extension}", &digest[..16])
    };
    let storage_path = format!("media/music/{name}");
    let absolute = crate::safe_media_path(&app, &storage_path).map_err(CommandError::from)?;
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).map_err(|cause| CommandError::from(cause.to_string()))?;
    }
    if !absolute.exists() {
        let temporary = absolute.with_extension(format!("{extension}.part"));
        fs::write(&temporary, bytes).map_err(|cause| CommandError::from(cause.to_string()))?;
        fs::rename(&temporary, &absolute).map_err(|cause| {
            let _ = fs::remove_file(&temporary);
            CommandError::from(cause.to_string())
        })?;
    }
    Ok(ImportedAudio {
        storage_path,
        absolute_path: absolute.to_string_lossy().into_owned(),
        mime_type: mime.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_pcm_wav() -> Vec<u8> {
        let samples = [0_i16, 512, -512, 0];
        let data_len = (samples.len() * 2) as u32;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&8_000_u32.to_le_bytes());
        bytes.extend_from_slice(&16_000_u32.to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn recognizes_supported_headers() {
        assert_eq!(audio_extension("audio/mpeg", b"ID3test"), Some("mp3"));
        assert_eq!(audio_extension("audio/ogg", b"OggStest"), Some("ogg"));
        assert_eq!(audio_extension("audio/mpeg", b"not audio"), None);
    }

    #[test]
    fn decodes_before_accepting_audio() {
        assert!(validate_audio_decode(&minimal_pcm_wav(), "wav").is_ok());
        assert!(validate_audio_decode(b"RIFFfakeWAVE", "wav").is_err());
    }
}
