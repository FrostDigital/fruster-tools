import { getPods } from "../kube/kube-client";
import enquirer from "enquirer";
import moment from "moment";
import * as k8s from "@kubernetes/client-node";
import { pressEnterToContinue } from "../utils/cli-utils";
const stream = require("stream");

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const log = new k8s.Log(kc);
const logStream = new stream.PassThrough();

logStream.on("data", (chunk: any) => {
	// use write rather than console.log to prevent double line feed
	process.stdout.write(chunk);
});

export async function followLogs(namespace: string, appName: string) {
	const pods = await getPods(namespace, appName);

	const choices = pods.flatMap((pod) => {
		let status: string | undefined = "Unknown status";
		let age = "? s";

		if (pod.status) {
			status = pod.status.phase;
			age = moment(pod.status.startTime).fromNow();
		}

		return (pod.spec?.containers || []).map((ctn) => ({
			value: pod.metadata?.name + "." + ctn.name,
			name: `${pod.metadata?.name} (${status}, ${age})`,
		}));
	});

	if (choices.length === 1) {
		return streamPodLog(namespace, choices[0].value);
	} else if (choices.length > 1) {
		const { podName } = await enquirer.prompt<{ podName: string }>([
			{
				type: "select",
				name: "podName",
				choices,
				message: "Select pod",
			},
		]);

		return streamPodLog(namespace, podName);
	} else {
		console.log(`Found no pod for app ${appName} in namespace ${namespace}`);
	}
}

async function streamPodLog(namespace: string, podName: string) {
	const [pod, container] = podName.split(".");

	try {
		const req = await log.log(namespace, pod, container, logStream, () => {}, {
			follow: true,
			tailLines: 200,
			pretty: false,
			timestamps: true,
		});

		await pressEnterToContinue("");

		req.abort();
	} catch (err) {
		console.error("Failed to read logs", err);
	}
}
