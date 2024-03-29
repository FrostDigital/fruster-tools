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
	getSecret,
	patchDeployment,
	updateSecret,
} from "../kube/kube-client";
import { Deployment } from "../models/Deployment";
import routerClusterRole from "../router/router-clusterrole.json";
import routerClusterRoleBinding from "../router/router-clusterrolebinding.json";
import routerDeployment from "../router/router-deployment.json";
import routerRole from "../router/router-role.json";
import routerRoleBinding from "../router/router-rolebinding.json";
import routerSecret from "../router/router-secret-dhparam.json";
import routerServiceAccount from "../router/router-serviceaccount.json";
import routerService from "../router/router-svc.json";
import { base64decode, base64encode } from "../utils";
import { confirmPrompt, formPrompt, openEditor, sleep } from "../utils/cli-utils";
import { backChoice, lockEsc, popScreen, pushScreen, resetScreen, separator } from "./engine";
import { installTokenRefresher } from "./install-token-refresher";
import { Secret } from "../models/Secret";

const ROUTER_NAMESPACE = "deis";
const ROUTER_DEPLOYMENT_NAME = "deis-router";
// https://github.com/teamhephy/router#body-size
const ROUTER_BODY_SIZE_ANNOTATION = "router.deis.io/nginx.bodySize";
const ROUTER_ENFORCE_SSL_ANNOTATION = "router.deis.io/nginx.ssl.enforce";
// https://github.com/teamhephy/router#use-proxy-protocol
// const ROUTER_USE_PROXY_PROTOCOL_ANNOTATION = "router.deis.io/nginx.useProxyProtocol";

// TODO: Add support for this annotation on service
const ROUTER_SERVICE_PROXY_PROTOCOL_ANNOTATION = "service.beta.kubernetes.io/aws-load-balancer-proxy-protocol";

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
				{ message: "Router platform SSL", name: "ssl" },
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
	} else if (action === "ssl") {
		pushScreen({
			render: sslSettings,
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
		// [ROUTER_USE_PROXY_PROTOCOL_ANNOTATION]: string;
	}>({
		message: "Tune router settings",
		choices: [
			{
				message: "Max body size",
				name: ROUTER_BODY_SIZE_ANNOTATION,
				initial: deployment.metadata?.annotations![ROUTER_BODY_SIZE_ANNOTATION],
			},
			{
				message: "Enforce SSL",
				name: ROUTER_ENFORCE_SSL_ANNOTATION,
				initial: deployment.metadata?.annotations![ROUTER_ENFORCE_SSL_ANNOTATION] || "false",
			},
			// {
			// 	message: "Use proxy protocol",
			// 	name: ROUTER_USE_PROXY_PROTOCOL_ANNOTATION,
			// 	initial: deployment.metadata?.annotations![ROUTER_USE_PROXY_PROTOCOL_ANNOTATION] || "false",
			// },
		],
	});

	console.log("Updating annotations:");
	console.log(JSON.stringify(updatedAnnotations, null, 2));

	await patchDeployment(ROUTER_NAMESPACE, "deis-router", {
		metadata: {
			annotations: updatedAnnotations,
		},
	});

	console.log("✅ Settings was updated");

	await sleep(2000);

	popScreen();
}

const PLATFORM_SSL_SECRET_NAME = "deis-router-platform-cert";
const CERT_PLACEHOLDER = `-----BEGIN CERTIFICATE-----
/ * your SSL certificate here */
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
/* any intermediate certificates */
-----END CERTIFICATE-----`;

const KEY_PLACEHOLDER = `-----BEGIN RSA PRIVATE KEY-----
/* your unencrypted private key here */
-----END RSA PRIVATE KEY-----`;

async function sslSettings() {
	// https://docs.teamhephy.com/managing-workflow/platform-ssl/#installing-ssl-on-the-deis-router

	let secret = await getSecret("deis", PLATFORM_SSL_SECRET_NAME);

	if (!secret) {
		console.log();
		console.log("Attach a wildcard SSL cert which matches the platfrom domain.");
		console.log("IMPORTANT: This should not be used if SSL is terminated at load balancer.");
		console.log();

		if (!(await confirmPrompt("Do you want to enable platform SSL?", false))) {
			return popScreen();
		}

		// @ts-ignore I am lazy
		secret = await createSecret("deis", platformSslSecret);

		if (!secret) {
			throw new Error("Failed to create platform secret");
		}
	}

	secret.data = secret?.data || {};

	const existingCert = secret ? base64decode(secret.data["tls.crt"]) : CERT_PLACEHOLDER;
	const existingKey = secret ? base64decode(secret.data["tls.key"]) : KEY_PLACEHOLDER;

	const { action } = await enquirer.prompt<{ action: string }>([
		{
			type: "select",
			name: "action",
			message: `Router SSL`,
			choices: [
				separator,
				{ message: "Edit cert", name: "editCert" },
				{ message: "Edit key", name: "editKey" },
				separator,
				backChoice,
			],
		},
	]);

	if (action === "editCert") {
		let updatedCert;

		try {
			updatedCert = await openEditor({
				initialContent: existingCert,
				guidance: "",
			});
		} catch (err) {}

		if (updatedCert) {
			await updateSecret("deis", PLATFORM_SSL_SECRET_NAME, {
				...platformSslSecret,
				data: {
					"tls.crt": base64encode(updatedCert),
					"tls.key": base64encode(existingKey),
				},
			});
		}

		resetScreen();
	} else if (action === "editKey") {
		let updatedKey = "";
		try {
			updatedKey = await openEditor({
				initialContent: existingKey,
				guidance: "",
			});
		} catch (err) {}

		if (updatedKey) {
			await updateSecret("deis", PLATFORM_SSL_SECRET_NAME, {
				...platformSslSecret,
				data: {
					"tls.crt": base64encode(existingCert),
					"tls.key": base64encode(updatedKey),
				},
			});
		}

		resetScreen();
	} else {
		popScreen();
	}
}

const platformSslSecret: Secret = {
	apiVersion: "v1",
	kind: "Secret",
	metadata: {
		name: PLATFORM_SSL_SECRET_NAME,
		namespace: "deis",
	},
	type: "Opaque",
	data: {
		"tls.crt": "",
		"tls.key": "",
	},
};
