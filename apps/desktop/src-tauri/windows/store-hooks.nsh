; Store-only NSIS hooks. The public installer continues using hooks.nsh and
; keeps its single per-user Start Menu shortcut. During MSIX capture, the
; package manifest is the sole owner of the Start Menu entry.

!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\Noite.exe" 0 noite_store_fresh_install
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION "Noite ya está instalado. El asistente reparará o actualizará los archivos de la aplicación sin modificar tus actividades, medios, respaldos ni contraseñas." IDOK noite_store_continue_install
  Abort
  noite_store_continue_install:
  noite_store_fresh_install:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Never capture an unpackaged NSIS shortcut in the Store MSIX. Remove both
  ; possible shell contexts so the manifest produces exactly one Start entry.
  SetShellVarContext current
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  SetShellVarContext all
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  SetShellVarContext current
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿También quieres eliminar todos los datos personales de Noite? Elige No para conservarlos y poder recuperarlos al reinstalar." IDNO noite_store_keep_data
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Esta acción eliminará actividades, recuerdos, medios, respaldos automáticos, API keys y almacenes de contraseñas. Los archivos .noche exportados fuera de la aplicación se conservarán. ¿Eliminar todo definitivamente?" IDNO noite_store_keep_data
  ExecWait '"$INSTDIR\Noite.exe" --uninstall-cleanup' $0
  IntCmp $0 0 noite_store_cleanup_complete
  MessageBox MB_OK|MB_ICONSTOP "Noite no pudo cerrar la aplicación o eliminar todos sus datos. La desinstalación se detuvo para evitar una limpieza incompleta. Cierra Noite y vuelve a intentarlo."
  Abort
  noite_store_cleanup_complete:
  noite_store_keep_data:
!macroend
