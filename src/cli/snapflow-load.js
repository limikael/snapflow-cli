import SnapflowProject from "./SnapflowProject.js";
import Workflow from "./Workflow.js";
import fs from "fs";
import path from "path";

export async function loadSnapflowProject({prefix, url, token}) {
	if (!fs.existsSync(path.join(prefix,"client_workflows")) ||
			!fs.existsSync(path.join(prefix,"package.json")))
		throw new Error("Not a snapflow project: "+prefix);

	let workflows=[];
	let clientDirs=fs.readdirSync(path.join(prefix,"client_workflows"))
	for (let clientDir of clientDirs) {
		let workflowDirs=fs.readdirSync(path.join(prefix,"client_workflows",clientDir));
		for (let workflowDir of workflowDirs) {
			let fn=path.join(prefix,"client_workflows",clientDir,workflowDir,"workflow.js");
			let mod=await import(fn);

			workflows.push(new Workflow({
				client: clientDir,
				name: workflowDir,
				module: mod
			}));
		}
	}

	let pkg=JSON.parse(fs.readFileSync(path.join(prefix,"package.json"),"utf8"));

	return new SnapflowProject({
		url: url,
		workflows: workflows, 
		prefix: prefix, 
		name: pkg.name,
		token: token
	});
}
