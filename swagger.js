const fs = require('node:fs');
const path = require('node:path');
const autogen = require('swagger-autogen')({ openapi: '3.0.0', disableLogs: true, autoHeaders: false, autoQuery: false, autoBody: false, autoResponse: false, writeOutputFile: false });
const parser = require('@apidevtools/swagger-parser');
const specification = require('./docs/openapi');

async function generate() {
  const output = path.join(__dirname, 'swagger-output.json');
  const result = await autogen(output, [path.join(__dirname, 'server.js')], { info: specification.info });
  if (!result?.success) throw new Error('Falha na descoberta das rotas em server.js');
  const operations = paths => Object.entries(paths).flatMap(([route, methods]) => Object.keys(methods).map(method => `${method} ${route}`)).sort();
  const discovered = operations(result.data.paths);
  const documented = operations(specification.paths);
  if (JSON.stringify(discovered) !== JSON.stringify(documented)) {
    throw new Error(`Rotas e contratos divergentes. Descobertas: ${discovered.join(', ')}; documentadas: ${documented.join(', ')}`);
  }
  // Valida uma cópia: o parser resolve refs e modifica o objeto recebido.
  await parser.validate(JSON.parse(JSON.stringify(specification)));
  fs.writeFileSync(output, `${JSON.stringify(specification, null, 2)}\n`);
  console.log(`OpenAPI válido: ${documented.length} operações em ${output}`);
}

generate().catch(error => { console.error(error.message); process.exitCode = 1; });
