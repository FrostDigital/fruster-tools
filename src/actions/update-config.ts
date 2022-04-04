import { getDeployment, updateDeployment } from "../kube/kube-client";
import { CHANGE_CAUSE_ANNOTATION } from "../kube/kube-constants";
import { Deployment } from "../models/Deployment";
import { getDeploymentAppConfig, getDeploymentContainerEnv, updateDeploymentContainerEnv } from "../utils/kube-utils";

export async function updateConfig({
	serviceName,
	namespace,
	set,
	add,
	unset,
	deployment,
	saveChanges = true,
}: {
	serviceName?: string;
	namespace?: string;
	deployment?: Deployment | null;
	set?: { [key: string]: string };
	add?: { [key: string]: string };
	unset?: string[];
	saveChanges?: boolean;
}) {
	if (!deployment && !(namespace && serviceName)) {
		throw new Error("Either deployment or namespace AND serviceName needs to be provided");
	}

	namespace = namespace || deployment?.metadata?.namespace;
	serviceName = serviceName || deployment?.metadata?.name;

	deployment = deployment ? deployment : await getDeployment(namespace!, serviceName!);

	if (!deployment) {
		return;
	}

	deployment.metadata = deployment.metadata || {};

	const { requiredConfig } = await getDeploymentAppConfig(deployment);

	if (set) {
		(deployment.metadata.annotations || {})[CHANGE_CAUSE_ANNOTATION] = `Config was updated`;
		updateDeploymentContainerEnv(deployment, [...requiredConfig, ...objToConfigRows(set)]);
	} else if (add) {
		const envToAdd = objToConfigRows(add);
		const envToAddNames = envToAdd.map((e) => e.name);
		const existingEnvToKeep = getDeploymentContainerEnv(deployment).filter((e) => !envToAddNames.includes(e.name));

		updateDeploymentContainerEnv(deployment, [...requiredConfig, ...existingEnvToKeep, ...envToAdd]);
	}

	if (unset) {
		const updatedEnv = getDeploymentContainerEnv(deployment).filter((val) => !unset.includes(val.name));

		updateDeploymentContainerEnv(deployment, updatedEnv);
	}

	if (saveChanges) {
		await updateDeployment(namespace!, serviceName!, deployment);
	}

	return getDeploymentContainerEnv(deployment);
}

export function objToConfigRows(o: { [x: string]: string }) {
	return Object.keys(o).map((k) => ({
		name: k,
		value: o[k] + "",
	}));
}

export function configRowsToObj(rows: { name: string; value?: string }[]) {
	return rows.reduce<{ [x: string]: string }>((out, curr) => {
		out[curr.name] = curr.value + "";
		return out;
	}, {});
}
