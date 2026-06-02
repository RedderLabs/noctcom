//! Rutas de configuración y estado persistente del agente (cross-platform).

use anyhow::{anyhow, Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn project_dirs() -> Result<ProjectDirs> {
    ProjectDirs::from("com", "Noctcom", "Connector")
        .ok_or_else(|| anyhow!("no se pudo determinar el directorio de configuración del SO"))
}

pub fn config_dir() -> Result<PathBuf> {
    Ok(project_dirs()?.config_dir().to_path_buf())
}

pub fn identity_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("identity.key"))
}

fn state_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("state.json"))
}

/// Estado persistente tras el emparejamiento.
#[derive(Serialize, Deserialize, Default)]
pub struct State {
    pub agent_id: Option<String>,
    pub server: Option<String>,
}

impl State {
    pub fn load() -> Result<Self> {
        let p = state_path()?;
        if !p.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read(&p).context("leyendo state.json")?;
        Ok(serde_json::from_slice(&raw).context("state.json corrupto")?)
    }

    pub fn save(&self) -> Result<()> {
        let p = state_path()?;
        if let Some(d) = p.parent() {
            std::fs::create_dir_all(d).context("creando el directorio de configuración")?;
        }
        std::fs::write(&p, serde_json::to_vec_pretty(self)?).context("guardando state.json")?;
        Ok(())
    }
}
