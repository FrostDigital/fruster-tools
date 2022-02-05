export interface Namespace {
	metadata: {
		name: string;
		labels: { [x: string]: string }[];
	};
	spec: any;
	status: any;
}
