/**
 * Minimal Java class-file reader: the class's name, super class, interfaces,
 * access flags, and its fields and methods (name, flags, and the name of the
 * first local variable, which tells Kotlin extension functions apart:
 * their receiver is `$this$<name>`). Only names are kept.
 */

const ACC_PUBLIC = 0x0001;
const ACC_STATIC = 0x0008;
const ACC_SYNTHETIC = 0x1000;
const ACC_INTERFACE = 0x0200;

function parseClass(buffer) {
  let p = 0;
  const u1 = () => buffer[p++];
  const u2 = () => {
    const v = buffer.readUInt16BE(p);
    p += 2;
    return v;
  };
  const u4 = () => {
    const v = buffer.readUInt32BE(p);
    p += 4;
    return v;
  };
  if (u4() !== 0xcafebabe) throw new Error('not a class file');
  p += 4; // minor, major
  const count = u2();
  const pool = new Array(count);
  for (let i = 1; i < count; i += 1) {
    const tag = u1();
    switch (tag) {
      case 1: {
        const length = u2();
        pool[i] = { tag, text: buffer.toString('utf8', p, p + length) };
        p += length;
        break;
      }
      case 7: case 8: case 16: case 19: case 20:
        pool[i] = { tag, index: u2() };
        break;
      case 3: case 4:
        p += 4;
        break;
      case 5: case 6:
        p += 8;
        i += 1;
        break;
      case 9: case 10: case 11: case 12: case 17: case 18:
        p += 4;
        break;
      case 15:
        p += 3;
        break;
      default:
        throw new Error(`unknown constant pool tag ${tag}`);
    }
  }
  const utf8 = (index) => pool[index]?.text;
  const className = (index) => (index ? utf8(pool[index].index) : null);

  const access = u2();
  const name = className(u2());
  const superName = className(u2());
  const interfaces = Array.from({ length: u2() }, () => className(u2()));

  const readMembers = (withLocals) => {
    const members = [];
    const n = u2();
    for (let i = 0; i < n; i += 1) {
      const flags = u2();
      const memberName = utf8(u2());
      p += 2; // descriptor
      let firstLocal = null;
      const attributes = u2();
      for (let a = 0; a < attributes; a += 1) {
        const attrName = utf8(u2());
        const length = u4();
        const end = p + length;
        if (withLocals && attrName === 'Code') {
          p += 4; // max_stack, max_locals
          const codeLength = u4();
          p += codeLength;
          const exceptions = u2();
          p += exceptions * 8; // exception table
          const codeAttributes = u2();
          for (let c = 0; c < codeAttributes; c += 1) {
            const codeAttrName = utf8(u2());
            const codeAttrLength = u4();
            const codeAttrEnd = p + codeAttrLength;
            if (codeAttrName === 'LocalVariableTable') {
              const entries = u2();
              for (let e = 0; e < entries; e += 1) {
                p += 4; // start_pc, length
                const localName = utf8(u2());
                p += 2; // descriptor
                const slot = u2();
                if (slot === 0) firstLocal = localName;
              }
            }
            p = codeAttrEnd;
          }
        }
        p = end;
      }
      members.push({ name: memberName, flags, firstLocal });
    }
    return members;
  };
  const fields = readMembers(false);
  const methods = readMembers(true);
  return { name, superName, interfaces, access, fields, methods };
}

const isPublic = (flags) => (flags & ACC_PUBLIC) !== 0 && (flags & ACC_SYNTHETIC) === 0;
const isStatic = (flags) => (flags & ACC_STATIC) !== 0;
const isInterface = (flags) => (flags & ACC_INTERFACE) !== 0;

/** `org/springframework/http/ResponseEntity$BodyBuilder` → package, simple name, outer names. */
function splitName(internal) {
  const slash = internal.lastIndexOf('/');
  const pkg = internal.slice(0, slash).replace(/\//g, '.');
  const parts = internal.slice(slash + 1).split('$');
  return { pkg, simple: parts[parts.length - 1], outer: parts.slice(0, -1), qualified: parts.join('.') };
}

/** Parsed public classes of jars: Map internalName → class. */
function loadClasses(entries) {
  const classes = new Map();
  for (const entry of entries) {
    if (!entry.name.endsWith('.class') || entry.name.endsWith('module-info.class') || entry.name.startsWith('META-INF/')) continue;
    const parsed = parseClass(entry.data);
    // Kotlin multifile facade parts (`CollectionsKt___CollectionsKt`) are synthetic but hold the functions.
    const facadePart = /Kt__\w+$/.test(parsed.name);
    if (!facadePart && !isPublic(parsed.access)) continue;
    if (/\$\d/.test(parsed.name)) continue; // anonymous / local classes
    classes.set(parsed.name, parsed);
  }
  return classes;
}

/** Public member names of a class including its supertypes found in `classes`. */
function flatJavaMembers(classes, internal, seen = new Set()) {
  const out = new Set();
  if (seen.has(internal)) return out;
  seen.add(internal);
  const cls = classes.get(internal);
  if (!cls) return out;
  for (const member of [...cls.methods, ...cls.fields]) {
    if (isPublic(member.flags) && !member.name.startsWith('<') && !member.name.includes('$')) out.add(member.name);
  }
  for (const base of [cls.superName, ...cls.interfaces]) {
    if (base && base !== 'java/lang/Object') for (const name of flatJavaMembers(classes, base, seen)) out.add(name);
  }
  return out;
}

module.exports = { parseClass, loadClasses, flatJavaMembers, splitName, isPublic, isStatic, isInterface };
