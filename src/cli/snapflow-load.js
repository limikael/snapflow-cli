import SnapflowProject from "./SnapflowProject.js";
import Workflow from "./Workflow.js";
import fs from "fs";
import path from "path";

export async function loadSnapflowProject({prefix, url, token}) {
	if (!fs.existsSync(path.join(prefix,"workflows")))
		throw new Error("Not a snapflow project: "+prefix+", expected folder 'workflows'.");

	if (!fs.existsSync(path.join(prefix,"package.json")))
		throw new Error("Not a snapflow project: "+prefix+", expected package.json");

	let pkg=JSON.parse(fs.readFileSync(path.join(prefix,"package.json"),"utf8"));
	if (!pkg.snapflow || !pkg.snapflow.client)
		throw new Error("Not a snapflow project: "+prefix+", expected snapflow.client in package.json");

	let workflows=[];
	let workflowDirs=fs.readdirSync(path.join(prefix,"workflows"))
	for (let workflowDir of workflowDirs) {
		let fn=path.join(prefix,"workflows",workflowDir,"workflow.js");
		let mod=await import(fn);

		workflows.push(new Workflow({
			name: workflowDir,
			module: mod
		}));
	}

	return new SnapflowProject({
		url: url,
		workflows: workflows, 
		prefix: prefix, 
		name: pkg.name,
		token: token,
		client: pkg.snapflow.client
	});
}
