//! Embebe metadatos de versión y un manifest de aplicación en el .exe de Windows.
//!
//! Un binario SIN FIRMAR pero con nombre de producto, empresa, versión y manifest
//! levanta muchas menos alarmas heurísticas de los antivirus (es el perfil "PE
//! pelado, diminuto y anónimo" el que dispara los ML genéricos tipo Webroot/
//! DeepInstinct), y SmartScreen muestra "Noctcom Connector" en lugar de un
//! genérico "editor desconocido". La firma Authenticode de verdad llegará con el
//! certificado EV; esto es la mejora coste-cero que ataca las dos cosas a la vez.
//!
//! FileVersion/ProductVersion las toma `winresource` de `CARGO_PKG_VERSION`.

fn main() {
    // Solo tiene sentido al compilar para Windows; en Linux/macOS no hace nada.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "windows" {
        return;
    }

    let mut res = winresource::WindowsResource::new();
    res.set("ProductName", "Noctcom Connector");
    res.set(
        "FileDescription",
        "Agente local de Noctcom — gestiona los discos de tu máquina desde la web",
    );
    res.set("CompanyName", "Redder Labs");
    res.set("LegalCopyright", "(C) 2026 Redder Labs. Licencia AGPL-3.0.");
    res.set("OriginalFilename", "noctcom-connector.exe");
    res.set("InternalName", "noctcom-connector");
    res.set_manifest_file("noctcom-connector.exe.manifest");

    if let Err(e) = res.compile() {
        // No abortar el build si el entorno no tiene toolchain de recursos: el
        // binario seguirá saliendo, solo que sin los metadatos embebidos.
        println!("cargo:warning=no se pudo embeber el version resource de Windows: {e}");
    }
}
