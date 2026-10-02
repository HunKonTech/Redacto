#!/usr/bin/env node

/**
 * Moves the weights of an ONNX model with embedded weights into external
 * data chunk files, each at most `maxChunkBytes`, named the way
 * transformers.js loads them:
 *
 *   model_quantized.onnx          graph (+ small tensors left inline)
 *   model_quantized.onnx_data     weights, chunk 0
 *   model_quantized.onnx_data_1   weights, chunk 1
 *   ...
 *
 * addons.mozilla.org (addons-linter) rejects any single package file over
 * 100 MiB, so a model above that has to be split to ship in the Firefox
 * build. transformers.js loads the chunks when config.json carries
 * `transformers.js_config.use_external_data_format = { "<file>.onnx": N }`.
 *
 * Plain protobuf rewrite with no Python or onnx dependency: only the
 * top-level graph's initializers (ModelProto.graph -> GraphProto.initializer)
 * are touched; every other byte is copied through unchanged.
 *
 * Usage: node scripts/split-onnx-external-data.js --input <model.onnx> [--max-chunk-mib <n>]
 */

const fs = require('fs');
const path = require('path');

// addons-linter's per-file limit is 100 MiB; stay well under it.
const DEFAULT_MAX_CHUNK_BYTES = 80 * 1024 * 1024;
// Same threshold as onnx.external_data_helper: tiny tensors stay in the graph.
const DEFAULT_MIN_EXTERNAL_TENSOR_BYTES = 1024;
const TENSOR_OFFSET_ALIGNMENT = 64;

const MODEL_GRAPH_FIELD = 7;
const GRAPH_INITIALIZER_FIELD = 5;
const TENSOR_NAME_FIELD = 8;
const TENSOR_RAW_DATA_FIELD = 9;
const TENSOR_EXTERNAL_DATA_FIELD = 13;
const TENSOR_DATA_LOCATION_FIELD = 14;
const DATA_LOCATION_EXTERNAL = 1;

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

function readVarint(buffer, offset) {
  let value = 0;
  let multiplier = 1;
  let position = offset;
  for (;;) {
    if (position >= buffer.length) throw new Error('Truncated varint in ONNX protobuf.');
    const byte = buffer[position];
    position += 1;
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, next: position };
    multiplier *= 128;
    if (multiplier > 2 ** 63) throw new Error('Varint too long in ONNX protobuf.');
  }
}

function encodeVarint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Cannot encode varint ${value}.`);
  const bytes = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 128) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

/** Splits a protobuf message into its top-level fields, keeping each field's raw bytes. */
function parseFields(buffer) {
  const fields = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    const tag = readVarint(buffer, offset);
    const field = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    offset = tag.next;
    let valueStart = offset;
    if (wire === WIRE_VARINT) {
      offset = readVarint(buffer, offset).next;
    } else if (wire === WIRE_FIXED64) {
      offset += 8;
    } else if (wire === WIRE_FIXED32) {
      offset += 4;
    } else if (wire === WIRE_LENGTH_DELIMITED) {
      const length = readVarint(buffer, offset);
      valueStart = length.next;
      offset = length.next + length.value;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wire} (field ${field}).`);
    }
    if (offset > buffer.length) throw new Error(`Truncated protobuf field ${field}.`);
    fields.push({
      field,
      wire,
      raw: buffer.subarray(start, offset),
      value: buffer.subarray(valueStart, offset),
    });
  }
  return fields;
}

function lengthDelimited(field, payload) {
  return Buffer.concat([encodeVarint(field * 8 + WIRE_LENGTH_DELIMITED), encodeVarint(payload.length), payload]);
}

function varintField(field, value) {
  return Buffer.concat([encodeVarint(field * 8 + WIRE_VARINT), encodeVarint(value)]);
}

function stringEntry(key, value) {
  return lengthDelimited(
    TENSOR_EXTERNAL_DATA_FIELD,
    Buffer.concat([lengthDelimited(1, Buffer.from(key)), lengthDelimited(2, Buffer.from(String(value)))])
  );
}

/** transformers.js chunk names: `<file>_data`, `<file>_data_1`, `<file>_data_2`, ... */
function externalDataChunkName(modelFileName, index) {
  return `${modelFileName}_data${index === 0 ? '' : `_${index}`}`;
}

/**
 * Returns the rewritten graph protobuf and the chunk contents. Throws when
 * the model already uses external data or a single tensor exceeds a chunk.
 */
function splitOnnxModel(modelBuffer, modelFileName, options = {}) {
  const maxChunkBytes = options.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  const minTensorBytes = options.minTensorBytes ?? DEFAULT_MIN_EXTERNAL_TENSOR_BYTES;

  const chunks = [{ name: externalDataChunkName(modelFileName, 0), parts: [], bytes: 0 }];
  let externalTensorCount = 0;

  const placeTensor = (name, data) => {
    if (data.length > maxChunkBytes) {
      throw new Error(`Tensor ${name} (${data.length} bytes) is larger than one external data chunk (${maxChunkBytes} bytes).`);
    }
    let chunk = chunks[chunks.length - 1];
    let offset = Math.ceil(chunk.bytes / TENSOR_OFFSET_ALIGNMENT) * TENSOR_OFFSET_ALIGNMENT;
    if (chunk.bytes > 0 && offset + data.length > maxChunkBytes) {
      chunk = { name: externalDataChunkName(modelFileName, chunks.length), parts: [], bytes: 0 };
      chunks.push(chunk);
      offset = 0;
    }
    if (offset > chunk.bytes) chunk.parts.push(Buffer.alloc(offset - chunk.bytes));
    chunk.parts.push(data);
    chunk.bytes = offset + data.length;
    return { location: chunk.name, offset };
  };

  const rewriteTensor = (tensorBuffer) => {
    const fields = parseFields(tensorBuffer);
    if (fields.some((f) => f.field === TENSOR_DATA_LOCATION_FIELD && f.wire === WIRE_VARINT && f.value[0] === DATA_LOCATION_EXTERNAL)) {
      throw new Error('The ONNX model already uses external data; nothing to split.');
    }
    const raw = fields.find((f) => f.field === TENSOR_RAW_DATA_FIELD && f.wire === WIRE_LENGTH_DELIMITED);
    if (!raw || raw.value.length < minTensorBytes) return tensorBuffer;

    const nameField = fields.find((f) => f.field === TENSOR_NAME_FIELD);
    const name = nameField ? nameField.value.toString('utf8') : '(unnamed)';
    const { location, offset } = placeTensor(name, raw.value);
    externalTensorCount += 1;

    return Buffer.concat([
      ...fields.filter((f) => f !== raw).map((f) => f.raw),
      stringEntry('location', location),
      stringEntry('offset', offset),
      stringEntry('length', raw.value.length),
      varintField(TENSOR_DATA_LOCATION_FIELD, DATA_LOCATION_EXTERNAL),
    ]);
  };

  const rewriteGraph = (graphBuffer) =>
    Buffer.concat(
      parseFields(graphBuffer).map((f) =>
        f.field === GRAPH_INITIALIZER_FIELD && f.wire === WIRE_LENGTH_DELIMITED
          ? lengthDelimited(GRAPH_INITIALIZER_FIELD, rewriteTensor(f.value))
          : f.raw
      )
    );

  const modelFields = parseFields(modelBuffer);
  if (!modelFields.some((f) => f.field === MODEL_GRAPH_FIELD && f.wire === WIRE_LENGTH_DELIMITED)) {
    throw new Error('Not an ONNX model: no graph found.');
  }
  const graph = Buffer.concat(
    modelFields.map((f) =>
      f.field === MODEL_GRAPH_FIELD && f.wire === WIRE_LENGTH_DELIMITED
        ? lengthDelimited(MODEL_GRAPH_FIELD, rewriteGraph(f.value))
        : f.raw
    )
  );

  return {
    graph,
    chunks: externalTensorCount === 0 ? [] : chunks.map((c) => ({ name: c.name, data: Buffer.concat(c.parts) })),
    externalTensorCount,
  };
}

/**
 * Splits `modelPath` in place when it is larger than `maxChunkBytes`.
 * Returns the number of chunks written (0 = left unchanged).
 */
function splitOnnxFileIfLarge(modelPath, options = {}) {
  const maxChunkBytes = options.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  if (fs.statSync(modelPath).size <= maxChunkBytes) return 0;

  const modelFileName = path.basename(modelPath);
  const { graph, chunks } = splitOnnxModel(fs.readFileSync(modelPath), modelFileName, options);
  if (chunks.length === 0) {
    throw new Error(`${modelPath} is over ${maxChunkBytes} bytes but has no tensors to move into external data.`);
  }
  for (const chunk of chunks) {
    fs.writeFileSync(path.join(path.dirname(modelPath), chunk.name), chunk.data);
  }
  fs.writeFileSync(modelPath, graph);
  return chunks.length;
}

/** Tells transformers.js how many external data chunks `<modelFileName>` has. */
function recordExternalDataChunks(configPath, modelFileName, chunkCount) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const jsConfig = config['transformers.js_config'] ?? {};
  const existing = typeof jsConfig.use_external_data_format === 'object' ? jsConfig.use_external_data_format : {};
  config['transformers.js_config'] = {
    ...jsConfig,
    use_external_data_format: { ...existing, [modelFileName]: chunkCount },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  let input;
  let maxChunkBytes = DEFAULT_MAX_CHUNK_BYTES;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') input = argv[++i];
    else if (argv[i] === '--max-chunk-mib') maxChunkBytes = Number(argv[++i]) * 1024 * 1024;
    else throw new Error(`Unknown option: ${argv[i]}\nUsage: node scripts/split-onnx-external-data.js --input <model.onnx> [--max-chunk-mib <n>]`);
  }
  if (!input) throw new Error('Missing --input <model.onnx>.');
  const chunkCount = splitOnnxFileIfLarge(input, { maxChunkBytes });
  console.log(chunkCount === 0 ? `${input} is under the chunk size; left unchanged.` : `Split ${input} into ${chunkCount} external data chunks.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_MAX_CHUNK_BYTES,
  externalDataChunkName,
  parseFields,
  recordExternalDataChunks,
  splitOnnxFileIfLarge,
  splitOnnxModel,
};
