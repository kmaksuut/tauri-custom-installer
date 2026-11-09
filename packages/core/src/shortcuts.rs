use std::fs;
use std::path::{Path, PathBuf};

pub fn get_desktop_dir() -> Option<PathBuf> {
    dirs::desktop_dir()
}

pub fn get_start_menu_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Some(roaming) = dirs::data_dir() {
            let start_menu = roaming
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs");
            if start_menu.exists() {
                return Some(start_menu);
            }
        }
    }
    None
}

pub fn get_common_start_menu_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(program_data) = std::env::var("ProgramData") {
            let p = PathBuf::from(program_data)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs");
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

pub fn get_common_desktop_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(public_dir) = std::env::var("PUBLIC") {
            let p = PathBuf::from(public_dir).join("Desktop");
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

/// Creates a Windows `.lnk` shortcut using native Win32 COM (`IShellLinkW` + `IPersistFile`)
/// without spawning PowerShell or any external process.
pub fn create_shortcut(
    target_exe: &Path,
    shortcut_path: &Path,
    description: &str,
    working_dir: &Path,
) -> Result<(), String> {
    create_shortcut_with_aumid(target_exe, shortcut_path, description, working_dir, None)
}

/// Creates a Windows `.lnk` shortcut via Win32 COM and optionally stamps `System.AppUserModel.ID`
/// via `IPropertyStore` so Windows Toast Notifications (`tauri-plugin-notification`) and taskbar
/// grouping work out of the box (matching Tauri NSIS/MSI parity).
pub fn create_shortcut_with_aumid(
    target_exe: &Path,
    shortcut_path: &Path,
    description: &str,
    working_dir: &Path,
    app_user_model_id: Option<&str>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::core::GUID;
        use windows_sys::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };

        if let Some(parent) = shortcut_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create shortcut parent directory: {}", e))?;
        }

        fn to_wide(s: &std::ffi::OsStr) -> Vec<u16> {
            let mut v: Vec<u16> = s.encode_wide().collect();
            v.push(0);
            v
        }

        const CLSID_SHELL_LINK: GUID = GUID {
            data1: 0x00021401,
            data2: 0x0000,
            data3: 0x0000,
            data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
        };
        const IID_ISHELL_LINK_W: GUID = GUID {
            data1: 0x000214F9,
            data2: 0x0000,
            data3: 0x0000,
            data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
        };
        const IID_IPERSIST_FILE: GUID = GUID {
            data1: 0x0000010B,
            data2: 0x0000,
            data3: 0x0000,
            data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
        };
        const IID_IPROPERTY_STORE: GUID = GUID {
            data1: 0x886D8EEB,
            data2: 0x8CF2,
            data3: 0x4446,
            data4: [0x8D, 0x02, 0xCD, 0xBA, 0x1D, 0xBD, 0xCF, 0x99],
        };

        #[repr(C)]
        struct PropertyKey {
            fmtid: GUID,
            pid: u32,
        }

        const PKEY_APP_USER_MODEL_ID: PropertyKey = PropertyKey {
            fmtid: GUID {
                data1: 0x9F4C2855,
                data2: 0x9F79,
                data3: 0x4B39,
                data4: [0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3],
            },
            pid: 5,
        };

        #[repr(C)]
        struct PropVariantRaw {
            vt: u16,
            w_reserved1: u16,
            w_reserved2: u16,
            w_reserved3: u16,
            data_ptr: *const u16,
            _pad: usize,
        }

        #[repr(C)]
        struct IShellLinkWVtbl {
            query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
            add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
            release: unsafe extern "system" fn(*mut c_void) -> u32,
            get_path: *const c_void,
            get_id_list: *const c_void,
            set_id_list: *const c_void,
            get_description: *const c_void,
            set_description: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
            get_working_directory: *const c_void,
            set_working_directory: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
            get_arguments: *const c_void,
            set_arguments: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
            get_hotkey: *const c_void,
            set_hotkey: *const c_void,
            get_show_cmd: *const c_void,
            set_show_cmd: *const c_void,
            get_icon_location: *const c_void,
            set_icon_location: unsafe extern "system" fn(*mut c_void, *const u16, i32) -> i32,
            set_relative_path: *const c_void,
            resolve: *const c_void,
            set_path: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
        }

        #[repr(C)]
        struct IShellLinkWObj {
            vtbl: *const IShellLinkWVtbl,
        }

        #[repr(C)]
        struct IPersistFileVtbl {
            query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
            add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
            release: unsafe extern "system" fn(*mut c_void) -> u32,
            get_class_id: *const c_void,
            is_dirty: *const c_void,
            load: *const c_void,
            save: unsafe extern "system" fn(*mut c_void, *const u16, i32) -> i32,
            save_completed: *const c_void,
            get_cur_file: *const c_void,
        }

        #[repr(C)]
        struct IPersistFileObj {
            vtbl: *const IPersistFileVtbl,
        }

        #[repr(C)]
        struct IPropertyStoreVtbl {
            query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
            add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
            release: unsafe extern "system" fn(*mut c_void) -> u32,
            get_count: *const c_void,
            get_at: *const c_void,
            get_value: *const c_void,
            set_value: unsafe extern "system" fn(*mut c_void, *const PropertyKey, *const PropVariantRaw) -> i32,
            commit: unsafe extern "system" fn(*mut c_void) -> i32,
        }

        #[repr(C)]
        struct IPropertyStoreObj {
            vtbl: *const IPropertyStoreVtbl,
        }

        unsafe {
            let hr_init = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            let should_uninit = hr_init >= 0;

            let mut shell_link_ptr: *mut c_void = std::ptr::null_mut();
            let hr = CoCreateInstance(
                &CLSID_SHELL_LINK,
                std::ptr::null_mut(),
                CLSCTX_INPROC_SERVER,
                &IID_ISHELL_LINK_W,
                &mut shell_link_ptr,
            );
            if hr < 0 || shell_link_ptr.is_null() {
                if should_uninit {
                    CoUninitialize();
                }
                return Err(format!("CoCreateInstance(IShellLinkW) failed: 0x{:08X}", hr));
            }

            let shell_link = shell_link_ptr as *mut IShellLinkWObj;
            let vtbl = &*(*shell_link).vtbl;

            let target_w = to_wide(target_exe.as_os_str());
            let work_w = to_wide(working_dir.as_os_str());
            let desc_w = to_wide(std::ffi::OsStr::new(description));
            let shortcut_w = to_wide(shortcut_path.as_os_str());

            let _ = (vtbl.set_path)(shell_link_ptr, target_w.as_ptr());
            let _ = (vtbl.set_working_directory)(shell_link_ptr, work_w.as_ptr());
            let _ = (vtbl.set_description)(shell_link_ptr, desc_w.as_ptr());
            let _ = (vtbl.set_icon_location)(shell_link_ptr, target_w.as_ptr(), 0);

            // Stamp System.AppUserModel.ID if provided
            if let Some(aumid) = app_user_model_id {
                if !aumid.trim().is_empty() {
                    let mut prop_store_ptr: *mut c_void = std::ptr::null_mut();
                    let hr_ps = (vtbl.query_interface)(
                        shell_link_ptr,
                        &IID_IPROPERTY_STORE,
                        &mut prop_store_ptr,
                    );
                    if hr_ps >= 0 && !prop_store_ptr.is_null() {
                        let prop_store = prop_store_ptr as *mut IPropertyStoreObj;
                        let ps_vtbl = &*(*prop_store).vtbl;
                        let aumid_w = to_wide(std::ffi::OsStr::new(aumid));
                        let pv = PropVariantRaw {
                            vt: 31, // VT_LPWSTR
                            w_reserved1: 0,
                            w_reserved2: 0,
                            w_reserved3: 0,
                            data_ptr: aumid_w.as_ptr(),
                            _pad: 0,
                        };
                        let _ = (ps_vtbl.set_value)(prop_store_ptr, &PKEY_APP_USER_MODEL_ID, &pv);
                        let _ = (ps_vtbl.commit)(prop_store_ptr);
                        let _ = (ps_vtbl.release)(prop_store_ptr);
                    }
                }
            }

            // Save via IPersistFile
            let mut persist_ptr: *mut c_void = std::ptr::null_mut();
            let hr_pf = (vtbl.query_interface)(
                shell_link_ptr,
                &IID_IPERSIST_FILE,
                &mut persist_ptr,
            );
            if hr_pf < 0 || persist_ptr.is_null() {
                let _ = (vtbl.release)(shell_link_ptr);
                if should_uninit {
                    CoUninitialize();
                }
                return Err(format!("QueryInterface(IPersistFile) failed: 0x{:08X}", hr_pf));
            }

            let persist = persist_ptr as *mut IPersistFileObj;
            let pf_vtbl = &*(*persist).vtbl;
            let hr_save = (pf_vtbl.save)(persist_ptr, shortcut_w.as_ptr(), 1);

            let _ = (pf_vtbl.release)(persist_ptr);
            let _ = (vtbl.release)(shell_link_ptr);

            if should_uninit {
                CoUninitialize();
            }

            if hr_save < 0 {
                return Err(format!("IPersistFile::Save failed: 0x{:08X}", hr_save));
            }
        }

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = target_exe;
        let _ = shortcut_path;
        let _ = description;
        let _ = working_dir;
        let _ = app_user_model_id;
        Ok(())
    }
}

/// Opens a native Windows Explorer modern folder picker dialog (`IFileOpenDialog` with `FOS_PICKFOLDERS`)
/// without spawning PowerShell or WinForms.
pub fn pick_folder_dialog(initial_path: Option<&str>) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::core::GUID;
        use windows_sys::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows_sys::Win32::UI::Shell::SHCreateItemFromParsingName;

        fn to_wide(s: &str) -> Vec<u16> {
            let mut v: Vec<u16> = std::ffi::OsStr::new(s).encode_wide().collect();
            v.push(0);
            v
        }

        const CLSID_FILE_OPEN_DIALOG: GUID = GUID {
            data1: 0xDC1C5A9C,
            data2: 0xE88A,
            data3: 0x4DDE,
            data4: [0xA5, 0xA1, 0x60, 0xF8, 0x2A, 0x20, 0xAE, 0xF7],
        };
        const IID_IFILE_OPEN_DIALOG: GUID = GUID {
            data1: 0xD57C7288,
            data2: 0xD4AD,
            data3: 0x4768,
            data4: [0xBE, 0x02, 0x9D, 0x96, 0x95, 0x32, 0xD9, 0x60],
        };
        const IID_ISHELL_ITEM: GUID = GUID {
            data1: 0x43826D1E,
            data2: 0xE718,
            data3: 0x42EE,
            data4: [0xBC, 0x55, 0xA1, 0xE2, 0x61, 0xC3, 0x7B, 0xFE],
        };

        const FOS_PICKFOLDERS: u32 = 0x00000020;
        const FOS_FORCEFILESYSTEM: u32 = 0x00000040;
        const FOS_PATHMUSTEXIST: u32 = 0x00000800;
        const SIGDN_FILESYSPATH: i32 = -2147123200i32; // 0x80058000

        #[repr(C)]
        struct IFileOpenDialogVtbl {
            query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
            add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
            release: unsafe extern "system" fn(*mut c_void) -> u32,
            // IModalWindow
            show: unsafe extern "system" fn(*mut c_void, isize) -> i32,
            // IFileDialog
            set_file_types: *const c_void,
            set_file_type_index: *const c_void,
            get_file_type_index: *const c_void,
            advise: *const c_void,
            unadvise: *const c_void,
            set_options: unsafe extern "system" fn(*mut c_void, u32) -> i32,
            get_options: unsafe extern "system" fn(*mut c_void, *mut u32) -> i32,
            set_default_folder: unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32,
            set_folder: unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32,
            get_folder: *const c_void,
            get_current_selection: *const c_void,
            set_file_name: *const c_void,
            get_file_name: *const c_void,
            set_title: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
            set_ok_button_label: *const c_void,
            set_file_name_label: *const c_void,
            get_result: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32,
        }

        #[repr(C)]
        struct IFileOpenDialogObj {
            vtbl: *const IFileOpenDialogVtbl,
        }

        #[repr(C)]
        struct IShellItemVtbl {
            query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
            add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
            release: unsafe extern "system" fn(*mut c_void) -> u32,
            bind_to_handler: *const c_void,
            get_parent: *const c_void,
            get_display_name: unsafe extern "system" fn(*mut c_void, i32, *mut *mut u16) -> i32,
        }

        #[repr(C)]
        struct IShellItemObj {
            vtbl: *const IShellItemVtbl,
        }

        unsafe {
            let hr_init = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            let should_uninit = hr_init >= 0;

            let mut dlg_ptr: *mut c_void = std::ptr::null_mut();
            let hr = CoCreateInstance(
                &CLSID_FILE_OPEN_DIALOG,
                std::ptr::null_mut(),
                CLSCTX_INPROC_SERVER,
                &IID_IFILE_OPEN_DIALOG,
                &mut dlg_ptr,
            );
            if hr < 0 || dlg_ptr.is_null() {
                if should_uninit {
                    CoUninitialize();
                }
                return Err(format!("CoCreateInstance(IFileOpenDialog) failed: 0x{:08X}", hr));
            }

            let dlg = dlg_ptr as *mut IFileOpenDialogObj;
            let vtbl = &*(*dlg).vtbl;

            let mut options: u32 = 0;
            let _ = (vtbl.get_options)(dlg_ptr, &mut options);
            let _ = (vtbl.set_options)(
                dlg_ptr,
                options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST,
            );

            let title_w = to_wide("Select Installation Directory");
            let _ = (vtbl.set_title)(dlg_ptr, title_w.as_ptr());

            if let Some(init) = initial_path {
                let mut existing = PathBuf::from(init);
                while !existing.exists() {
                    if let Some(p) = existing.parent() {
                        existing = p.to_path_buf();
                    } else {
                        break;
                    }
                }
                if existing.exists() {
                    let init_w = to_wide(&existing.to_string_lossy());
                    let mut folder_item: *mut c_void = std::ptr::null_mut();
                    let hr_item = SHCreateItemFromParsingName(
                        init_w.as_ptr(),
                        std::ptr::null_mut(),
                        &IID_ISHELL_ITEM,
                        &mut folder_item,
                    );
                    if hr_item >= 0 && !folder_item.is_null() {
                        let _ = (vtbl.set_folder)(dlg_ptr, folder_item);
                        let item_obj = folder_item as *mut IShellItemObj;
                        let _ = ((*(*item_obj).vtbl).release)(folder_item);
                    }
                }
            }

            let hr_show = (vtbl.show)(dlg_ptr, 0);
            if hr_show < 0 {
                // User cancelled (ERROR_CANCELLED = 0x800704C7) or closed dialog
                let _ = (vtbl.release)(dlg_ptr);
                if should_uninit {
                    CoUninitialize();
                }
                return Ok(None);
            }

            let mut result_item: *mut c_void = std::ptr::null_mut();
            let hr_res = (vtbl.get_result)(dlg_ptr, &mut result_item);
            let mut selected_path: Option<String> = None;

            if hr_res >= 0 && !result_item.is_null() {
                let item = result_item as *mut IShellItemObj;
                let item_vtbl = &*(*item).vtbl;
                let mut psz_path: *mut u16 = std::ptr::null_mut();
                let hr_name = (item_vtbl.get_display_name)(result_item, SIGDN_FILESYSPATH, &mut psz_path);
                if hr_name >= 0 && !psz_path.is_null() {
                    let mut len = 0usize;
                    while *psz_path.add(len) != 0 {
                        len += 1;
                    }
                    let slice = std::slice::from_raw_parts(psz_path, len);
                    selected_path = Some(String::from_utf16_lossy(slice));
                    CoTaskMemFree(psz_path as *const c_void);
                }
                let _ = (item_vtbl.release)(result_item);
            }

            let _ = (vtbl.release)(dlg_ptr);
            if should_uninit {
                CoUninitialize();
            }

            return Ok(selected_path);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = initial_path;
        Ok(None)
    }
}

pub fn remove_shortcuts(app_name: &str, start_menu_folder: Option<&str>, recorded_shortcuts: &[String]) {
    for path_str in recorded_shortcuts {
        let p = Path::new(path_str);
        if p.exists() && p.extension().map(|e| e.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
            let _ = fs::remove_file(p);
        }
    }

    for desktop in [get_desktop_dir(), get_common_desktop_dir()].into_iter().flatten() {
        let lnk = desktop.join(format!("{}.lnk", app_name));
        if lnk.exists() {
            let _ = fs::remove_file(lnk);
        }
    }

    for start_menu in [get_start_menu_dir(), get_common_start_menu_dir()].into_iter().flatten() {
        let lnk = start_menu.join(format!("{}.lnk", app_name));
        if lnk.exists() {
            let _ = fs::remove_file(lnk);
        }
        if let Some(folder) = start_menu_folder {
            let sub = start_menu.join(folder);
            let sub_lnk = sub.join(format!("{}.lnk", app_name));
            if sub_lnk.exists() {
                let _ = fs::remove_file(sub_lnk);
            }
            let _ = fs::remove_dir(&sub);
        }
    }
}
