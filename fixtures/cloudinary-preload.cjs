// Substitui somente a fronteira externa do SDK; nenhum request sai para a nuvem.
const { Writable } = require('node:stream');
const fs = require('node:fs');
const sdk = require('cloudinary').v2;
const originalWrite = fs.writeFileSync;
fs.writeFileSync = function (file, contents, ...args) {
  if (String(file).startsWith(process.env.DATA_FILE) && fs.existsSync(process.env.TEST_PARTIAL_WRITE_FLAG)) {
    fs.unlinkSync(process.env.TEST_PARTIAL_WRITE_FLAG);
    originalWrite.call(fs, file, String(contents).slice(0, 32), ...args);
    throw new Error('simulated partial disk write');
  }
  return originalWrite.call(fs, file, contents, ...args);
};
let sequence = 0;
function record(data) { fs.appendFileSync(process.env.CLOUDINARY_TEST_LOG, `${JSON.stringify(data)}\n`); }
sdk.uploader.upload_stream = (options, callback) => {
  const chunks = [];
  return new Writable({
    write(chunk, encoding, done) { chunks.push(chunk); done(); },
    final(done) {
      const buffer = Buffer.concat(chunks);
      const publicId = `gamevault/covers/test-${++sequence}`;
      record({ action: 'upload', options, bytes: buffer.length, publicId });
      if (buffer.includes(Buffer.from('stream-fail'))) { done(new Error('secret-stream-error')); return; }
      if (buffer.includes(Buffer.from('provider-fail'))) callback(new Error('secret-provider-error'));
      else setTimeout(() => callback(null, { secure_url: `https://res.cloudinary.com/test/image/upload/${publicId}.png`, public_id: publicId, resource_type: 'image', format: 'png', bytes: buffer.length }), buffer.includes(Buffer.from('slow')) ? 80 : 0);
      done();
    }
  });
};
sdk.uploader.destroy = async (publicId, options) => {
  record({ action: 'destroy', publicId, options });
  if (fs.existsSync(process.env.TEST_CLEANUP_FAIL_FLAG)) throw new Error('secret-destroy-error');
  return { result: 'ok' };
};
