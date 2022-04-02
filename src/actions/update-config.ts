import { getDeployment, updateDeployment } from "../kube/kube-client";
import { CHANGE_CAUSE_ANNOTATION } from "../kube/kube-constants";
import { Deployment } from "../models/Deployment";
import { getDeploymentAppConfig } from "../utils/kube-utils";

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

	namespace = namespace || deployment?.metadata.namespace;
	serviceName = serviceName || deployment?.metadata.name;

	deployment = deployment ? deployment : await getDeployment(namespace!, serviceName!);

	if (!deployment) {
		return;
	}

	const { requiredConfig } = getDeploymentAppConfig(deployment);

	if (set) {
		(deployment.metadata.annotations || {})[CHANGE_CAUSE_ANNOTATION] = `Config was updated`;
		deployment.spec.template.spec.containers[0].env = [...requiredConfig, ...objToRows(set)];
	} else if (add) {
		const envToAdd = objToRows(add);
		const envToAddNames = envToAdd.map((e) => e.name);

		deployment.spec.template.spec.containers[0].env = deployment.spec.template.spec.containers[0].env.filter(
			(e) => !envToAddNames.includes(e.name)
		);

		deployment.spec.template.spec.containers[0].env = [...requiredConfig, ...envToAdd];
	}

	if (unset) {
		deployment.spec.template.spec.containers[0].env = deployment.spec.template.spec.containers[0].env.filter(
			(val) => !unset.includes(val.name)
		);
	}

	if (saveChanges) {
		await updateDeployment(namespace!, serviceName!, deployment);
	}

	return deployment.spec.template.spec.containers[0].env;
}

function objToRows(o: { [x: string]: string }) {
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
