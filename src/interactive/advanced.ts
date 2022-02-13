import enquirer from "enquirer";
import {
	createClusterRole,
	createClusterRoleBinding,
	createDeployment,
	createNamespace,
	createRole,
	createRoleBinding,
	createSecret,
	createService,
	createServiceAccount,
	deleteClusterRole,
	deleteClusterRoleBinding,
	deleteDeployment,
	deleteRole,
	deleteRoleBinding,
	deleteSecret,
	deleteService,
	deleteServiceAccount,
	getDeployment,
	patchDeployment,
} from "../kube/kube-client";
import { confirmPrompt, formPrompt, sleep } from "../utils/cli-utils";
import { backChoice, lockEsc, popScreen, pushScreen, separator } from "./engine";
import { installTokenRefresher } from "./install-token-refresher";
import routerService from "../router/router-svc.json";
import routerDeployment from "../router/router-deployment.json";
import routerClusterRole from "../router/router-clusterrole.json";
import routerClusterRoleBinding from "../router/router-clusterrolebinding.json";
import routerRole from "../router/router-role.json";
import routerRoleBinding from "../router/router-rolebinding.json";
import routerSecret from "../router/router-secret-dhparam.json";
import routerServiceAccount from "../router/router-serviceaccount.json";
import { ensureLength } from "../utils";
import chalk from "chalk";
import { Deployment } from "../models/Deployment";

const ROUTER_NAMESPACE = "deis";
const ROUTER_DEPLOYMENT_NAME = "deis-router";
const ROUTER_BODY_SIZE_ANNOTATION = "router.deis.io/nginx.bodySize";
// https://github.com/teamhephy/router#body-size
const ROUTER_ENFORCE_SSL_ANNOTATION = "router.deis.io/nginx.ssl.enforce";
const ROUTER_USE_PROXY_PROTOCOL_ANNOTATION = "router.deis.io/nginx.useProxyProtocol";

export async function advanced() {
	const { item } = await enquirer.prompt<{ item: string }>([
		{
			type: "select",
			name: "item",
			message: `Advanced`,
			choices: [
				separator,
				// { message: "Diagnose cluster", name: "diagnoseCluster" },
				{ message: "Install token refresher", name: "installTokenRefresher" },
				{ message: "Manage router", name: "manageRouter" },
				separator,
				backChoice,
			],
		},
	]);

	if (item === "installTokenRefresher") pushScreen({ render: installTokenRefresher });
	else if (item === "manageRouter") pushScreen({ escAction: "back", render: manageRouter });
	else if (item === "back") popScreen();
}

async function manageRouter() {
	console.log();
	console.log(`This will install deis router onto the cluster`);
	console.log();

	const existingRouterDeployment = await getDeployment(ROUTER_NAMESPACE, ROUTER_DEPLOYMENT_NAME);

	if (existingRouterDeployment) {
		console.log("✅ Router is installed");
	} else {
		console.log("🚫 Router is NOT installed");
	}
	console.log();

	const { action } = await enquirer.prompt<{ action: string }>([
		{
			type: "select",
			name: "action",
			message: `Manage router`,
			choices: [
				separator,
				{ message: "Install router", name: "installRouter", disabled: !!existingRouterDeployment },
				{ message: "Uninstall router", name: "uninstallRouter", disabled: !existingRouterDeployment },
				separator,
				{
					message: "Router settings",
					name: "routerSettings",
					disabled: !existingRouterDeployment,
				},
				{ message: "SSL certificates", name: "ssl" },
				separator,
				backChoice,
			],
		},
	]);

	if (action === "uninstallRouter") {
		pushScreen({
			render: uninstallRouter,
			escAction: "back",
		});
	} else if (action === "installRouter") {
		pushScreen({
			render: installRouter,
			escAction: "back",
		});
	} else if (action === "routerSettings") {
		pushScreen({
			render: routerSettings,
			props: existingRouterDeployment,
			escAction: "back",
		});
	} else {
		popScreen();
	}
}

async function installRouter() {
	if (await confirmPrompt("This will install the router onto the cluster, do you want to continue?")) {
		await createNamespace(ROUTER_NAMESPACE); // Ensure that namespace exists, will only be created if non existing
		await createServiceAccount(ROUTER_NAMESPACE, routerServiceAccount);
		await createRole(ROUTER_NAMESPACE, routerRole);
		await createRoleBinding(ROUTER_NAMESPACE, routerRoleBinding);
		await createClusterRole(routerClusterRole);
		await createClusterRoleBinding(routerClusterRoleBinding);
		await createSecret(ROUTER_NAMESPACE, routerSecret);
		await createDeployment(ROUTER_NAMESPACE, routerDeployment);
		await createService(ROUTER_NAMESPACE, routerService);

		await sleep(2000);

		console.log("✅ Successfully created router resources");
		console.log(
			"It might take some time until the cloud providers load balancer has been provisioned, but all looks good so far 👍"
		);
		await sleep(2000);
	}

	popScreen();
}

async function uninstallRouter() {
	if (await confirmPrompt("WARNING: Are you sure you want to uninstall the router?")) {
		lockEsc();

		console.log("Deleting Deployment...", ROUTER_NAMESPACE, ROUTER_DEPLOYMENT_NAME);
		await deleteDeployment(ROUTER_NAMESPACE, ROUTER_DEPLOYMENT_NAME);

		console.log("Deleting Secret...", ROUTER_NAMESPACE, "deis-router-dhparam");
		await deleteSecret(ROUTER_NAMESPACE, "deis-router-dhparam");

		console.log("Deleting Service...", ROUTER_NAMESPACE, "deis-router");
		await deleteService(ROUTER_NAMESPACE, "deis-router");

		console.log("Deleting ClusterRole...", "deis:deis-router");
		await deleteClusterRole("deis:deis-router");

		console.log("Deleting ClusterRoleBinding...", "deis:deis-router");
		await deleteClusterRoleBinding("deis:deis-router");

		console.log("Deleting Role...", "deis-router");
		await deleteRole(ROUTER_NAMESPACE, "deis-router");

		console.log("Deleting RoleBinding...", "deis-router");
		await deleteRoleBinding(ROUTER_NAMESPACE, "deis-router");

		console.log("Deleting ServiceAccount...", ROUTER_NAMESPACE, "deis-router");
		await deleteServiceAccount(ROUTER_NAMESPACE, "deis-router");

		console.log("👋 Router has been removed");

		await sleep(2000);
	}
	popScreen();
}

async function routerSettings(deployment: Deployment) {
	const updatedAnnotations = await formPrompt<{
		[ROUTER_BODY_SIZE_ANNOTATION]: string;
		[ROUTER_ENFORCE_SSL_ANNOTATION]: string;
		[ROUTER_USE_PROXY_PROTOCOL_ANNOTATION]: string;
	}>({
		message: "Tune router settings",
		choices: [
			{
				message: "Max body size",
				name: ROUTER_BODY_SIZE_ANNOTATION,
				initial: deployment.metadata.annotations![ROUTER_BODY_SIZE_ANNOTATION],
			},
			{
				message: "Enforce SSL",
				name: ROUTER_ENFORCE_SSL_ANNOTATION,
				initial: deployment.metadata.annotations![ROUTER_ENFORCE_SSL_ANNOTATION] || "false",
			},
			{
				message: "Use proxy protocol",
				name: ROUTER_USE_PROXY_PROTOCOL_ANNOTATION,
				initial: deployment.metadata.annotations![ROUTER_USE_PROXY_PROTOCOL_ANNOTATION] || "false",
			},
		],
	});

	console.log("Updating annotations:");
	console.log(JSON.stringify(updatedAnnotations, null, 2));

	await patchDeployment(ROUTER_NAMESPACE, "deis-router", {
		body: {
			metadata: {
				annotations: updatedAnnotations,
			},
		},
	});

	console.log("✅ Settings was updated");

	await sleep(2000);

	popScreen();
}
