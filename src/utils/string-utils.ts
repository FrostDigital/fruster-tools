import moment from "moment";
import { printTable } from "./cli-utils";
import * as log from "../log";
import { Deployment } from "../models/Deployment";

export const matchPattern = (str: string, pattern = "") => {
	if (pattern.indexOf("*") > -1) {
		return new RegExp("^" + pattern.split("*").join(".*") + "$").test(str);
	} else {
		return str == pattern.trim();
	}
};

export const capitalize = ([first, ...rest]: string[]) => {
	return first.toUpperCase() + rest.join("").toLowerCase();
};

/**
 * @param {string} image
 */
export const parseImage = (image: string) => {
	let [imageName, imageTag] = image.split(":");

	let registry = "";
	let org = "";

	if (imageName.includes(".")) {
		const i = imageName.indexOf("/");
		registry = imageName.substring(0, i);
		imageName = imageName.replace(registry + "/", "");
	}

	if (imageName.includes("/")) {
		const [orgPart, imagePart] = imageName.split("/");
		org = orgPart;
		imageName = imagePart;
	}

	return {
		imageName,
		imageTag,
		registry,
		org,
	};
};

/**
 * @param {string} string
 */
export const isSemver = (str: string) => {
	return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/.test(
		str
	);
};

const re = /(\S*?)=(\S*)|\"(.*)\"/g;

export const parseStringConfigToObj = (str: string) => {
	str = str.trim();

	if (!str) {
		return {};
	}

	const matches = Array.from(str.matchAll(re));

	let out: any = {};

	for (let [_, key, val] of matches) {
		// Strip ""

		if (val.indexOf('"') === 0 && val.lastIndexOf('"') === val.length - 1) {
			val = val.substring(1, val.length - 1);
		}

		out[key] = val;
	}

	return out;
};

export function prettyPrintPods(pods: any[]) {
	const podInfo = pods.map((pod: any, i: number) => {
		const [lastContainerStatus] = pod.status.containerStatuses || [];
		const { imageName, imageTag } = parseImage(pod.spec.containers[0].image);

		let containerStatusDescription = " ";
		let since = " ";

		if (!lastContainerStatus) {
			return [
				`Pod ${++i}:`,
				pod.metadata.name,
				imageTag,
				`${pod.status.phase}`,
				since,
				containerStatusDescription,
			];
		}

		const { state } = lastContainerStatus;

		if (state.waiting && ["ImagePullBackOff", "ErrImagePull"].includes(state.waiting.reason)) {
			containerStatusDescription = `Failed to pull image ${imageName}:${imageTag}`;
		} else if (state.running) {
			containerStatusDescription = `✅`;

			since = moment(state.running.startedAt).fromNow().replace("minutes", "min");
		} else if (state.terminated) {
			containerStatusDescription = `💥`;

			since = moment(state.terminated.startedAt).fromNow().replace("minutes", "min");
		} else {
			containerStatusDescription = JSON.stringify(state);
		}

		return [`Pod ${++i}:`, pod.metadata.name, imageTag, `${pod.status.phase}`, since, containerStatusDescription];
	});

	if (podInfo.length) {
		printTable(podInfo);
	} else {
		log.warn("App has no pods");
	}
}

export function ensureLength(str: string | undefined, length: number) {
	str = str || "";
	if (str.length > length) {
		return str.substring(0, length);
	}

	const padLength = length - str.length;

	return str + new Array(padLength).fill(" ").join("");
}

export function base64decode(str: string) {
	return Buffer.from(str, "base64").toString("ascii");
}

export function base64encode(str: string) {
	return Buffer.from(str).toString("base64");
}

const awsRegionRe = /^[a-z]{2}-[a-z]{2,10}-\d/;
const awsAccessKeyIdRe = /(^|[^A-Z0-9])[A-Z0-9]{20}(?![A-Z0-9])/;
const awsSecretAccessKeyRe = /(^|[^A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/;

export function validateAwsRegionFormat(str: string) {
	return awsRegionRe.test(str);
}

export function validateAwsAccessKeyIdFormat(str: string) {
	return awsAccessKeyIdRe.test(str);
}

export function validateAwsSecretAccessKeyFormat(str: string) {
	return awsSecretAccessKeyRe.test(str);
}

const memResourceRe = /^$|^\d{1,10}[M|Mi|Gi]{1,2}/;
const cpuResourceRe = /^$|^[\d|\.]{1,4}[m]{0,1}/;

export function validateMemoryResource(str: string) {
	return memResourceRe.test(str);
}

export function validateCpuResource(str: string) {
	return cpuResourceRe.test(str);
}

export function maskStr(str: string) {
	return str.replace(/./g, "*");
}

const PRIVATE_REG_REGEXP = /(.*.com)\/.*/;

export function getDockerRegistry(fullImageUrl: string) {
	const res = fullImageUrl.match(PRIVATE_REG_REGEXP);

	if (res) {
		return res[1];
	}

	return undefined;
}
