import {createProjectStructureFromTemplate} from "../utils/scaffold.js";
import {fileURLToPath} from 'url';
import fs from "fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildProjectWorker(project) {
	let workflowList=project.workflows.map(workflow=>{
		return `{
			client: ${JSON.stringify(workflow.client)},
			name: ${JSON.stringify(workflow.name)},
			module: await import("../../client_workflows/${workflow.client}/${workflow.name}/workflow.js"),
		}`
	});

	let spec={
		token: project.token,
		url: project.url
	};

	let replacemets={
		"$$PROJECT_SPEC$$": JSON.stringify(spec),
		"$$WORKFLOW_LIST$$": workflowList.join(","),
		"$$PROJECT_NAME$$": project.name,
		"$$CRON_TRIGGERS$$": JSON.stringify(project.getCrons())
	}

	let targetDir=path.join(project.prefix,".snapflow/worker");
	let stubDir=path.join(__dirname,"../res/worker-stub");
	fs.rmSync(targetDir,{recursive: true, force: true});
	createProjectStructureFromTemplate(targetDir,stubDir,replacemets);
}