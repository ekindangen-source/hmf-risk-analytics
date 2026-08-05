import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const region = process.env.AWS_REGION || "ap-southeast-1";
const client = new SecretsManagerClient({ region });
const cache = new Map();

async function loadSecret(secretId) {
  if (!cache.has(secretId)) {
    const promise = client
      .send(new GetSecretValueCommand({ SecretId: secretId }))
      .then((response) => {
        if (!response.SecretString) {
          throw new Error(`Secret ${secretId} has no SecretString`);
        }

        return JSON.parse(response.SecretString);
      })
      .catch((error) => {
        cache.delete(secretId);
        throw error;
      });

    cache.set(secretId, promise);
  }

  return cache.get(secretId);
}

export function getPostgresSecret() {
  return loadSecret(
    process.env.POSTGRES_SECRET_ID || "hmf/risk-analytics/postgres",
  );
}

export function getSqlServerSecret() {
  return loadSecret(
    process.env.SQLSERVER_SECRET_ID || "hmf/risk-analytics/sqlserver",
  );
}
