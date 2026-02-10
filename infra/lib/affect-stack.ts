import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

export class AffectExperimentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const participants = new dynamodb.Table(this, "Participants", {
      partitionKey: { name: "participant_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true
    });

    const sessions = new dynamodb.Table(this, "Sessions", {
      partitionKey: { name: "session_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true
    });

    const participantLocks = new dynamodb.Table(this, "ParticipantLocks", {
      partitionKey: { name: "lock_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true
    });

    const stimulus = new dynamodb.Table(this, "Stimulus", {
      partitionKey: { name: "stimulus_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true
    });

    const sessionStimuli = new dynamodb.Table(this, "SessionStimuli", {
      partitionKey: { name: "session_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "stimulus_order", type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true
    });

    const assignmentCounters = new dynamodb.Table(this, "AssignmentCounters", {
      partitionKey: { name: "stimulus_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true
    });

    const events = new dynamodb.Table(this, "Events", {
      partitionKey: { name: "session_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "event_key", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true
    });

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    const apiFn = new lambda.Function(this, "ApiFn", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("../backend/dist"),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      environment: {
        PARTICIPANTS_TABLE: participants.tableName,
        SESSIONS_TABLE: sessions.tableName,
        PARTICIPANT_LOCKS_TABLE: participantLocks.tableName,
        STIMULUS_TABLE: stimulus.tableName,
        SESSION_STIMULI_TABLE: sessionStimuli.tableName,
        ASSIGNMENT_COUNTERS_TABLE: assignmentCounters.tableName,
        EVENTS_TABLE: events.tableName,
        STIMULI_PER_SESSION: "3"
      }
    });

    participants.grantReadWriteData(apiFn);
    sessions.grantReadWriteData(apiFn);
    participantLocks.grantReadWriteData(apiFn);
    stimulus.grantReadWriteData(apiFn);
    sessionStimuli.grantReadWriteData(apiFn);
    assignmentCounters.grantReadWriteData(apiFn);
    events.grantReadWriteData(apiFn);

    const httpApi = new apigwv2.HttpApi(this, "Api", {
      corsPreflight: {
        allowHeaders: ["content-type"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: ["*"]
      }
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration("ApiIntegration", apiFn)
    });

    const distribution = new cloudfront.Distribution(this, "SiteCdn", {
      defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket) },
      additionalBehaviors: {
        "api/*": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", httpApi.url || ""))),
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
        }
      }
    });

    new cdk.CfnOutput(this, "CloudFrontDomain", { value: distribution.domainName });
    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.url || "" });
  }
}
