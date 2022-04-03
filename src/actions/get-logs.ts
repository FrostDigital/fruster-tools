import { getPods } from "../kube/kube-client";
import * as log from "../log";
import { getLogs as kubeGetLogs } from "../kube/kube-client";
import chalk from "chalk";
import { getNameAndNamespaceOrThrow } from "../utils/kube-utils";

export async function getLogs(serviceName: string, namespace: string, { lines }: { lines?: number } = {}) {
	const pods = await getPods(namespace, serviceName);
	let podName;

	for (const p of pods) {
		const { name } = getNameAndNamespaceOrThrow(p);
		const logLines = await kubeGetLogs(namespace, name, lines || 10);
		log.info(chalk.dim(`Log for ${podName}`));
		console.log(logLines);
	}
}
