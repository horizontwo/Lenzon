/**
 * Example: a reusable SQS-driven Fargate job-worker construct.
 *
 * Illustrative reference extracted from the Lenzon backend — it conveys the
 * pattern (SQS + DLQ → EventBridge Pipe → Fargate task, with a KMS-encrypted
 * S3 bucket and least-privilege IAM) without any account-specific values.
 * Instantiate once per workload class and pass your own `resourcePrefix`,
 * VPC, cluster, and KMS key.
 */
import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as pipes from 'aws-cdk-lib/aws-pipes';
import { Construct } from 'constructs';

export interface JobWorkerProps {
  /** Logical class for this workload — 'clone', 'render', etc. */
  jobClass: string;

  /** VPC the Fargate tasks run in (private subnets only). */
  vpc: ec2.IVpc;

  /** Shared ECS cluster for both workloads. */
  cluster: ecs.ICluster;

  /** Customer-managed KMS key encrypting the bucket. */
  dataKey: kms.IKey;

  /** Account-wide CloudTrail trail; we attach S3 data events for this bucket. */
  trail: cloudtrail.Trail;

  /** Days before objects in the bucket are auto-deleted (safety net). */
  bucketLifetimeDays: number;

  /** SQS visibility timeout — should exceed worst-case task runtime. */
  queueVisibilityTimeout: cdk.Duration;

  /** Fargate task vCPU (1024 = 1 vCPU). */
  taskCpu: number;

  /** Fargate task memory in MiB. */
  taskMemoryMiB: number;

  /** Ephemeral storage in GiB (Fargate min 21, max 200). */
  ephemeralStorageGiB: number;

  /** Resource name prefix — e.g., 'myapp-dev'. */
  resourcePrefix: string;

  /**
   * Optional immutable image tag (typically a git SHA) to pin the task
   * definition to. When omitted, the task definition points at
   * `public.ecr.aws/docker/library/hello-world:latest` as a placeholder so
   * the substrate can deploy before the first CI build has pushed an image.
   */
  imageTag?: string;

  /**
   * Extra container env vars merged on top of the base set
   * (JOB_CLASS / BUCKET_NAME / QUEUE_URL / AWS_REGION). Values must be
   * non-secret — secret material is resolved at runtime via
   * `callbackSecret`. Used by the clone worker to receive
   * VERCEL_PROVIDER_TOKEN_URL / VERCEL_CLONE_RESULT_URL.
   */
  extraEnvironment?: Record<string, string>;

  /**
   * Optional Secrets Manager secret the task is allowed to read at
   * runtime. When supplied, its ARN is exposed to the container as
   * LENZON_WORKER_CALLBACK_SECRET_ARN and the task role is granted
   * secretsmanager:GetSecretValue on it. Used by the clone worker to
   * fetch the worker→Vercel HMAC secret.
   */
  callbackSecret?: secretsmanager.ISecret;
}

/**
 * Reusable substrate for one long-running job workload.
 *
 * Instantiated once per workload class (clone, render). Each instance owns:
 *   - S3 bucket (KMS-encrypted, no public access, lifecycle expiry)
 *   - SQS queue + DLQ + alarm
 *   - IAM task role scoped to this workload's bucket/queue/log group
 *   - CloudWatch log group with 30-day retention
 *   - ECR repo (immutable tags, scan-on-push)
 *   - Fargate task definition referencing a placeholder image
 *   - EventBridge Pipe wiring SQS → ecs:RunTask
 */
export class JobWorker extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly queue: sqs.Queue;
  public readonly dlq: sqs.Queue;
  public readonly taskRole: iam.Role;
  public readonly taskExecutionRole: iam.Role;
  public readonly logGroup: logs.LogGroup;
  public readonly repository: ecr.Repository;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly taskSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: JobWorkerProps) {
    super(scope, id);

    const name = `${props.resourcePrefix}-${props.jobClass}`;

    // ── S3 bucket ──────────────────────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: `${name}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.dataKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          id: 'auto-expire',
          enabled: true,
          expiration: cdk.Duration.days(props.bucketLifetimeDays),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // CloudTrail data events for this bucket (per the plan: per-bucket data
    // events at the JobWorker level instead of an account-wide selector).
    props.trail.addS3EventSelector(
      [{ bucket: this.bucket }],
      {
        readWriteType: cloudtrail.ReadWriteType.ALL,
        includeManagementEvents: false,
      },
    );

    // ── SQS queue + DLQ ────────────────────────────────────────────────
    this.dlq = new sqs.Queue(this, 'Dlq', {
      queueName: `${name}-jobs-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.queue = new sqs.Queue(this, 'Queue', {
      queueName: `${name}-jobs`,
      visibilityTimeout: props.queueVisibilityTimeout,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: this.dlq,
      },
    });

    new cloudwatch.Alarm(this, 'DlqDepthAlarm', {
      alarmName: `${name}-dlq-not-empty`,
      alarmDescription: `Messages in ${name}-jobs-dlq — investigate.`,
      metric: this.dlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ── CloudWatch log group ───────────────────────────────────────────
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/${props.resourcePrefix}/${props.jobClass}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── ECR repository ─────────────────────────────────────────────────
    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: `${name}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
          rulePriority: 1,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── IAM roles ──────────────────────────────────────────────────────
    // Execution role: lets ECS pull the image and write task-level logs.
    this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${name}-task-execution`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    this.repository.grantPull(this.taskExecutionRole);
    this.logGroup.grantWrite(this.taskExecutionRole);

    // Task role: what the workload code itself can do at runtime.
    this.taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${name}-task`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    this.bucket.grantReadWrite(this.taskRole);
    this.bucket.grantDelete(this.taskRole);
    props.dataKey.grantEncryptDecrypt(this.taskRole);
    this.queue.grantConsumeMessages(this.taskRole);
    this.logGroup.grantWrite(this.taskRole);

    // ── Fargate task definition ────────────────────────────────────────
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: `${name}`,
      cpu: props.taskCpu,
      memoryLimitMiB: props.taskMemoryMiB,
      ephemeralStorageGiB: props.ephemeralStorageGiB,
      taskRole: this.taskRole,
      executionRole: this.taskExecutionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // Container image: when an `imageTag` is supplied (typically a git SHA
    // from CI), pin to the per-workload ECR repo at that tag. Otherwise fall
    // back to hello-world so a fresh stack deploy succeeds before the first
    // CI build lands.
    const containerImage = props.imageTag
      ? ecs.ContainerImage.fromEcrRepository(this.repository, props.imageTag)
      : ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/hello-world:latest');

    this.taskDefinition.addContainer('App', {
      containerName: 'app',
      image: containerImage,
      logging: ecs.LogDrivers.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: props.jobClass,
      }),
      environment: {
        JOB_CLASS: props.jobClass,
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: this.queue.queueUrl,
        AWS_REGION: cdk.Stack.of(this).region,
        ...(props.callbackSecret
          ? { LENZON_WORKER_CALLBACK_SECRET_ARN: props.callbackSecret.secretArn }
          : {}),
        ...(props.extraEnvironment ?? {}),
      },
    });

    if (props.callbackSecret) {
      props.callbackSecret.grantRead(this.taskRole);
    }

    // ── EventBridge Pipe: SQS → ecs:RunTask ────────────────────────────
    // The pipe role needs sqs:Receive/Delete on the queue and ecs:RunTask +
    // iam:PassRole on the task/execution roles.
    const pipeRole = new iam.Role(this, 'PipeRole', {
      roleName: `${name}-pipe`,
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com'),
    });
    this.queue.grantConsumeMessages(pipeRole);
    pipeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecs:RunTask'],
      resources: [this.taskDefinition.taskDefinitionArn],
      conditions: {
        ArnEquals: {
          'ecs:cluster': props.cluster.clusterArn,
        },
      },
    }));
    pipeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [this.taskRole.roleArn, this.taskExecutionRole.roleArn],
      conditions: {
        StringLike: {
          'iam:PassedToService': 'ecs-tasks.amazonaws.com',
        },
      },
    }));

    // ── Security group for the task ENI ────────────────────────────────
    // EventBridge Pipes ECS targets default to the VPC's *default* SG when
    // none is specified, and CDK-managed VPCs leave the default SG with no
    // egress rules. Without explicit egress, the task can't reach the
    // CloudWatch Logs interface endpoint to register its log stream and
    // ECS aborts with "ResourceInitializationError: ... CloudWatch ...
    // connection issue between the task and Amazon CloudWatch."
    //
    // Outbound 443 to anywhere covers: VPC endpoints (ECR API, ECR Docker,
    // CloudWatch Logs, Secrets Manager if added later) and the NAT path for
    // anything not endpoint-routed (public-ECR, github.com, etc.).
    this.taskSecurityGroup = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc: props.vpc,
      description: `Egress for ${name} Fargate task ENIs`,
      allowAllOutbound: false,
    });
    this.taskSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS to AWS APIs (logs, ECR, S3) and outbound git clone',
    );

    const privateSubnetIds = props.vpc.privateSubnets.map((s) => s.subnetId);

    new pipes.CfnPipe(this, 'Pipe', {
      name: `${name}-pipe`,
      roleArn: pipeRole.roleArn,
      source: this.queue.queueArn,
      sourceParameters: {
        sqsQueueParameters: {
          batchSize: 1,
        },
      },
      target: props.cluster.clusterArn,
      targetParameters: {
        ecsTaskParameters: {
          taskDefinitionArn: this.taskDefinition.taskDefinitionArn,
          launchType: 'FARGATE',
          taskCount: 1,
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: privateSubnetIds,
              securityGroups: [this.taskSecurityGroup.securityGroupId],
              assignPublicIp: 'DISABLED',
            },
          },
          // Inject the SQS message body as the container's MESSAGE_BODY env
          // var via a container override, so the placeholder (Step 6) can
          // log it and prove end-to-end delivery.
          overrides: {
            containerOverrides: [
              {
                name: 'app',
                environment: [
                  { name: 'MESSAGE_BODY', value: '$.body' },
                ],
              },
            ],
          },
        },
      },
    });
  }
}
