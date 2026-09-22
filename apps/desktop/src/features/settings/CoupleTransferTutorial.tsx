import { Button } from '../../components/ui/Button';

export function CoupleTransferTutorial({ onClose }: { onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="transfer-tutorial-title" className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4">
    <section className="my-auto w-full max-w-2xl rounded-2xl border border-noche-border bg-noche-surface p-6 text-noche-text shadow-2xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-noche-muted">Ayuda para parejas · Modo local</p>
      <h2 id="transfer-tutorial-title" className="mt-2 text-xl font-semibold">Cómo compartir sus datos</h2>
      <p className="mt-3 text-sm leading-6 text-noche-muted">En cada computadora, elijan su nombre en Ajustes → Perfil → Quién soy en este equipo. Al cambiar se bloquean las bóvedas y se verifica el acceso del perfil; la elección no viene del archivo que envía la otra persona.</p>
      <p className="mt-3 text-sm leading-6 text-noche-muted">Primero, abran Ajustes → Perfil → Nombres de la pareja, escriban y confirmen ambos nombres. En «Idea de» podrán elegir a cualquiera de los dos o «Ambos». Al recibir un respaldo, comparen y confirmen los nombres antes de reemplazar sus datos.</p>
      <p className="mt-3 text-sm leading-6 text-noche-muted">Cada computadora guarda su propia copia. Para compartir los cambios, exporten un archivo .noche y revisen su contenido antes de importarlo en el otro equipo.</p>
      <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6">
        <strong>Antes de compartir: es una copia completa, no solo las actividades.</strong>
        <p>Puede incluir recuerdos, fotos, audio, perfil, preferencias, bóveda y credenciales de portadas. Compártanla solo si ambos aceptan transferir ese contenido privado. Quien tenga el archivo y su contraseña podrá importarlo.</p>
      </div>
      <ol className="mt-5 list-decimal space-y-4 pl-5 text-sm leading-6 text-noche-muted">
        <li><strong className="text-noche-text">Acuerden quién prepara la copia.</strong> Elijan el equipo que tiene la información más reciente. Antes de recibir cambios, cada persona debe guardar su propio respaldo en un archivo distinto.</li>
        <li><strong className="text-noche-text">Quien envía: Ajustes → Datos → Crear respaldo.</strong> En la aplicación de Windows, elijan dónde guardarlo y creen una contraseña de al menos 12 caracteres. Consérvenla: Noite no puede recuperarla. Esperen el aviso de respaldo guardado.</li>
        <li><strong className="text-noche-text">Envíen el archivo .noche.</strong> Usen un medio de confianza, como una memoria USB o un mensaje adjunto como documento. No cambien su extensión ni lo descompriman. Envíen la contraseña por un canal separado.</li>
        <li><strong className="text-noche-text">Quien recibe: Ajustes → Datos → Abrir respaldo.</strong> Descarguen el archivo, selecciónenlo e introduzcan su contraseña. Revisen la fecha, el contenido y las advertencias antes de continuar.</li>
        <li><strong className="text-noche-text">Confirmen solo después de revisar.</strong> Importar reemplaza datos; no combina dos bibliotecas. Marquen la confirmación y escriban la palabra que muestre Noite. La aplicación se recargará al terminar.</li>
        <li><strong className="text-noche-text">Para la siguiente entrega, túrnense.</strong> Quien recibió puede editar y enviar un nuevo respaldo. No editen ambos copias distintas al mismo tiempo: esos cambios no se fusionan automáticamente.</li>
      </ol>
      <p className="mt-5 text-sm leading-6 text-noche-muted">Los juegos instalados y sus rutas no viajan en el respaldo. En el otro equipo, vuelvan a buscar los juegos instalados. Si no desean compartir información privada, no envíen este respaldo completo: todavía no existe una exportación exclusiva para parejas.</p>
      <div className="mt-5 flex justify-end"><Button onClick={onClose}>Entendido</Button></div>
    </section>
  </div>;
}
