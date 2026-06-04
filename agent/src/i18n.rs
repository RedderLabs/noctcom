//! Internacionalización ligera ES/EN para la salida de consola del agente.
//!
//! Sin dependencias externas: detecta el idioma una sola vez a partir de la
//! variable `NOCTCOM_LANG` o, en su defecto, del locale del sistema. Por
//! defecto se queda en español (comportamiento histórico del agente).

use std::sync::OnceLock;

/// Idioma de la interfaz de línea de comandos.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    Es,
    En,
}

static LANG: OnceLock<Lang> = OnceLock::new();

/// Detecta el idioma una única vez y lo cachea.
///
/// Orden de resolución:
///   1. `NOCTCOM_LANG` = "en" → En; "es" → Es (sin distinguir mayúsculas).
///   2. Locale del sistema (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`): si el
///      valor en minúsculas empieza por "en" → En.
///   3. Por defecto: Es (sin regresión para los usuarios actuales).
pub fn lang() -> Lang {
    *LANG.get_or_init(detect)
}

fn detect() -> Lang {
    if let Ok(v) = std::env::var("NOCTCOM_LANG") {
        match v.trim().to_lowercase().as_str() {
            "en" => return Lang::En,
            "es" => return Lang::Es,
            _ => {}
        }
    }

    for key in ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        if let Ok(v) = std::env::var(key) {
            let v = v.trim().to_lowercase();
            if v.is_empty() {
                continue;
            }
            if v.starts_with("en") {
                return Lang::En;
            }
            // Cualquier otro locale no vacío mantiene el comportamiento por
            // defecto (español); dejamos de mirar variables menos prioritarias.
            return Lang::Es;
        }
    }

    Lang::Es
}

/// Elige la cadena en español o inglés según el idioma detectado.
///
/// Para textos con interpolación, construye el `String` con `format!` y pasa
/// ambas variantes ya formateadas.
pub fn pick<'a>(es: &'a str, en: &'a str) -> &'a str {
    match lang() {
        Lang::Es => es,
        Lang::En => en,
    }
}
