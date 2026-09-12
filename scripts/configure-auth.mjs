import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";

const [deployment, site] = process.argv.slice(2);
if (
  !deployment ||
  !/^[a-z0-9-]+$/.test(deployment) ||
  !site ||
  !/^https:\/\/[a-z0-9-]+\.convex\.site$/.test(site)
) {
  throw new Error(
    "Usage: node scripts/configure-auth.mjs DEPLOYMENT https://DEPLOYMENT.convex.site",
  );
}
function cli(args, input) {
  return spawnSync("npx", ["convex", ...args, "--deployment", deployment], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}
const existing = cli(["env", "get", "JWT_PRIVATE_KEY"]);
if (existing.status !== 0)
  throw new Error(
    "Could not inspect this deployment. Sign in with the Convex CLI and verify its name. No keys were changed.",
  );
if (existing.stdout.trim())
  throw new Error(
    "This deployment already has an auth signing key. Refusing to replace it.",
  );
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = publicKey.export({ format: "jwk" });
const values = {
  JWT_PRIVATE_KEY: privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
  JWKS: JSON.stringify({ keys: [{ ...jwk, use: "sig", alg: "RS256" }] }),
  SITE_URL: site,
};
for (const [name, value] of Object.entries(values)) {
  const result = cli(["env", "set", name], value + "\n");
  if (result.status !== 0)
    throw new Error(
      `Failed to configure ${name}. Provider output is suppressed to protect credentials; inspect your deployment in the dashboard.`,
    );
  console.log(`Configured ${name} on ${deployment}.`);
}
