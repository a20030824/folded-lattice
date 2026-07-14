import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const licensePath = path.join(repositoryRoot, "LICENSE");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sharedProperties = JSON.parse(await readFile(propertiesPath, "utf8"));
const licenseText = await readFile(licensePath, "utf8");
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
  await writeFile(path.join(packageDirectory, "LICENSE"), licenseText, "utf8");

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

async function createZipFromDirectory(directory, zipPath) {
  await rm(zipPath, { force: true });

  let result;
  if (process.platform === "win32") {
    const source = `${escapePowerShell(path.join(directory, "*"))}`;
    const destination = escapePowerShell(zipPath);
    result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -Path '${source}' -DestinationPath '${destination}' -CompressionLevel Optimal -Force`,
      ],
      { stdio: "inherit" },
    );
  } else {
    result = spawnSync("zip", ["-q", "-r", zipPath, "."], {
      cwd: directory,
      stdio: "inherit",
    });
  }

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Archive command failed for ${path.basename(directory)} with status ${result.status}.`,
    );
  }
}

function escapePowerShell(value) {
  return value.replaceAll("'", "''");
}
