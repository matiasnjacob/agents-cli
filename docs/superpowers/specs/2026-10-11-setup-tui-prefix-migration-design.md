# Setup TUI, Agent Prefixes, and 0.4.1 Migration

Estado: propuesta de diseño para revisión final del usuario.

## Intención

Hacer que `agents-cli setup` sea un asistente de terminal claro y fácil de operar: el usuario navega con flechas, marca selecciones múltiples con Space y confirma con Enter. También se eliminan los nombres `global-*` del catálogo, se permite personalizar el prefijo efectivo de los agentes al instalarlos y se migran las configuraciones creadas por `0.4.1`. La entrega se publicará como `0.4.2` después de revisión y merge.

## Objetivos

- Reemplazar la entrada manual por números y listas separadas por comas por controles de terminal interactivos.
- Mantener todos los pasos existentes de setup: plataforma, preset, agentes, tracker, MCPs, skills locales y externas, y soporte JEV.
- Usar un selector de una opción para plataforma, suite y modo JEV; usar multiselección para agentes, MCPs y skills. En los controles únicos, flechas mueven el cursor y Enter confirma. En multiselección, flechas mueven, Space marca/desmarca y Enter confirma.
- Mostrar una cabecera de bienvenida una sola vez al iniciar: un dibujo ASCII con bordes y bloques cuadrados que contiene `Agents-Cli` y `Matias Jacob`.
- Mostrar las opciones preseleccionadas por el preset, instrucciones de teclado y un contador de selecciones.
- Permitir un prefijo de proyecto opcional, vacío por defecto. Aplicarlo a los nombres visibles de los agentes instalados, al campo identificador del runtime y al basename de todos sus archivos generados. Por ejemplo, `backend-developer` con prefijo `acme` se instala como `acme-backend-developer`.
- Validar prefijos con el formato kebab-case seguro `^[a-z0-9]+(?:-[a-z0-9]+)*$`; permitir vacío y rechazar separadores de ruta, puntos, espacios y caracteres restantes en vez de reescribirlos silenciosamente.
- Mostrar un resumen de selecciones y rutas previstas, incluidos creates, updates, removes y conflicts, antes de modificar el proyecto. Tras confirmar, mostrar avance por las tareas reales de instalación y ejecutar el diagnóstico ya existente.
- Mantener modo reproducible por `--config`, `--yes` y `--dry-run`, además de la cancelación sin escrituras.
- Bump de versión de paquete y changelog para release `0.4.2`.

## Arquitectura propuesta

Adoptar `@clack/prompts` como interfaz TUI, sujeta a verificar la versión y compatibilidad con el Node.js mínimo del proyecto durante la implementación. Sus prompts resuelven selección, multiselección, entrada de texto, confirmación y feedback de progreso; los componentes de captura se mantienen separados de validación, planificación y aplicación. El wizard y el camino `--config` seguirán convergiendo en el mismo `SetupConfig` validado y en el mismo motor de instalación.

Agregar un `agentPrefix` opcional al contrato de configuración, esquema JSON y resolución de valores. El catálogo y sus suites usan IDs base sin `global-`. Los adaptadores de Codex, Claude Code, OpenCode y Pi derivan el ID efectivo y los nombres de archivo de `agentPrefix` más el ID base. Los IDs de selección guardados en `agents-cli.config.json` siguen siendo claves de catálogo estables sin prefijo; el nombre/ID desplegado en cada runtime y su ruta sí incluyen el prefijo. La cabecera de marca no se repite en cada paso.

Durante la lectura de una configuración existente, traducir cada ID heredado conocido `global-<id>` a `<id>`, y tratar un `agentPrefix` ausente como vacío. Al aplicar la migración, confiar en `.agents-cli.lock.json` para retirar solo los archivos antiguos que el instalador administra y crear sus reemplazos con los nombres nuevos. El motor existente debe conservar detección de hashes, respaldos, conflictos y archivos ajenos. La configuración serializada se actualiza a los IDs base nuevos una vez que se confirma la aplicación. `--dry-run` solo informa la migración prevista; cancelación o conflicto no deja una migración parcial.

## Experiencia

1. Mostrar la cabecera `Agents-Cli` / `Matias Jacob` enmarcada con arte ASCII de cuadrados.
2. Seleccionar plataforma y suite con flechas y Enter.
3. Revisar agentes del preset con flechas, Space y Enter.
4. Ingresar un prefijo opcional y validar su formato; el resumen enseña los IDs y archivos resultantes.
5. Seleccionar tracker, MCPs, skills y modo JEV; presentar los valores actuales como preselección al editar una configuración anterior.
6. Mostrar el plan completo y pedir confirmación explícita.
7. Aplicar tareas de instalación con spinner/progreso semántico y mostrar doctor al terminar.

Cuando no hay TTY, `setup` conserva el error accionable existente que dirige a `--config`; `--yes` nunca inventa opciones. `Ctrl+C` antes de confirmar finaliza limpiamente sin escribir.

## Alcance y límites

La migración cubre únicamente IDs `global-*` que existen en el catálogo `0.4.1`; entradas desconocidas siguen siendo errores. Si un archivo legado no está registrado como administrado o su contenido no coincide con lo registrado, se conserva y se informa conflicto en vez de borrarlo. No se instala el runtime del agente, no se ejecutan logins ni se configuran credenciales, y no se usa red para completar el wizard local. Una lista filtrable por texto para catálogos grandes puede añadirse más adelante; no es necesaria para los catálogos actuales.

## Aceptación

- En una pseudo-terminal, confirmar navegación por flechas/Enter para opciones únicas y flechas/Space/Enter para listas múltiples.
- La selección por preset empieza marcada; editar una lista respeta required skills y permite una lista vacía cuando el flujo vigente lo permite.
- El banner de bienvenida muestra exactamente `Agents-Cli` y `Matias Jacob`, una vez por invocación.
- Prefijo vacío conserva los nombres base; prefijo válido se aplica a nombre visible, ID renderizado, basename de archivo y manifiestos de los cuatro adaptadores.
- Prefijos con ruta, puntos, espacios o caracteres no permitidos fallan con un mensaje útil antes de escribir archivos.
- Configuración `0.4.1` con `global-*` se interpreta como agentes base nuevos y, al aplicar, migra de forma segura rutas administradas a los basenames nuevos.
- Dry-run, cancelación, conflicto, EOF y ejecución sin TTY no realizan escrituras parciales.
- `--config`, `--yes`, `--dry-run`, doctor y comandos no relacionados mantienen su contrato actual.
- Typecheck, build, pruebas y smoke test del paquete `0.4.2` pasan antes de abrir PR.

## Decisiones aún del implementador

- Fijar la versión concreta de `@clack/prompts` en el lockfile y verificar su rango de Node.js y licencia antes de adoptarla.
- Elegir el ancho y arte ASCII final del encabezado para funcionar en terminales estrechas, con Unicode desactivado y con `NO_COLOR`.
- Implementar pruebas de migración para cada plataforma y del TUI en pseudo-terminal usando la infraestructura disponible; las pruebas no deben depender de una terminal real.
