import { getPods } from "../kube/kube-client";
import * as log from "../log";
import { getLogs as kubeGetLogs } from "../kube/kube-client";
import chalk from "chalk";

export async function getLogs(serviceName: string, namespace: string, { lines }: { lines?: number } = {}) {
	const pods = await getPods(namespace, serviceName);
	let podName;

	for (const p of pods) {
		podName = p.metadata.name;
		const logLines = await kubeGetLogs(namespace, podName, lines || 10);
		log.info(chalk.dim(`Log for ${podName}`));
		console.log(logLines);
	}
}
