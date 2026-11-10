import {
  CloudFormationClient,
  DeleteStackCommand,
  DescribeStackResourcesCommand,
  waitUntilStackDeleteComplete,
} from "@aws-sdk/client-cloudformation";
import { DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { stackStatus, type Target } from "./aws";

/** The AWS calls `destroy` makes, behind an interface so tests can use a fake. */
export interface DestroyOps {
  stackStatus(): Promise<string | undefined>;
  /** The Lambda's log group, which AWS creates outside the stack and so outlives it. */
  logGroupName(): Promise<string | undefined>;
  /** Deletes the stack and waits until it is gone. Retained resources (bucket, table) are kept. */
  deleteStack(): Promise<void>;
  /** How many objects the bucket holds, or undefined if it does not exist. Read-only. */
  countObjects(bucket: string): Promise<number | undefined>;
  /** Deletes every object and then the bucket. Returns how many objects were removed. */
  emptyAndDeleteBucket(bucket: string, onProgress?: (deleted: number) => void): Promise<number>;
  deleteTable(table: string): Promise<void>;
}

const clientConfig = (target: Target) => ({
  region: target.region,
  ...(target.profile ? { profile: target.profile } : {}),
});

const named = (err: unknown, ...names: string[]): boolean => names.includes((err as Error).name);

export function awsDestroyOps(target: Target, stackName: string): DestroyOps {
  const cfn = new CloudFormationClient(clientConfig(target));
  return {
    stackStatus: () => stackStatus(target, stackName),

    async logGroupName() {
      try {
        const res = await cfn.send(new DescribeStackResourcesCommand({ StackName: stackName }));
        const fn = res.StackResources?.find((r) => r.ResourceType === "AWS::Lambda::Function");
        return fn?.PhysicalResourceId ? `/aws/lambda/${fn.PhysicalResourceId}` : undefined;
      } catch (err) {
        if (named(err, "ValidationError")) return undefined;
        throw err;
      }
    },

    async deleteStack() {
      await cfn.send(new DeleteStackCommand({ StackName: stackName }));
      await waitUntilStackDeleteComplete({ client: cfn, maxWaitTime: 900 }, { StackName: stackName });
    },

    async countObjects(bucket) {
      const s3 = new S3Client(clientConfig(target));
      let count = 0;
      let token: string | undefined;
      try {
        do {
          const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
          count += page.KeyCount ?? 0;
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
      } catch (err) {
        if (named(err, "NoSuchBucket")) return undefined;
        throw err;
      }
      return count;
    },

    async emptyAndDeleteBucket(bucket, onProgress) {
      const s3 = new S3Client(clientConfig(target));
      let deleted = 0;
      try {
        for (;;) {
          // Always list from the start: what was just deleted no longer shows up.
          const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }));
          const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
          if (keys.length === 0) break;
          const res = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
          if (res.Errors?.length) {
            const first = res.Errors[0]!;
            throw new Error(`Could not delete ${first.Key ?? "an object"}: ${first.Message ?? first.Code ?? "unknown error"}`);
          }
          deleted += keys.length;
          onProgress?.(deleted);
        }
        await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
      } catch (err) {
        if (named(err, "NoSuchBucket")) return deleted;
        throw err;
      }
      return deleted;
    },

    async deleteTable(table) {
      try {
        await new DynamoDBClient(clientConfig(target)).send(new DeleteTableCommand({ TableName: table }));
      } catch (err) {
        if (!named(err, "ResourceNotFoundException")) throw err;
      }
    },
  };
}
