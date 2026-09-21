#!/usr/bin/env node

/**
 * Single-plugin validator for a repo-root Cursor plugin.
 * Adapted from cursor/plugin-template (multi-plugin marketplace layout).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const errors = [];
const warnings = [];

const pluginNamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, context) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    addError(`${context} is missing: ${filePath}`);
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    addError(`${context} contains invalid JSON (${filePath}): ${error.message}`);
    return null;
  }
}

function normalizeNewlines(content) {
  return content.replace(/\r\n/g, "\n");
}

function isYamlBlockScalarMarker(value) {
  return /^[>|][-+]?$/.test(value);
}

function parseFrontmatter(content) {
  const normalized = normalizeNewlines(content);
  if (!normalized.startsWith("---\n")) {
    return null;
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return null;
  }

  const frontmatterBlock = normalized.slice(4, closingIndex);
  const fields = {};
  let activeKey = null;

  for (const line of frontmatterBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf(":");
    const looksLikeKey =
      separator !== -1 &&
      !line.startsWith(" ") &&
      !line.startsWith("\t") &&
      /^[A-Za-z0-9_-]+$/.test(line.slice(0, separator).trim());

    if (looksLikeKey) {
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (isYamlBlockScalarMarker(value)) {
        fields[key] = "";
        activeKey = key;
      } else {
        fields[key] = value;
        activeKey = null;
      }
      continue;
    }

    if (activeKey !== null) {
      const piece = trimmed;
      fields[activeKey] = fields[activeKey] ? `${fields[activeKey]} ${piece}` : piece;
    }
  }

  return fields;
}

async function walkFiles(dirPath) {
  const files = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return true;
  }
  if (path.isAbsolute(value)) {
    return false;
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  return !normalized.startsWith("../") && normalized !== "..";
}

function extractPathValues(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractPathValues(entry));
  }

  if (value && typeof value === "object") {
    const candidates = [];
    if (typeof value.path === "string") {
      candidates.push(value.path);
    }
    if (typeof value.file === "string") {
      candidates.push(value.file);
    }
    return candidates;
  }

  return [];
}

async function validateReferencedPath(pluginDir, fieldName, pathValue, pluginName) {
  if (pathValue.startsWith("http://") || pathValue.startsWith("https://")) {
    return;
  }

  if (!isSafeRelativePath(pathValue)) {
    addError(
      `${pluginName}: field "${fieldName}" has invalid path "${pathValue}". Use a relative path without ".." or absolute prefixes.`
    );
    return;
  }

  const resolved = path.resolve(pluginDir, pathValue);
  const exists = await pathExists(resolved);
  if (!exists) {
    addError(`${pluginName}: field "${fieldName}" references missing path "${pathValue}".`);
  }
}

async function validateFrontmatterFile(filePath, componentName, requiredKeys, pluginName) {
  const content = await fs.readFile(filePath, "utf8");
  const parsed = parseFrontmatter(content);
  const relativeFile = path.relative(repoRoot, filePath);

  if (!parsed) {
    addError(`${pluginName}: ${componentName} file missing YAML frontmatter: ${relativeFile}`);
    return;
  }

  for (const key of requiredKeys) {
    if (!parsed[key] || parsed[key].length === 0) {
      addError(`${pluginName}: ${componentName} file missing "${key}" in frontmatter: ${relativeFile}`);
    }
  }
}

async function validateComponentFrontmatter(pluginDir, pluginName) {
  const rulesDir = path.join(pluginDir, "rules");
  if (await pathExists(rulesDir)) {
    const files = await walkFiles(rulesDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".md" || ext === ".mdc" || ext === ".markdown") {
        await validateFrontmatterFile(file, "rule", ["description"], pluginName);
      }
    }
  }

  const skillsDir = path.join(pluginDir, "skills");
  if (await pathExists(skillsDir)) {
    const files = await walkFiles(skillsDir);
    for (const file of files) {
      if (path.basename(file) === "SKILL.md") {
        await validateFrontmatterFile(file, "skill", ["name", "description"], pluginName);
      }
    }
  }

  const agentsDir = path.join(pluginDir, "agents");
  if (await pathExists(agentsDir)) {
    const files = await walkFiles(agentsDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".md" || ext === ".mdc" || ext === ".markdown") {
        await validateFrontmatterFile(file, "agent", ["name", "description"], pluginName);
      }
    }
  }

  const commandsDir = path.join(pluginDir, "commands");
  if (await pathExists(commandsDir)) {
    const files = await walkFiles(commandsDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".md" || ext === ".mdc" || ext === ".markdown" || ext === ".txt") {
        await validateFrontmatterFile(file, "command", ["name", "description"], pluginName);
      }
    }
  }
}

function collectMcpVariableNames(value, found = new Set()) {
  if (typeof value === "string") {
    const re = /\$\{([A-Z][A-Z0-9_]*)\}/g;
    let match;
    while ((match = re.exec(value)) !== null) {
      found.add(match[1]);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectMcpVariableNames(entry, found);
    }
    return found;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectMcpVariableNames(nested, found);
    }
  }
  return found;
}

async function validateMcpVariables(pluginDir, pluginManifest, pluginName) {
  const mcpPath = path.join(pluginDir, "mcp.json");
  if (!(await pathExists(mcpPath))) {
    addWarning(`${pluginName}: no mcp.json file found (only needed when using MCP servers).`);
    return;
  }

  const mcp = await readJsonFile(mcpPath, `${pluginName} mcp.json`);
  if (!mcp) {
    return;
  }

  const usedVars = collectMcpVariableNames(mcp);
  const declared =
    pluginManifest.variables &&
    pluginManifest.variables.properties &&
    typeof pluginManifest.variables.properties === "object"
      ? new Set(Object.keys(pluginManifest.variables.properties))
      : new Set();

  for (const name of usedVars) {
    if (!declared.has(name)) {
      addError(
        `${pluginName}: mcp.json uses \${${name}} but it is not declared under plugin.json variables.properties.`
      );
    }
  }
}

async function main() {
  const marketplacePath = path.join(repoRoot, ".cursor-plugin", "marketplace.json");
  if (await pathExists(marketplacePath)) {
    addWarning(
      "Found .cursor-plugin/marketplace.json; this repo is intended as a single-plugin layout without marketplace.json."
    );
  }

  const pluginDir = repoRoot;
  const pluginNameLabel = "adhd-hub";
  const manifestPath = path.join(pluginDir, ".cursor-plugin", "plugin.json");
  const pluginManifest = await readJsonFile(manifestPath, "Plugin manifest");
  if (!pluginManifest) {
    summarizeAndExit();
    return;
  }

  if (typeof pluginManifest.name !== "string" || !pluginNamePattern.test(pluginManifest.name)) {
    addError(
      'plugin.json "name" must be lowercase and use only alphanumerics, hyphens, and periods.'
    );
  }

  const pluginName =
    typeof pluginManifest.name === "string" && pluginManifest.name.length > 0
      ? pluginManifest.name
      : pluginNameLabel;

  const unexpectedDirs = ["agents", "commands", "hooks"];
  for (const dirName of unexpectedDirs) {
    if (await pathExists(path.join(pluginDir, dirName))) {
      addWarning(
        `${pluginName}: unexpected ${dirName}/ directory (v0.1 ships skills + rule + MCP only).`
      );
    }
  }

  const manifestFields = ["logo", "rules", "skills", "agents", "commands", "hooks", "mcpServers"];
  for (const field of manifestFields) {
    const values = extractPathValues(pluginManifest[field]);
    for (const value of values) {
      await validateReferencedPath(pluginDir, field, value, pluginName);
    }
  }

  await validateComponentFrontmatter(pluginDir, pluginName);
  await validateMcpVariables(pluginDir, pluginManifest, pluginName);

  summarizeAndExit();
}

function summarizeAndExit() {
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.error("Validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Validation passed.");
}

await main();
