import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codePipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codeBuild from 'aws-cdk-lib/aws-codebuild'
import * as codePipelinAction from 'aws-cdk-lib/aws-codepipeline-actions'


export class CloudInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "reactbucket-s3-webpage", {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      versioned: true,
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    })

    const outputSource = new codePipeline.Artifact();
    const outputWebsite = new codePipeline.Artifact();

    const pipeline = new codePipeline.Pipeline(this, "Pipeline", {
      pipelineName: "react-pipeline",
      restartExecutionOnUpdate: true,
    })

    pipeline.addStage({
      stageName: "Source",
      actions:[
        new codePipelinAction.CodeStarConnectionsSourceAction({
          actionName: "GithubSource",
          owner: "rohithkumar282",
          repo: "test-repo",
          branch: "main",
          output: outputSource,
          connectionArn: "arn:aws:codeconnections:us-east-1:004657931788:connection/8f72ed72-706c-4f22-93a2-3cc939545598"
        })

      ]
    })

    pipeline.addStage({
      stageName: "Build",
      actions:[
        new codePipelinAction.CodeBuildAction({
          actionName: "BuildUI",
          project: new codeBuild.PipelineProject(this, "UIBuild", {
            environment: {
              buildImage: codeBuild.LinuxBuildImage.AMAZON_LINUX_2_4,
              privileged: true,
              computeType: codeBuild.ComputeType.SMALL
            },
            projectName: "reactWebsite",
            buildSpec: codeBuild.BuildSpec.fromSourceFilename("./buildspec.yml"),
          }),
          input: outputSource,
          outputs: [outputWebsite]
        })
      ]
    })

    pipeline.addStage({
      stageName: "Deploy",
      actions:[
        new codePipelinAction.S3DeployAction({
          actionName: "Deployingreactwebsite",
          input: outputWebsite, 
          bucket: websiteBucket
        })
        
      ]
    })

  }
}
