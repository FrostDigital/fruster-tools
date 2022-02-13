import chalk from "chalk";
import enquirer from "enquirer";
import {
	createClusterRole,
	createClusterRoleBinding,
	createDeployment,
	createNamespace,
	createSecret,
	createServiceAccount,
	getClusterRole,
	getClusterRoleBinding,
	getDeployment,
	getNamespaces,
	getSecret,
	getServiceAccount,
} from "../kube/kube-client";
import * as log from "../log";
import { ClusterRole } from "../models/ClusterRole";
import { ClusterRoleBinding } from "../models/ClusterRoleBinding";
import { Deployment } from "../models/Deployment";
import { Secret } from "../models/Secret";
import { ServiceAccount } from "../models/ServiceAccount";
import { base64encode } from "../utils";
import { pressEnterToContinue } from "../utils/cli-utils";
import { popScreen } from "./engine";

const defaultVersion = "0.0.5";

export async function installTokenRefresher() {
	console.log();
	console.log(`This will install ${chalk.magenta("fruster-registry-token-refresher")} onto the cluster.`);
	console.log(
		`The token refresher is used to continuously create a fresh authentication for private registries\nand save it as a secret of type kubernetes.io/dockerconfigjson.`
	);
	console.log();
	console.log(
		chalk.dim(
			"This is needed as AWS ECR and other private registries only provide short lived tokens for authentication,\nso even if there is a working authentication at the time the registry is added it will fail if used a couple of \nhours later i.e. when pod is rescheduled onto another node."
		)
	);
	console.log();

	const { namespace, name, version } = await enquirer.prompt<{ namespace: string; name: string; version: string }>([
		{
			type: "input",
			message: "Namespace in which token refresher will be installed",
			initial: "fruster",
			name: "namespace",
			required: true,
		},
		{
			type: "input",
			message: "Name of deployment",
			initial: "token-refresher",
			name: "name",
			required: true,
		},
		{
			type: "input",
			message: "Version",
			initial: defaultVersion,
			name: "version",
		},
	]);

	console.log("\n\n");

	// Check if namespace exists or needs to be created
	const namespaces = await getNamespaces();

	if (!namespaces.find((n) => n.metadata.name === namespace)) {
		const { confirmCreateNamespace } = await enquirer.prompt<{ confirmCreateNamespace: boolean }>({
			type: "confirm",
			name: "confirmCreateNamespace",
			message: `Namespace ${chalk.magenta(namespace)} does not exist, do you want to create it?`,
		});

		if (!confirmCreateNamespace) {
			log.error("Namespace must exist or be created");
			await pressEnterToContinue();
			return popScreen();
		} else {
			await createNamespace(namespace);
			console.log(`Namespace ${chalk.magenta(namespace)} was created`);
		}
	}

	// Check if deployment already exists
	const existingTokenRefresher = await getDeployment(namespace, name);

	if (existingTokenRefresher) {
		log.error(`A deployment with name ${name} in namespace ${namespace} already exists`);
		await pressEnterToContinue();
		return popScreen();
	}

	const namespacedName = namespace + ":" + name;

	// Ensure cluster role
	const existingClusterRole = await getClusterRole(namespacedName);

	if (existingClusterRole) {
		console.log(
			`ClusterRole ${namespacedName} already exists, keeping that one but make sure that is rules so that token refresher is allowed to list namespaces and CRUD secrets`
		);
	} else {
		await createClusterRole(clusterRole(name, namespace));

		console.log(`ClusterRole ${chalk.magenta(namespacedName)} was created`);
	}

	// Ensure cluster role binding
	const existingClusterRoleBinding = await getClusterRoleBinding(namespacedName);

	if (existingClusterRoleBinding) {
		console.log(`ClusterRoleBinding ${namespacedName} already exists, keeping it as-is`);
	} else {
		await createClusterRoleBinding(clusterRoleBinding(name, namespace));
		console.log(`ClusterRoleBinding ${chalk.magenta(namespacedName)} was created`);
	}

	// Ensure service account
	const existingServiceAccount = await getServiceAccount(namespace, name);

	if (existingServiceAccount) {
		console.log(`ServiceAccount ${name} in namespace ${namespace} already exists, keeping it as-is`);
	} else {
		await createServiceAccount(namespace, serviceAccount(name, namespace));
		console.log(`ServiceAccount ${chalk.magenta(name)} was created`);
	}

	// Create secret
	const existingSecret = await getSecret(namespace, name);

	if (existingSecret) {
		console.log(`Secret ${name} in namespace ${namespace} already exists, keeping it as-is`);
	} else {
		await createSecret(namespace, secret(name, namespace));
		console.log(`Secret ${chalk.magenta(name)} was created`);
	}

	await createDeployment(namespace, deployment(name, namespace, version || defaultVersion));

	console.log();
	log.success(
		`✅ Created token refresher deployment ${chalk.magenta(name)} in namespace ${chalk.magenta(namespace)}\n`
	);
	console.log("");
	console.log();

	await pressEnterToContinue();

	popScreen();
}

const deployment = (name: string, namespace: string, tokenRefresherTag: string): Deployment => ({
	apiVersion: "apps/v1",
	kind: "Deployment",
	metadata: {
		name,
		namespace,
		labels: {
			"app.kubernetes.io/part-of": "fruster-registry-token-refresher",
		},
	},
	spec: {
		replicas: 1,
		selector: {
			matchLabels: {
				app: name,
			},
		},
		template: {
			metadata: {
				labels: {
					app: name,
				},
			},
			spec: {
				serviceAccountName: name,
				containers: [
					{
						name: name,
						image: "fruster/fruster-registry-token-refresher:" + tokenRefresherTag,
						env: [
							{
								name: "REGISTRIES",
								valueFrom: {
									secretKeyRef: {
										key: "REGISTRIES",
										name: name,
									},
								},
							},
						],
					},
				],
			},
		},
	},
});

const clusterRole = (name: string, namespace: string): ClusterRole => ({
	apiVersion: "rbac.authorization.k8s.io/v1",
	kind: "ClusterRole",
	metadata: {
		name: namespace + ":" + name,
		labels: {
			"app.kubernetes.io/part-of": "fruster-registry-token-refresher",
		},
	},
	rules: [
		{
			apiGroups: [""],
			resources: ["namespaces"],
			verbs: ["list"],
		},
		{
			apiGroups: [""],
			resources: ["secrets"],
			verbs: ["list", "get", "create", "patch", "update"],
		},
	],
});

const clusterRoleBinding = (name: string, namespace: string): ClusterRoleBinding => ({
	kind: "ClusterRoleBinding",
	apiVersion: "rbac.authorization.k8s.io/v1",
	metadata: {
		name: namespace + ":" + name,
		labels: {
			app: name,
			"app.kubernetes.io/part-of": "fruster-registry-token-refresher",
		},
	},
	roleRef: {
		apiGroup: "rbac.authorization.k8s.io",
		kind: "ClusterRole",
		name: namespace + ":" + name,
	},
	subjects: [
		{
			kind: "ServiceAccount",
			name,
			namespace,
		},
	],
});

const serviceAccount = (name: string, namespace: string): ServiceAccount => ({
	apiVersion: "v1",
	kind: "ServiceAccount",
	metadata: {
		name,
		namespace,
		labels: {
			"app.kubernetes.io/part-of": "fruster-registry-token-refresher",
		},
	},
});

const secret = (name: string, namespace: string): Secret => ({
	apiVersion: "v1",
	kind: "Secret",
	metadata: {
		name,
		namespace,
		labels: {
			"app.kubernetes.io/part-of": "fruster-registry-token-refresher",
		},
	},
	data: {
		REGISTRIES: base64encode("[]"),
	},
});
