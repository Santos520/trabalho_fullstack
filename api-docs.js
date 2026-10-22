const fs = require('node:fs');
const path = require('node:path');
const assetDir = require('swagger-ui-dist/absolute-path.js')();
const specification = require('./swagger-output.json');
const assets = {
  'swagger-ui.css': 'text/css',
  'swagger-ui-bundle.js': 'application/javascript',
  'swagger-ui-standalone-preset.js': 'application/javascript'
};

function serveDocs(req, res) {
  const pathname = req.url.split('?')[0];
  if (pathname !== '/docs' && !pathname.startsWith('/docs/')) return false;
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return true;
  }
  const name = pathname.slice('/docs/'.length);
  let content;
  let type;
  if (pathname === '/docs' || pathname === '/docs/') {
    type = 'text/html';
    content = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GameVault API</title><link rel="stylesheet" href="/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/docs/swagger-ui-bundle.js"></script><script src="/docs/swagger-ui-standalone-preset.js"></script><script src="/docs/swagger-init.js"></script></body></html>';
  } else if (name === 'openapi.json') {
    type = 'application/json';
    content = JSON.stringify(specification);
  } else if (name === 'swagger-init.js') {
    type = 'application/javascript';
    content = "window.onload = function () { window.ui = SwaggerUIBundle({ url: '/docs/openapi.json', dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'StandaloneLayout', validatorUrl: null, persistAuthorization: false }); };";
  } else if (Object.hasOwn(assets, name)) {
    type = assets[name];
    content = fs.readFileSync(path.join(assetDir, name));
  } else {
    res.writeHead(404);
    res.end();
    return true;
  }
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : content);
  return true;
}

module.exports = { serveDocs };
