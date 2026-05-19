# Guia para deploy en Vercel

Esta app puede publicarse en Vercel gratis para uso personal, pero necesita una pequeña adaptacion: Vercel no corre `server.py` como servidor persistente. En Vercel se debe usar una Serverless Function para hacer de proxy hacia SimCoTools.

## Por que hace falta un proxy

La API de SimCoTools no permite llamadas directas desde el navegador por CORS. Localmente usamos:

```powershell
python server.py
```

Ese servidor sirve la app y tambien proxyea:

```text
/api/v1/... -> https://api.simcotools.com/v1/...
```

En Vercel vamos a mantener el mismo contrato `/api/...`, pero implementado como funcion serverless.

## Que necesitas

1. Cuenta en GitHub con el repo:

```text
https://github.com/jpmersuglia/SimCoTools-market-intelligence
```

2. Cuenta en Vercel:

```text
https://vercel.com
```

3. Conectar Vercel con GitHub y autorizar acceso al repo.

4. Usar la carpeta `api/` del proyecto con la funcion proxy para Vercel.

5. Deployar como proyecto estatico con funciones serverless.

## Archivos que vamos a necesitar agregar

La estructura final deberia quedar asi:

```text
.
├── api/
│   └── [...path].js
├── app.js
├── index.html
├── styles.css
├── README.md
├── server.py
└── vercel.json
```

`server.py` puede quedar para desarrollo local, pero Vercel usara `api/[...path].js`.

## Cambio necesario en app.js

Actualmente la app usa:

```js
const API_BASE = "/api";
```

Eso esta bien para local y para Vercel, siempre que en Vercel exista una ruta que reciba:

```text
/api/v1/realms/0/resources
```

y la envie a:

```text
https://api.simcotools.com/v1/realms/0/resources
```

## Funcion proxy incluida

La funcion `api/[...path].js`:

1. Recibir cualquier request bajo `/api/...`.
2. Remover el prefijo `/api`.
3. Llamar a `https://api.simcotools.com`.
4. Devolver el JSON al navegador.
5. Agregar headers CORS.

Ejemplo conceptual:

```text
Browser -> /api/v1/realms/0/resources
Vercel  -> https://api.simcotools.com/v1/realms/0/resources
Browser <- respuesta JSON
```

## Configuracion de Vercel

Cuando importes el proyecto:

- Framework Preset: `Other`
- Build Command: dejar vacio
- Output Directory: dejar vacio o `.`
- Install Command: dejar vacio

Como es una app estatica sin bundler, Vercel sirve `index.html`, `styles.css` y `app.js` directamente.

El archivo `vercel.json` ya esta incluido y configura la funcion `api/[...path].js`.

## Variables de entorno

No deberia hacer falta ninguna variable de entorno para esta version.

La URL base de SimCoTools puede estar hardcodeada en la funcion:

```text
https://api.simcotools.com
```

## Flujo recomendado

1. Crear cuenta en Vercel.
2. Importar el repo desde GitHub.
3. Verificar que existan `api/[...path].js` y `vercel.json`.
4. Hacer commit y push a `main`.
5. Vercel detecta el push y deploya automaticamente.
6. Abrir la URL publica de Vercel.
7. Probar:
   - autocomplete de recursos
   - agregar item a compra
   - agregar item a venta
   - refresh de listas
   - persistencia en browser

## Diferencia entre local y Vercel

Local:

```powershell
python server.py
```

Vercel:

```text
No se corre server.py.
Vercel sirve los archivos estaticos y ejecuta api/proxy.js bajo demanda.
```

## Notas del plan gratis

Vercel Hobby es gratuito para proyectos personales/no comerciales. Tiene limites de uso, pero para una herramienta personal con pocos recursos guardados deberia alcanzar.

Si el uso crece mucho, los puntos a vigilar son:

- cantidad de requests a funciones serverless
- tiempo de ejecucion de funciones
- limites del plan Hobby vigente
- rate limit de SimCoTools: 2 requests por segundo

La app ya espacia requests desde el frontend para respetar ese limite.

## Archivos de Vercel incluidos

- `api/[...path].js`: proxy serverless hacia SimCoTools.
- `vercel.json`: configuracion del proyecto y max duration de la funcion.
