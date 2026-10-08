# JEV como soporte opcional de decisiones

Estado: especificación propuesta para revisión del usuario. Implementación pendiente.

## Objetivo y alcance

Agregar Jev de TypeSafe AI como herramienta auxiliar para decisiones semánticas
acotadas de los agentes. Conservar el modelo generativo, responsabilidades, permisos,
validaciones y revisión independiente de cada rol.

Entregar herramientas ejecutables y políticas por rol, además de una evaluación
reproducible. La integración es opcional: una instalación sin JEV ni API key debe
mantener todo el comportamiento actual.

## Arquitectura

Un núcleo TypeScript compartido usa la API oficial de TypeSafe. Valida requests y
responses, fija modelo y versión de preguntas, limita contexto, aplica timeout y
devuelve una recomendación tipada. El transporte CLI y un servidor MCP stdio propio
exponen ese mismo núcleo. No se incorpora un toolkit de terceros como dependencia
de decisión. Se utiliza documentación oficial para el contrato HTTP y MCP.

La configuración contiene `provider: typesafe`, `model: jev-1.13.0`,
`apiKeyEnv: TYPESAFE_API_KEY`, modo, herramientas habilitadas, timeout,
máximo de llamadas por proceso y máximo de tamaño de entrada. Ningún token se guarda
en archivos administrados. Un endpoint alternativo debe usar HTTPS, salvo loopback
HTTP para pruebas locales, sin credenciales incrustadas en la URL.

## Modos

| Modo | Comportamiento |
| --- | --- |
| off | Sin llamadas a TypeSafe; devuelve estado disabled |
| shadow | Evalúa y registra resultado; no proporciona una decisión aplicable al flujo |
| assist | Presenta recomendación y evidencia disponible; el agente decide si usarla |

Se propone shadow en el wizard solo si el usuario elige habilitar JEV. No existe
modo de autorización automática para merge, deploy, recursos AWS o tracker Done.
Una baja confianza, entrada insuficiente o error produce abstención; nunca un PASS.

Shadow requiere una invocación real desde el agente o el evaluador. Instalar el
servidor no intercepta automáticamente cada turno. Los prompts indicarán los puntos
de consulta y la documentación distinguirá disponibilidad de uso observado.

## Herramientas y contrato

```sh
agents-cli decision route-task --input task.json
agents-cli decision suggest-skills --input skills.json
agents-cli decision classify-failure --input failure.json
agents-cli decision rank-test-scenarios --input scenarios.json
agents-cli decision mcp
agents-cli decision evaluate --dataset cases.json --output results.json
```

También aceptar stdin con `--input -`. Las entradas se validan antes de llamar la
API. Las respuestas JSON usan un sobre común: status, tool, questionVersion, mode,
model, recommendation, probabilities, confidence cuando exista, y diagnostic.
En shadow, recommendation es null y el resultado observado se registra por separado.
No se inventa una explicación textual generada por JEV: las rúbricas y referencias
de evidencia son datos proporcionados por el llamador.

| Herramienta | Entrada | Salida semántica |
| --- | --- | --- |
| route-task | Tarea y candidatos habilitados | Un ID de rol o insufficient-context |
| suggest-skills | Tarea y skills candidatas con descripciones | Un ID de skill o none |
| classify-failure | Resultado de comando, errores y contexto relevante | application-bug, environment, possible-flake o insufficient-evidence |
| rank-test-scenarios | Criterios, escenarios con IDs y rúbrica de impacto | Scores por ID; orden calculado en código |

Choice selecciona IDs de conjuntos cerrados. Score usa niveles descritos en palabras;
comparaciones, desempates y orden se calculan en código. Noul, cuando se use para
comprobar pertinencia o evidencia insuficiente, devuelve una probabilidad y no un
campo confidence inventado. Las preguntas son atómicas y versionadas.

## Política por agente

| Rol | Uso inicial |
| --- | --- |
| Orchestrator | Routing y sugerencia de skills antes de un handoff |
| Backend | Clasificación de fallos y escenarios de validación |
| Frontend | Clasificación de fallos y prioridad de escenarios de UI descritos en texto |
| AWS | Priorización de escenarios operativos y fallos, sin decisiones de autorización |
| Code reviewer | Prioridad de escenarios que necesita revisar; conserva hallazgos demostrables |
| QA automator | Clasificación de fallos y ranking de cobertura propuesta |
| QA manual | Ranking de exploración a partir de criterios y evidencia textual |

Los siete prompts explican cuándo consultar, cómo interpretar abstenciones y qué
validaciones siguen siendo obligatorias. Routing recibe únicamente roles realmente
instalados; JEV no puede introducir agentes, herramientas o permisos nuevos.

## Integración con plataformas

Codex, OpenCode y Claude utilizan MCP stdio solo donde sus contratos actuales estén
verificados; el CLI funciona como alternativa explícita. El servidor respeta JSON-RPC,
inicialización, listado e invocación de herramientas; stdout contiene únicamente
mensajes del protocolo, y diagnósticos van a stderr sin datos sensibles.

En Pi los subagentes usan `bash` para invocar el CLI. El subprocess actual arranca
con `--no-extensions`, por lo que no se supone herencia de herramientas del padre.
Se conserva la selección de modelo y thinking level que ya hace la extensión.

## Seguridad operativa y errores

Enviar solo el contexto elegido explícitamente, sin recorrer el repositorio ni leer
archivos de credenciales automáticamente. Rechazar secretos conocidos en campos
prohibidos y ocultarlos en errores. Esto no equivale a un detector universal de PII:
la documentación explica que el estado se envía a una API externa.

Establecer timeout de 10 segundos y máximo de 100 llamadas por proceso, ambos
configurables dentro de límites validados. Sin reintentos automáticos en la primera
entrega para evitar consumo duplicado. Los límites son por sesión/proceso; no se
presentan como un presupuesto global entre varios agentes.

Errores de credenciales, timeout, red, rate limit o respuesta inválida producen
un resultado unavailable con diagnóstico saneado. Una recomendación inválida o
fuera de catálogo se rechaza. El fallback devuelve control al agente generativo y
mantiene las políticas existentes, incluyendo autorizaciones ya otorgadas.

## Trazabilidad

Registrar opt-in en una ruta local ignorada por Git: tool, modelo efectivo, versión
de rúbrica, hash de entrada, resultado tipado, duración, uso reportado y fallback.
No registrar estado completo ni secretos por defecto. El evaluador guarda casos y
resultados en la ruta solicitada; no los publica ni envía a terceros adicionales.

El registro distingue decisión observada, recomendación ofrecida y decisión del
agente cuando el llamador la aporta. Sin esa última evidencia no atribuir aciertos
o ahorro al uso de JEV.

## Evaluación y aceptación

Fixtures locales cubren routing, ninguna skill pertinente, fallos ambiguos, datos
insuficientes, escenarios con IDs duplicados y contenido adversarial. El dataset
incluye español e inglés, con particiones de calibración y evaluación separadas.

El evaluador compara etiquetas esperadas y resultados: acierto, abstenciones,
errores entre decisiones aceptadas, latencia y uso reportado. La evaluación real
requiere una API key proporcionada por el entorno y se ejecuta explícitamente.
Los tests de contrato usan un servidor HTTP local sin gastar créditos.

Umbrales iniciales de assist se configuran por herramienta y se identifican como
experimentales. No se afirma una tasa de éxito a partir de confidence; cualquier
promesa de mejora requiere resultados del dataset retenido frente a una baseline.

Comprobar modo off sin red, shadow sin recomendación aplicable, abstención, timeout,
errores de API, saneamiento, límites por proceso y respuestas malformadas.
Comprobar protocolo MCP por subprocess y ejecución CLI desde una instalación del
tarball fuera del checkout. Verificar integración Pi con sus límites actuales.

## Release conjunto

Proponer v0.3.0 para instalador y JEV. Antes de publicar: actualizar versiones de
package, lockfile y catálogo, changelog, README y guías; ejecutar typecheck, build,
suite completa y prueba del paquete instalado. Revisar el diff y los assets, crear
tag y verificar el workflow, checksum y provenance del release.

La solicitud del usuario autoriza preparar el nuevo release al finalizar el trabajo.
No crear tag ni publicar hasta que ambos subsistemas estén implementados y verificados.
La disponibilidad de credenciales externas limita comprobaciones en vivo, no pruebas
locales. Una validación no ejecutada se informa como NOT VERIFIED.

## Fuentes del contrato

- https://docs.typesafe.ai/introduction/coding-agents
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/confidence
- https://docs.typesafe.ai/model-jaggedness/jev-1.13
- https://docs.typesafe.ai/cookbooks/skill_suggestion
