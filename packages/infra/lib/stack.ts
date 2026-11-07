import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as iam from "aws-cdk-lib/aws-iam";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface CdWalletStackProps extends cdk.StackProps {
  /** Gets an email when the month's spend nears the budget. */
  ownerEmail?: string;
  monthlyBudgetUsd: number;
  /** Optional: lets a helper account assume a role to support this deployment. */
  maintainerAccountId?: string;
}

export class CdWalletStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdWalletStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "Music", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Intelligent-Tiering moves unplayed files to cheaper tiers with no retrieval fees.
          // Archive tiers stay off, so every file is always instantly available.
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(0),
            },
          ],
        },
      ],
    });

    const table = new dynamodb.Table(this, "Library", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const health = new nodejs.NodejsFunction(this, "Health", {
      entry: path.join(here, "../../api/src/health.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
    });

    const api = new apigw.HttpApi(this, "Api");
    api.addRoutes({
      path: "/health",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HealthIntegration", health),
    });

    if (props.ownerEmail) {
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
        },
        notificationsWithSubscribers: [80, 100].map((threshold) => ({
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: props.ownerEmail! }],
        })),
      });
    }

    if (props.maintainerAccountId) {
      const role = new iam.Role(this, "MaintainerRole", {
        assumedBy: new iam.AccountPrincipal(props.maintainerAccountId),
        description: "Optional read-only access for a helper to troubleshoot this deployment",
        maxSessionDuration: cdk.Duration.hours(4),
      });
      role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"));
    }

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
  }
}
