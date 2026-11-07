import * as cdk from "aws-cdk-lib";
import { CdWalletStack } from "../lib/stack";

const app = new cdk.App();

new CdWalletStack(app, "CdWallet", {
  ownerEmail: app.node.tryGetContext("ownerEmail"),
  monthlyBudgetUsd: Number(app.node.tryGetContext("monthlyBudgetUsd") ?? 10),
  maintainerAccountId: app.node.tryGetContext("maintainerAccountId"),
});
