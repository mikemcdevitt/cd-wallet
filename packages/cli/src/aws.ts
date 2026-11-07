import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { CliError } from "./errors";

export interface Target {
  accountId: string;
  region: string;
  arn: string;
  profile?: string;
}

const clientConfig = (target: { profile?: string; region: string }) => ({
  region: target.region,
  ...(target.profile ? { profile: target.profile } : {}),
});

function loginHint(profile?: string): string {
  return profile
    ? `Sign in first with:  aws sso login --profile ${profile}`
    : "Set AWS_PROFILE (or pass --profile) and sign in with:  aws sso login --profile <name>";
}

/** Works out which account and region the AWS credentials point at, before anything is changed. */
export async function resolveTarget(profile?: string, regionFlag?: string): Promise<Target> {
  let region = regionFlag;
  if (!region) {
    try {
      region = await new STSClient(profile ? { profile } : {}).config.region();
    } catch {
      throw new CliError("No AWS region found. Pass --region, or set one in your AWS profile.");
    }
  }
  const sts = new STSClient(clientConfig({ region, ...(profile ? { profile } : {}) }));
  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    if (!identity.Account || !identity.Arn) throw new Error("incomplete identity");
    return { accountId: identity.Account, arn: identity.Arn, region, ...(profile ? { profile } : {}) };
  } catch (err) {
    throw new CliError(`Could not use your AWS credentials (${(err as Error).message}).\n${loginHint(profile)}`);
  }
}

/** The stack's status, or undefined if it does not exist. */
export async function stackStatus(target: Target, stackName: string): Promise<string | undefined> {
  const cfn = new CloudFormationClient(clientConfig(target));
  try {
    const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    return res.Stacks?.[0]?.StackStatus;
  } catch (err) {
    if ((err as Error).name === "ValidationError") return undefined;
    throw err;
  }
}

const HEALTHY = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"]);

/** Whether CDK's one-time setup (`cdk bootstrap`) has been done in this account and region. */
export async function isBootstrapped(target: Target): Promise<boolean> {
  const status = await stackStatus(target, "CDKToolkit");
  return status !== undefined && HEALTHY.has(status);
}

const settingsClient = (target: Target) =>
  DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig(target)));

export async function readAdminTokenHash(target: Target, tableName: string): Promise<string | undefined> {
  const res = await settingsClient(target).send(
    new GetCommand({ TableName: tableName, Key: { pk: "SETTINGS" }, ConsistentRead: true }),
  );
  const hash: unknown = res.Item?.adminTokenHash;
  return typeof hash === "string" ? hash : undefined;
}

/** Stores the token hash, but never replaces one that is already there. */
export async function installAdminTokenHash(target: Target, tableName: string, hash: string): Promise<void> {
  try {
    await settingsClient(target).send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: "SETTINGS" },
        UpdateExpression: "SET adminTokenHash = :h, libraryVersion = if_not_exists(libraryVersion, :zero)",
        ConditionExpression: "attribute_not_exists(adminTokenHash)",
        ExpressionAttributeValues: { ":h": hash, ":zero": 0 },
      }),
    );
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") {
      throw new CliError("This deployment already has an admin token. Use `cdwallet reset-token` to replace it.");
    }
    throw err;
  }
}
