Es una preocupación muy válida, sobre todo cuando se trabaja con múltiples agentes en paralelo. Sin embargo, el ecosistema de Gentle AI está diseñado arquitectónicamente para evitar precisamente ese "efecto bola de nieve" de consumo, asegurando que esos 100K - 500K tokens no se disparen innecesariamente.

Para evitar que el consumo se salga de control, las recomendaciones y mecanismos del propio ecosistema son los siguientes:

**1. Comprender que los subagentes no duplican la lectura de archivos**
El problema que planteas (4 subagentes leyendo 20 archivos cada uno) no ocurre gracias a la estructura del Desarrollo Basado en Especificaciones (SDD). El proceso no lanza subagentes a leer código a lo loco, sino que lo divide en fases aisladas:
*   Primero, un **único** subagente se encarga de explorar todo el proyecto (Codebase) para ver qué hay hecho.
*   Ese subagente extrae los requerimientos y genera una especificación estructurada.
*   Cuando llega el momento de implementar y se delega el trabajo a los demás subagentes, **estos inician en una "hoja en blanco"**. A ellos no se les inyectan los 20 archivos originales ni el historial completo, sino **únicamente la especificación estructurada de su tarea y la habilidad (Skill) exacta que necesitan**. Esto elimina por completo el ruido y la redundancia de contexto.

**2. Asignación estratégica de modelos (Multimodelo)**
Para optimizar aún más el flujo, el ecosistema permite configurar diferentes modelos de IA para cada fase de trabajo, de forma que no gastes tokens de modelos caros en tareas sencillas. Se recomienda:
*   Usar un modelo ligero y rápido (como Sonnet) para la fase de exploración de código e inicialización.
*   Reservar los modelos de alto razonamiento (como Opus o Gemini) **solo** para la fase de crear la propuesta y el diseño arquitectónico.
*   Usar modelos eficientes o especializados en código para la fase final de implementación o búsqueda de bugs (como Codex). 
Delegar cada parte al modelo con mejor relación costo/beneficio es clave para mantener la economía de tokens controlada.

**3. Aprovechar la búsqueda por capas de Engram**
Como mencionamos antes, el cerebro virtual (Engram) es altamente eficiente porque no vuelca toda la memoria al chat. Cuando un subagente necesita contexto, Engram busca por "capas" (información del proyecto, tipo de acciones previas y observaciones específicas). Si encuentra un problema similar al actual, **solo extrae ese detalle**. Esto previene que se cargue información irrelevante en la ventana de contexto de los subagentes.

**4. Eres el "Orquestador del orquestador" (Frenar las fases)**
La recomendación humana más importante para evitar el despilfarro de tokens es **no dejar que la IA ejecute todo el proceso de principio a fin en piloto automático**. 
Debes mantener la filosofía de *Human in the Loop*. La mejor práctica es decirle al agente que se detenga entre cada fase de SDD, indicándole cosas como: *"antes de pasar a la siguiente fase, déjame validarlo"*. Al revisar el diseño y la especificación *antes* de que genere las tareas o escriba código, te aseguras de que los subagentes no hagan trabajo innecesario o erróneo que luego consumirá más tokens corregir.