import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda_proc from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';

export class CloudInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const GITHUB_OWNER = 'rohithkumar282';
    const GITHUB_REPO = 'test-repo';
    const GITHUB_BRANCH = 'main';
    const GITHUB_CONNECTION_ARN = 'arn:aws:codeconnections:us-east-1:004657931788:connection/8f72ed72-706c-4f22-93a2-3cc939545598';

    const websiteBucket = new s3.Bucket(this, "reactbucket-s3-webpage", {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      versioned: true,
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    })

    new cdk.CfnOutput(this, 'WebsiteEndpoint', {
      value: websiteBucket.bucketWebsiteUrl,
      description: 'S3 static website URL',
    });

    const eventsBucket = new s3.Bucket(this, 'EventsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    const firehoseRole = new iam.Role(this, 'FirehoseRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com')
    });

    eventsBucket.grantWrite(firehoseRole);
    eventsBucket.grantRead(firehoseRole);
    firehoseRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [eventsBucket.bucketArn]
    }));

    const eventsDeliveryStream = new firehose.CfnDeliveryStream(this, 'EventsDeliveryStream', {
      deliveryStreamType: 'DirectPut',
      extendedS3DestinationConfiguration: {
        bucketArn: eventsBucket.bucketArn,
        roleArn: firehoseRole.roleArn,
        bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
        compressionFormat: 'ZIP',
        prefix: 'events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/',
        errorOutputPrefix: 'errors/',
      }
    });

    const ingestFn = new lambda_proc.Function(this, 'IngestFn', {
      runtime: lambda_proc.Runtime.PYTHON_3_12,
      handler: 'app.handler',
      code: lambda_proc.Code.fromAsset('lambda'), 
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        FIREHOSE_NAME: eventsDeliveryStream.ref
      }
    });

    ingestFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['firehose:PutRecord'],
      resources: [`arn:aws:firehose:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:deliverystream/${eventsDeliveryStream.ref}`]
    }));

    const api = new apigw.RestApi(this, 'IngestApi', {
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,    
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['content-type', 'x-api-key'],
      },
    });

    const ingest = api.root.addResource('ingest');
    ingest.addMethod('POST', new apigw.LambdaIntegration(ingestFn, { proxy: true }));

    const ingestUrl = `${api.url}ingest`;

    new cdk.CfnOutput(this, 'IngestUrl', {
      value: ingestUrl,
      description: 'Public ingest endpoint for the website',
    });

    const buildProject = new codebuild.PipelineProject(this, 'ReactBuild', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: false,
        environmentVariables: {
          REACT_APP_INGEST_URL: { value: ingestUrl },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'echo "Node:" && node -v',
              'npm ci',
            ],
          },
          build: {
            commands: [
              'echo "Building with REACT_APP_INGEST_URL=$REACT_APP_INGEST_URL"',
              'npm run build',
            ],
          },
        },
        artifacts: {
          'base-directory': 'build', // change if your app builds elsewhere
          files: ['**/*'],
        },
      }),
    });

    websiteBucket.grantReadWrite(buildProject);

    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    const sourceAction = new codepipeline_actions.CodeStarConnectionsSourceAction({
      actionName: 'GitHub_Source',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      branch: GITHUB_BRANCH,
      connectionArn: GITHUB_CONNECTION_ARN,
      output: sourceOutput,
    });

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build_React',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    const deployAction = new codepipeline_actions.S3DeployAction({
      actionName: 'Deploy_To_S3',
      input: buildOutput,
      bucket: websiteBucket,
    });

    new codepipeline.Pipeline(this, 'ReactWebsitePipeline', {
      stages: [
        { stageName: 'Source', actions: [sourceAction] },
        { stageName: 'Build', actions: [buildAction] },
        { stageName: 'Deploy', actions: [deployAction] },
      ],
    });

    new cdk.CfnOutput(this, 'StaticWebsiteUrl', {
      value: websiteBucket.bucketWebsiteUrl,
      description: 'Open this URL to view the site',
    }); 
  }
}