import * as cdk from '@aws-cdk/core';

// SSP Lib
import * as ssp from '@shapirov/cdk-eks-blueprint'

import * as iam from '@aws-cdk/aws-iam';
import * as route53 from '@aws-cdk/aws-route53';


// Team implementations
import * as team from '../teams'
import { valueFromContext } from '@shapirov/cdk-eks-blueprint/dist/utils/context-utils';
import { Stack } from '@aws-cdk/core';

export default class NginxIngressConstruct extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        // Setup platform team
        const accountID = process.env.CDK_DEFAULT_ACCOUNT!;
        const parentDnsAccountId = this.node.tryGetContext("parent.dns.account")!;
        const subZoneName = valueFromContext(this, "dev.subzone", "*.dev.some.example.com");

        const platformTeam = new team.TeamPlatform(accountID);

        const subZone = new route53.PublicHostedZone(this, 'SubZone', {
            zoneName: subZoneName
        });

        const parentHostedZoneName = valueFromContext(this, "parent.hosted-zone.name", "some.example.com");

        // 
        // import the delegation role by constructing the roleArn.
        // Assuming the parent account has the delegating role DomainOperatorRole with 
        // trust relationship setup to the child account.
        //
        const delegationRoleArn = Stack.of(this).formatArn({
            region: '', // IAM is global in each partition
            service: 'iam',
            account: parentDnsAccountId,
            resource: 'role',
            resourceName: 'DomainOperatorRole',
        });

        const delegationRole = iam.Role.fromRoleArn(this, 'DelegationRole', delegationRoleArn);

        // create the record
        new route53.CrossAccountZoneDelegationRecord(this, 'delegate', {
            delegatedZone: subZone,
            parentHostedZoneName: parentHostedZoneName, // or you can use parentHostedZoneId
            delegationRole,
        });

        // Teams for the cluster.
        const teams: Array<ssp.Team> = [
            platformTeam,
            new team.TeamTroiSetup,
            new team.TeamRikerSetup,
            new team.TeamBurnhamSetup(scope)
        ];

        // AddOns for the cluster.
        const addOns: Array<ssp.ClusterAddOn> = [
            new ssp.NginxAddOn({ internetFacing: true, backendProtocol: "tcp", externaDnsHostname: subZoneName }),
            new ssp.ArgoCDAddOn,
            new ssp.CalicoAddOn,
            new ssp.MetricsServerAddOn,
            new ssp.ClusterAutoScalerAddOn,
            new ssp.ContainerInsightsAddOn,
        ];

        const stackID = `${id}-blueprint`
        new ssp.EksBlueprint(scope, { id: stackID, addOns, teams }, {
            env: {
                region: 'us-east-2',
            },
        });
    }
}
