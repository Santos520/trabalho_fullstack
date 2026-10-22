const multer = require('multer');
const { Readable, pipeline } = require('node:stream');
const { v2: cloudinary } = require('cloudinary');

class UploadError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2, fieldNameSize: 100, headerPairs: 50 },
  fileFilter(req, file, done) {
    done(allowedTypes.has(file.mimetype) ? null : new UploadError(415, 'Use uma imagem PNG, JPEG ou WebP.'), true);
  }
}).single('imagem');

async function receiveImage(req, res) {
  if (!/^multipart\/form-data(?:;|$)/i.test(req.headers['content-type'] || '')) {
    throw new UploadError(415, 'Envie a imagem usando multipart/form-data.');
  }
  try {
    await new Promise((resolve, reject) => multipart(req, res, error => error ? reject(error) : resolve()));
  } catch (error) {
    if (error instanceof UploadError) throw error;
    if (error.code === 'LIMIT_FILE_SIZE') throw new UploadError(413, 'A imagem deve ter menos de 5 MiB.');
    throw new UploadError(400, 'Upload inválido. Envie somente um arquivo no campo imagem, sem campos adicionais.');
  }
  const file = req.file;
  if (!file?.buffer?.length) throw new UploadError(400, 'A imagem é obrigatória.');
  const bytes = file.buffer;
  const isPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR';
  const isJpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
  if (!({ 'image/png': isPng, 'image/jpeg': isJpeg, 'image/webp': isWebp })[file.mimetype]) {
    throw new UploadError(415, 'O conteúdo do arquivo não corresponde a uma imagem PNG, JPEG ou WebP.');
  }
  return bytes;
}

function createCloudinaryService() {
  function configure() {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (![CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET].every(value => value?.trim())) {
      throw new UploadError(503, 'Upload de capas indisponível. Configure o Cloudinary no servidor.');
    }
    cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  }
  async function upload(buffer) {
    configure();
    try {
      return await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: 'gamevault/covers', resource_type: 'image',
          allowed_formats: ['png', 'jpg', 'jpeg', 'webp'], timeout: 15000
        }, (error, result) => {
          if (error || !result?.public_id || !/^https:\/\//i.test(result?.secure_url || '')) {
            if (result?.public_id) void remove(result.public_id);
            reject(new UploadError(502, 'Não foi possível enviar a capa ao Cloudinary. Tente novamente.'));
          } else resolve({ url: result.secure_url, publicId: result.public_id });
        });
        pipeline(Readable.from(buffer), stream, error => {
          if (error) reject(new UploadError(502, 'Não foi possível enviar a capa ao Cloudinary. Tente novamente.'));
        });
      });
    } catch {
      throw new UploadError(502, 'Não foi possível enviar a capa ao Cloudinary. Tente novamente.');
    }
  }
  async function remove(publicId) {
    if (!publicId) return;
    try {
      configure();
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true, timeout: 15000 });
      if (!['ok', 'not found'].includes(result?.result)) throw new Error('Remoção não confirmada');
    } catch {
      // ID de mídia permite reconciliação; não registrar erros brutos do SDK ou credenciais.
      console.error('Limpeza de capa pendente no Cloudinary:', publicId);
    }
  }
  return { upload, remove };
}

function createStateWriter() {
  let pending = Promise.resolve();
  return operation => {
    const result = pending.catch(() => {}).then(operation);
    pending = result.catch(() => {});
    return result;
  };
}

function createCoverUpdater({ findGame, currentState, save, images, withStateWrite }) {
  const queues = new Map();
  async function replace(id, buffer) {
    const game = findGame(id);
    if (!game) throw new UploadError(404, 'Jogo não encontrado.');
    const uploaded = await images.upload(buffer);
    let previous;
    let updated;
    try {
      updated = await withStateWrite(async () => {
        if (findGame(id) !== game) throw new UploadError(409, 'O jogo foi alterado durante o upload. Tente novamente.');
        previous = game.coverPublicId;
        const proposed = { ...game, cover: uploaded.url, coverPublicId: uploaded.publicId };
        const state = currentState();
        try {
          await save({ ...state, games: state.games.map(item => item === game ? proposed : item) });
        } catch {
          throw new UploadError(500, 'Não foi possível salvar a capa. Tente novamente.');
        }
        // Só publicar a capa depois da confirmação. Outras mutações da API usam
        // a mesma fila, pois o adaptador PostgreSQL persiste snapshots globais.
        Object.assign(game, proposed);
        return { ...game };
      });
    } catch (error) {
      await images.remove(uploaded.publicId);
      throw error;
    }
    if (previous && previous !== uploaded.publicId) await images.remove(previous);
    return updated;
  }
  return async (id, buffer) => {
    const previous = queues.get(id) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => replace(id, buffer));
    queues.set(id, operation);
    try { return await operation; }
    finally { if (queues.get(id) === operation) queues.delete(id); }
  };
}

module.exports = { UploadError, receiveImage, createCloudinaryService, createCoverUpdater, createStateWriter };
