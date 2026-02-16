import * as cdk from "aws-cdk-lib";
import { AffectExperimentStack } from "../lib/affect-stack.js";

const app = new cdk.App();
new AffectExperimentStack(app, "AffectExperimentStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});
