// En release no abrir consola en Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    noctcom_desktop_lib::run()
}
