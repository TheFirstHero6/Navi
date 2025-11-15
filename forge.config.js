const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const path = require("path");
const fs = require("fs");

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.join(__dirname, "src", "assets", "icon"),
  },
  hooks: {
    prePackage: async () => {
      const { execSync } = require("child_process");
      execSync("npx tsc -p tsconfig.node.json", {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      execSync("npm run build", { stdio: "inherit", cwd: process.cwd() });
    },
    packageAfterExtract: async (
      config,
      buildPath,
      electronVersion,
      platform,
      arch
    ) => {
      const backendSource = path.join(process.cwd(), "backend");
      const resourcesPath = path.join(buildPath, "resources");
      const backendDest = path.join(resourcesPath, "backend");

      if (fs.existsSync(backendSource)) {
        if (!fs.existsSync(resourcesPath)) {
          fs.mkdirSync(resourcesPath, { recursive: true });
        }

        const copyRecursiveSync = (src, dest) => {
          const exists = fs.existsSync(src);
          if (!exists) return;

          const stats = fs.statSync(src);
          const isDirectory = stats.isDirectory();

          if (isDirectory) {
            if (!fs.existsSync(dest)) {
              fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach((childItemName) => {
              // Skip .env files - they should not be packaged
              if (childItemName === ".env") {
                return;
              }
              const srcPath = path.join(src, childItemName);
              const destPath = path.join(dest, childItemName);
              copyRecursiveSync(srcPath, destPath);
            });
          } else {
            // Skip .env files
            if (path.basename(src) === ".env") {
              return;
            }
            fs.copyFileSync(src, dest);
          }
        };

        if (fs.existsSync(backendDest)) {
          fs.rmSync(backendDest, { recursive: true, force: true });
        }

        copyRecursiveSync(backendSource, backendDest);
        
        // Create a default .env file template (without API key)
        const envTemplatePath = path.join(backendDest, ".env");
        if (!fs.existsSync(envTemplatePath)) {
          fs.writeFileSync(envTemplatePath, "GEMINI_API_KEY=\n", "utf8");
          console.log("✓ Created .env template file (empty API key)");
        }

        const nodeModulesPath = path.join(backendDest, "node_modules");
        if (fs.existsSync(nodeModulesPath)) {
          fs.readdirSync(nodeModulesPath);
        } else {
          console.error(
            `✗ ERROR: Backend node_modules not found at: ${nodeModulesPath}`
          );
        }
      } else {
        console.error(`✗ ERROR: Backend source not found: ${backendSource}`);
      }

      const assetsSource = path.join(process.cwd(), "src", "assets");
      const assetsDest = path.join(resourcesPath, "src", "assets");
      if (fs.existsSync(assetsSource)) {
        if (!fs.existsSync(path.join(resourcesPath, "src"))) {
          fs.mkdirSync(path.join(resourcesPath, "src"), { recursive: true });
        }
        const copyRecursiveSync = (src, dest) => {
          const exists = fs.existsSync(src);
          if (!exists) return;
          const stats = fs.statSync(src);
          const isDirectory = stats.isDirectory();
          if (isDirectory) {
            if (!fs.existsSync(dest)) {
              fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach((childItemName) => {
              copyRecursiveSync(
                path.join(src, childItemName),
                path.join(dest, childItemName)
              );
            });
          } else {
            fs.copyFileSync(src, dest);
          }
        };
        if (fs.existsSync(assetsDest)) {
          fs.rmSync(assetsDest, { recursive: true, force: true });
        }
        copyRecursiveSync(assetsSource, assetsDest);
      }
    },
    postMake: async (config, makeResults) => {
      const backendSource = path.join(process.cwd(), "backend");

      for (const makeResult of makeResults) {
        if (makeResult.artifacts && makeResult.artifacts.length > 0) {
          const artifactPath = makeResult.artifacts[0];
          const outputDir = path.dirname(artifactPath);

          const resourcesPath = path.join(outputDir, "resources");
          const backendDest = path.join(resourcesPath, "backend");

          if (!fs.existsSync(backendSource)) {
            console.error(
              `✗ ERROR: Backend source not found: ${backendSource}`
            );
            continue;
          }

          if (!fs.existsSync(resourcesPath)) {
            fs.mkdirSync(resourcesPath, { recursive: true });
          }

          const copyRecursiveSync = (src, dest) => {
            const exists = fs.existsSync(src);
            if (!exists) return;

            const stats = fs.statSync(src);
            const isDirectory = stats.isDirectory();

            if (isDirectory) {
              if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
              }
              fs.readdirSync(src).forEach((childItemName) => {
                // Skip .env files - they should not be packaged
                if (childItemName === ".env") {
                  return;
                }
                const srcPath = path.join(src, childItemName);
                const destPath = path.join(dest, childItemName);
                copyRecursiveSync(srcPath, destPath);
              });
            } else {
              // Skip .env files
              if (path.basename(src) === ".env") {
                return;
              }
              fs.copyFileSync(src, dest);
            }
          };

          if (fs.existsSync(backendDest)) {
            fs.rmSync(backendDest, { recursive: true, force: true });
          }

          copyRecursiveSync(backendSource, backendDest);
          
          // Create a default .env file template (without API key)
          const envTemplatePath = path.join(backendDest, ".env");
          if (!fs.existsSync(envTemplatePath)) {
            fs.writeFileSync(envTemplatePath, "GEMINI_API_KEY=\n", "utf8");
            console.log("✓ Created .env template file (empty API key)");
          }
        }
      }
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "navi",
        authors: "Klaus Chamberlain",
        setupIcon: path.join(__dirname, "src", "assets", "icon.ico"),
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
