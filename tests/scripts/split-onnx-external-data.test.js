const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseFields,
  recordExternalDataChunks,
  splitOnnxFileIfLarge,
  splitOnnxModel,
} = require('../../scripts/split-onnx-external-data');

function varint(value) {
  const bytes = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 128) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}
const field = (no, payload) => Buffer.concat([varint(no * 8 + 2), varint(payload.length), payload]);
const intField = (no, value) => Buffer.concat([varint(no * 8), varint(value)]);

function tensor(name, data) {
  return Buffer.concat([intField(1, data.length), intField(2, 3), field(8, Buffer.from(name)), field(9, data)]);
}

/** ModelProto { ir_version, graph { node, name, initializer... }, opset_import } */
function model(tensors) {
  const graph = Buffer.concat([
    field(1, Buffer.from('fake-node')),
    field(2, Buffer.from('main')),
    ...tensors.map(([name, data]) => field(5, tensor(name, data))),
  ]);
  return Buffer.concat([intField(1, 8), field(7, graph), field(8, intField(2, 17))]);
}

function initializers(graphModel) {
  const graph = parseFields(graphModel).find((f) => f.field === 7).value;
  return parseFields(graph)
    .filter((f) => f.field === 5)
    .map((f) => {
      const fields = parseFields(f.value);
      const external = Object.fromEntries(
        fields
          .filter((t) => t.field === 13)
          .map((t) => parseFields(t.value).map((kv) => kv.value.toString()))
      );
      return {
        name: fields.find((t) => t.field === 8).value.toString(),
        raw: fields.find((t) => t.field === 9)?.value,
        external,
        location: fields.find((t) => t.field === 14)?.value[0],
      };
    });
}

const bytes = (length, fill) => Buffer.alloc(length, fill);

describe('split-onnx-external-data', () => {
  test('moves large initializers into size-capped chunks and keeps the rest of the model', () => {
    const a = bytes(3000, 1);
    const b = bytes(3000, 2);
    const small = bytes(10, 3);
    const source = model([['a', a], ['small', small], ['b', b]]);

    const { graph, chunks } = splitOnnxModel(source, 'model_quantized.onnx', { maxChunkBytes: 4000 });

    expect(chunks.map((c) => c.name)).toEqual(['model_quantized.onnx_data', 'model_quantized.onnx_data_1']);
    const [ta, tsmall, tb] = initializers(graph);
    expect(ta).toMatchObject({ raw: undefined, location: 1, external: { location: 'model_quantized.onnx_data', offset: '0', length: '3000' } });
    expect(tb).toMatchObject({ raw: undefined, location: 1, external: { location: 'model_quantized.onnx_data_1', offset: '0', length: '3000' } });
    expect(tsmall.raw).toEqual(small);
    expect(tsmall.location).toBeUndefined();
    expect(chunks[0].data).toEqual(a);
    expect(chunks[1].data).toEqual(b);

    // Fields outside the initializers are copied through unchanged.
    const fields = parseFields(graph);
    expect(fields.find((f) => f.field === 1).raw).toEqual(intField(1, 8));
    expect(fields.find((f) => f.field === 8).raw).toEqual(field(8, intField(2, 17)));
  });

  test('aligns tensors that share a chunk', () => {
    const { graph, chunks } = splitOnnxModel(model([['a', bytes(1030, 1)], ['b', bytes(1100, 2)]]), 'm.onnx', {
      maxChunkBytes: 10000,
    });
    expect(chunks).toHaveLength(1);
    const [, tb] = initializers(graph);
    expect(tb.external.offset).toBe('1088');
    expect(chunks[0].data.subarray(1088)).toEqual(bytes(1100, 2));
  });

  test('refuses a tensor larger than one chunk and a model that is already external', () => {
    expect(() => splitOnnxModel(model([['big', bytes(5000, 1)]]), 'm.onnx', { maxChunkBytes: 4000 })).toThrow(/larger than one/);
    const { graph } = splitOnnxModel(model([['a', bytes(2000, 1)]]), 'm.onnx', { maxChunkBytes: 4000 });
    expect(() => splitOnnxModel(graph, 'm.onnx', { maxChunkBytes: 4000 })).toThrow(/already uses external data/);
  });

  test('splits a file only when it is over the chunk size and records the chunk count', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-split-'));
    try {
      const modelPath = path.join(dir, 'model_quantized.onnx');
      const source = model([['a', bytes(3000, 1)], ['b', bytes(3000, 2)]]);
      fs.writeFileSync(modelPath, source);

      expect(splitOnnxFileIfLarge(modelPath, { maxChunkBytes: source.length })).toBe(0);
      expect(fs.readFileSync(modelPath)).toEqual(source);

      expect(splitOnnxFileIfLarge(modelPath, { maxChunkBytes: 4000 })).toBe(2);
      expect(fs.readdirSync(dir).sort()).toEqual([
        'model_quantized.onnx',
        'model_quantized.onnx_data',
        'model_quantized.onnx_data_1',
      ]);

      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ model_type: 'roberta' }));
      recordExternalDataChunks(configPath, 'model_quantized.onnx', 2);
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({
        model_type: 'roberta',
        'transformers.js_config': { use_external_data_format: { 'model_quantized.onnx': 2 } },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
