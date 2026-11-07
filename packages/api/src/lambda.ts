import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { DynamoStore } from "./dynamo-store";
import { route, type Deps } from "./router";
import { S3Storage } from "./storage";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

// Created once per Lambda container.
const deps: Deps = {
  store: new DynamoStore(requireEnv("TABLE_NAME")),
  storage: new S3Storage(requireEnv("BUCKET_NAME")),
  now: () => new Date(),
};

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const body =
    event.body && event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const response = await route(
    {
      method: event.requestContext.http.method,
      path: event.rawPath,
      headers: event.headers,
      query: event.queryStringParameters ?? {},
      ...(body ? { body } : {}),
    },
    deps,
  );
  return response;
}
