import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const markerName = ".jobhuntr-package-lock.sha256";

export const dependencyFingerprint = (root) =>
  createHash("sha256")
    .update(fs.readFileSync(path.join(root, "package-lock.json")))
    .digest("hex");

export const dependenciesNeedInstall = (root) => {
  const modulesLock = path.join(root, "node_modules", ".package-lock.json");
  const marker = path.join(root, "node_modules", markerName);
  if (!fs.existsSync(modulesLock)) return true;
  try {
    return (
      fs.readFileSync(marker, "utf8").trim() !== dependencyFingerprint(root)
    );
  } catch {
    return true;
  }
};

export const markDependenciesInstalled = (root) => {
  const modules = path.join(root, "node_modules");
  fs.mkdirSync(modules, { recursive: true });
  fs.writeFileSync(
    path.join(modules, markerName),
    `${dependencyFingerprint(root)}\n`,
  );
};
