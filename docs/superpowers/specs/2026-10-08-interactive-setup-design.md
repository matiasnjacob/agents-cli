# Instalador interactivo y configuración reproducible

Estado: especificación propuesta para revisión del usuario. Implementación pendiente.

## Objetivo y alcance

Permitir configurar un repositorio mediante `agents-cli setup`: elegir plataforma,
suite de agentes, tracker, MCPs y skills, revisar el resultado y aplicarlo sin
perder configuración ajena. La misma selección debe poder repetirse sin preguntas.

Se interpreta «suite» como dos elecciones independientes: runtime y preset de roles.
Se conservan Codex, OpenCode, Claude Code y Pi, Node.js >=20 y distribución por
GitHub Releases. El bootstrap instala el binario; `setup` configura el proyecto.
No se instalan runtimes ni se publican paquetes a npm en esta entrega.

## Comandos

```sh
agents-cli setup
agents-cli setup --config agents-cli.config.json --dry-run
agents-cli setup --config agents-cli.config.json --yes
agents-cli suites list
agents-cli mcp list --platform codex
agents-cli doctor
```

Se conserva el contrato de `init`, `skills list`, `skills add` y `update --dry-run`.
`setup` sin configuración necesita una terminal interactiva. Sin TTY debe devolver
un error accionable, sin esperar entrada. `--yes` aplica una configuración completa;
no inventa selecciones ni permisos. `--dry-run` no modifica proyecto, conexiones,
paquetes ni credenciales. Los argumentos desconocidos o incompletos se rechazan.

## Experiencia interactiva

1. Inspeccionar proyecto, configuración previa y disponibilidad de runtimes.
2. Elegir plataforma; lo detectado es una sugerencia, no una selección obligatoria.
3. Elegir preset y editar la lista de agentes.
4. Elegir tracker: Linear, Trello o ninguno.
5. Elegir MCPs compatibles y completar referencias de configuración requeridas.
6. Mostrar skills obligatorias por rol y elegir las recomendadas u otras.
7. Ofrecer JEV apagado, shadow o assist según su especificación independiente.
8. Mostrar selección, archivos afectados, conflictos, requisitos y pasos externos.
9. Confirmar aplicación, guardar configuración y ejecutar diagnósticos locales.

Cancelar o recibir EOF antes de aplicar no deja archivos ni ejecuta instalaciones.
La interfaz usa texto de terminal, selección numerada y listas de selección múltiple;
no necesita navegador ni un modelo de IA para funcionar.

## Catálogo y presets

| Preset | Agentes |
| --- | --- |
| complete | Los siete agentes actuales |
| backend | Orquestador, backend, reviewer, QA automator, QA manual |
| frontend | Orquestador, frontend, reviewer, QA automator, QA manual |
| review-qa | Reviewer, QA automator, QA manual |
| custom | Lista explícita de agentes existentes |

AWS puede agregarse a cualquier preset. El catálogo declara `requiredSkills` y
`recommendedSkills` por agente. Las dependencias obligatorias se incorporan al
resultado resuelto y se explican en el resumen. Los cuatro adaptadores renderizan
únicamente los roles seleccionados. Las rutas de skills de los prompts se resuelven
para la plataforma destino, eliminando dependencia funcional de `~/.agents/skills`.

## Configuración y propiedad

`agents-cli.config.json` contiene `schemaVersion`, `platform`, `suite`, `agents`,
`tracker`, `skills`, `mcps` y `decisionSupport`. Los identificadores, esquemas y
referencias se validan antes de producir un plan. Las referencias a secretos son
nombres de variables de entorno, nunca sus valores.

La configuración describe intención; `.agents-cli.lock.json` registra recursos
resueltos y hashes. Incluye procedencia y revisión de skills externas, selección de
agentes y conexiones administradas. Ambos formatos tienen versión de esquema.
Los lockfiles actuales siguen siendo legibles y migran al aplicar una operación.

`skills add` conserva selecciones previas y actualiza el inventario; los siguientes
diagnósticos y previews no deben perder la skill agregada. La detección de plataforma
no elige silenciosamente entre varias instalaciones: exige elección explícita.

## MCPs

El catálogo inicial incluye GitHub, Linear, Trello y la herramienta local JEV.
Cada entrada declara transporte, requisitos, campos de configuración, variables
requeridas y compatibilidad. Se validan comandos y endpoints contra documentación
primaria durante la implementación, antes de incorporarlos al catálogo publicado.

Seleccionar un tracker agrega su workflow y propone su MCP; el usuario puede dejar
la conexión pendiente. `none` no genera obligaciones de tracker.

Cada adaptador implementa únicamente los mecanismos de conexión que soporte su
runtime. Una combinación no soportada se informa como pendiente con instrucciones
concretas, sin emitir un archivo que aparente funcionar. Pi utiliza la herramienta
CLI de JEV descrita en su especificación, sin depender de una extensión del padre.

Las configuraciones JSON, JSONC o TOML existentes se modifican preservando claves
ajenas y detectando colisiones en las entradas administradas. Si el formato no
puede editarse sin pérdida, se informa conflicto y no se escribe. Un nombre de
variable puede serializarse como referencia solo cuando el runtime lo soporta;
no se expanden tokens al generar archivos.

Configurar conexiones es parte del plan de aplicación. No se instalan paquetes
globales ni se inician logins automáticamente. Se muestran los comandos de requisitos
y autenticación pendientes; esto debe distinguirse de una conexión operativa.

## Skills externas

Las skills portables siguen disponibles sin red. Se permite seleccionar fuentes
externas de GitHub mediante repositorio, revisión fija y ruta de skill; skills.sh
sirve para descubrir su procedencia. Se copia el directorio completo con sus recursos.
La revisión debe resolverse a un commit y registrarse junto a licencia y hashes.

La resolución externa usa staging separado antes de aplicar. No ejecuta scripts de
la skill. Rechaza rutas que escapen del directorio, symlinks externos, archivos
binarios no soportados y contenido sin licencia identificable. Un dry-run puede
consultar la red para resolver metadatos, pero no modifica el proyecto ni instala
recursos. El resumen distingue una descarga resuelta de una instalación aplicada.

## Aplicación y recuperación

Separar captura de respuestas, validación, resolución, planificación y aplicación.
Wizard y modo no interactivo consumen el mismo contrato resuelto.

Reutilizar `planInstall` para detectar creates, updates, unchanged y conflicts.
No aplicar parcialmente cuando exista un conflicto. Antes de escribir, respaldar
los archivos modificados y registrar el conjunto de archivos nuevos. Ante un error,
restaurar lo modificado, retirar solo los archivos nuevos de esa operación y reportar
cualquier recuperación fallida. Nunca retirar contenido previo ajeno.

`doctor` distingue configuración presente, requisitos disponibles y autenticación
o llamadas funcionales no verificadas. Los checks de red son de lectura, explícitos
y no deben divulgar credenciales. No confundir Docker disponible con MCP operativo.

## Pruebas y aceptación

- Ejecutar el wizard en pseudo-terminal, cancelar, recibir EOF y corregir entradas.
- Sin TTY, exigir configuración completa; comprobar que no se bloquea.
- Repetir una configuración y obtener unchanged; comparar wizard y ejecución por archivo.
- Verificar los cuatro runtimes y todos los presets, con dependencias de skills.
- Conservar configuraciones MCP ajenas y bloquear colisiones y formatos inseguros.
- Comprobar referencias a secretos sin serializar valores ni imprimirlos en errores.
- Verificar fuentes externas con fixtures, revisión fija, recursos y rutas maliciosas.
- Inyectar un fallo de escritura y comprobar restauración y ausencia de instalación parcial.
- Conservar comportamiento de comandos existentes y `skills add` seguido de update preview.
- Probar el tarball instalado fuera del checkout, incluida disponibilidad del catálogo.

## Entrega

La entrega incluye código, catálogo, documentación, ejemplos reproducibles y evidencia
de typecheck, build y tests. Recuperación manual asistida se documenta si falla el
rollback; no se promete atomicidad frente a terminación abrupta del proceso.
Desinstalación general, marketplace abierto, instalación de runtimes y sincronización
multiplataforma quedan fuera de v0.3.0.
