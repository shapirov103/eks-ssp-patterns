import * as cdk from '@aws-cdk/core';

// SSP Lib
import * as ssp from '@shapirov/cdk-eks-blueprint'

// Team implementations
import * as team from '../teams'

export default class PipelineStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        const pipeline = this.buildPipeline(this)

        const dev = new ClusterStage(this, 'blueprint-stage-dev', {
            env: {
                account: props?.env?.account,
                region: 'us-west-1',
            }
        })
        pipeline.addApplicationStage(dev)

        const test = new ClusterStage(this, 'blueprint-stage-test', {
            env: {
                account: props?.env?.account,
                region: 'us-west-2',
            }
        })
        pipeline.addApplicationStage(test)

        // Manual approvals for Prod deploys.
        const prod = new ClusterStage(this, 'blueprint-stage-prod', {
            env: {
                account: props?.env?.account,
                region: 'us-east-1',
            }
        })
        pipeline.addApplicationStage(prod, { manualApprovals: true })
    }

    buildPipeline = (scope: cdk.Stack): any => {
        const repoOwner = new cdk.CfnParameter(this, "repoOwner", {
            type: "String",
            description: "The owner for the CDK GitHub repository."
        });

        const repoName = new cdk.CfnParameter(this, "repoName", {
            type: "String",
            description: "The repo name for the CDK GitHub repository."
        });

        const repoBranch = new cdk.CfnParameter(this, "repoBranch", {
            type: "String",
            description: "The branch name for the CDK GitHub repository."
        });

        const secretKey = new cdk.CfnParameter(this, "secretKey", {
            type: "String",
            description: "The Secrets Manager key for the GitHub Oauth token."
        });

        const pipelineProps = {
            name: 'blueprint-pipeline',
            owner: repoOwner.valueAsString,
            repo: repoName.valueAsString,
            branch: repoBranch.valueAsString,
            secretKey: secretKey.valueAsString,
            scope
        }
        return ssp.CodePipeline.build(pipelineProps)
    }
}

export class ClusterStage extends cdk.Stage {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StageProps) {
        super(scope, id, props);

        // Setup platform team
        const accountID = props?.env?.account
        const platformTeam = new team.TeamPlatform(accountID!)
        const teams: Array<ssp.Team> = [platformTeam];

        // AddOns for the cluster.
        const addOns: Array<ssp.ClusterAddOn> = [
            new ssp.NginxAddOn,
            new ssp.ArgoCDAddOn,
            new ssp.CalicoAddOn,
            new ssp.MetricsServerAddOn,
            new ssp.ClusterAutoScalerAddOn,
            new ssp.ContainerInsightsAddOn,
        ];
        const blueprintId = `${id}-blueprint`
        new ssp.EksBlueprint(this, { id: blueprintId, addOns, teams }, props);
    }
}