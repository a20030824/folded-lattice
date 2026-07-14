import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distDirectory = path.join(repositoryRoot, "dist");
const outputDirectory = path.join(repositoryRoot, "lively-dist");
const manifestPath = path.join(
  repositoryRoot,
  "lively-packages",
  "manifest.json",
);
const propertiesPath = path.join(
  repositoryRoot,
  "public",
  "LivelyProperties.json",
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sharedProperties = JSON.parse(await readFile(propertiesPath, "utf8"));
const baseHtml = await readFile(path.join(distDirectory, "index.html"), "utf8");

validateManifest(manifest, sharedProperties);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const packageDefinition of manifest.packages) {
  const packageDirectory = path.join(outputDirectory, packageDefinition.slug);
  await cp(distDirectory, packageDirectory, { recursive: true });

  const packageProperties = Object.fromEntries(
    packageDefinition.properties.map((propertyName) => [
      propertyName,
      sharedProperties[propertyName],
    ]),
  );
  await writeJson(
    path.join(packageDirectory, "LivelyProperties.json"),
    packageProperties,
  );
  await writeJson(path.join(packageDirectory, "LivelyInfo.json"), {
    Title: packageDefinition.title,
    Desc: packageDefinition.description,
    Author: manifest.author,
    Contact: manifest.contact,
    Type: 1,
    FileName: "index.html",
    IsAbsolutePath: false,
    Tags: packageDefinition.tags,
    Version: manifest.version,
  });

  const packagedHtml = injectPackageMetadata(baseHtml, packageDefinition);
  await writeFile(
    path.join(packageDirectory, "index.html"),
    packagedHtml,
    "utf8",
  );

  const zipPath = path.join(
    outputDirectory,
    `${packageDefinition.slug}.zip`,
  );
  await createZipFromDirectory(packageDirectory, zipPath);
  console.log(`Created ${path.relative(repositoryRoot, zipPath)}`);
}

function validateManifest(packageManifest, properties) {
  if (!Number.isInteger(packageManifest.version) || packageManifest.version < 1) {
    throw new Error("Lively package manifest version must be a positive integer.");
  }
  if (!Array.isArray(packageManifest.packages) || packageManifest.packages.length !== 4) {
    throw new Error("Exactly four Lively package definitions are required.");
  }

  const slugs = new Set();
  const presets = new Set();
  for (const definition of packageManifest.packages) {
    for (const field of ["slug", "preset", "title", "description"]) {
      if (typeof definition[field] !== "string" || !definition[field].trim()) {
        throw new Error(`Package field "${field}" must be a non-empty string.`);
      }
    }
    if (slugs.has(definition.slug)) {
      throw new Error(`Duplicate Lively package slug: ${definition.slug}`);
    }
    if (presets.has(definition.preset)) {
      throw new Error(`Duplicate packaged preset: ${definition.preset}`);
    }
    slugs.add(definition.slug);
    presets.add(definition.preset);

    if (!Array.isArray(definition.properties) || definition.properties.length === 0) {
      throw new Error(`${definition.slug} must expose at least one property.`);
    }
    if (definition.properties.includes("preset")) {
      throw new Error(`${definition.slug} must not expose the preset dropdown.`);
    }
    for (const propertyName of definition.properties) {
      if (!(propertyName in properties)) {
        throw new Error(
          `${definition.slug} references unknown property "${propertyName}".`,
        );
      }
    }
  }
}

function injectPackageMetadata(html, definition) {
  if (!html.includes("</head>")) {
    throw new Error("Built index.html does not contain a closing head tag.");
  }
  const metadata = [
    `    <meta name="folded-lattice-preset" content="${escapeHtmlAttribute(definition.preset)}">`,
    `    <meta name="application-name" content="${escapeHtmlAttribute(definition.title)}">`,
  ].join("\n");
  return html
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtmlText(definition.title)}</title>`)
    .replace("</head>", `${metadata}\n  </head>`);
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath, root)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        archivePath: path.relative(root, absolutePath).split(path.sep).join("/"),
      });
    }
  }
  return files;
}

async function createZipFromDirectory(directory, zipPath) {
  const files = await listFiles(directory);
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const now = new Date();
  const { dosDate, dosTime } = toDosDateTime(now);

  for (const file of files) {
    const data = await readFile(file.absolutePath);
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const compressionMethod = useDeflate ? 8 : 0;
    const name = Buffer.from(file.archivePath, "utf8");
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(body.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, body);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(body.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + body.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  await writeFile(
    zipPath,
    Buffer.concat([...localParts, centralDirectory, endRecord]),
  );
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosDate:
      ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

const crcTable = createCrcTable();

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
