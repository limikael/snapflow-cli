import SnapflowProject from "./SnapflowProject.js";
import Workflow from "./Workflow.js";
import fs from "fs";
import path from "path";
import {Table} from "console-table-printer";
import chalk from "chalk";
import {findNodeDependency} from "../utils/node-util.js";

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
		if (workflowDir.charAt(0).match(/[A-Za-z0-9]/)) {
			let fn=path.join(prefix,"workflows",workflowDir,"workflow.js");
			let mod=await import(fn);

			workflows.push(new Workflow({
				name: workflowDir,
				module: mod
			}));
		}
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

export function snapflowProjectGetDependencyVersion(project) {
	let snapflowDepDir=findNodeDependency(project.prefix,"snapflow-cli");
	let pkgJson=fs.readFileSync(path.join(snapflowDepDir,"package.json"),"utf8");
	let pkg=JSON.parse(pkgJson);

	return pkg.version;
}

export function snapflowCheckDependencyVersion(project, expected) {
	let projectDepVersion=snapflowProjectGetDependencyVersion(project);

	if (expected!=projectDepVersion)
		throw new Error("The Snapflow CLI tool is version "+expected+
			", but the snapflow-cli depencendy in the project is version "+projectDepVersion+
			", to avoid problems, please make sure they are the same.");
}

export async function snapflowProjectPrintInfo(project) {
	let t=new Table({
		columns: [
			{name: "key", alignment: "left", color: "white_bold", title: chalk.white("name") },
			{name: "value", alignment: "left", title: chalk.reset.dim(project.name) },
		]
	});

    let user=await project.rpc.getUserInfo();

	t.addRow({key: "client", value: project.client});
	t.addRow({key: "user", value: user.name});
	t.addRow({key: "snapflow version", value: snapflowProjectGetDependencyVersion(project)});

	t.addRow({key: "worker url", value: await project.getWorkerUrl()});

	let scriptInfo=await project.getScriptInfo();
	let deployedString;
	if (scriptInfo)
		deployedString=scriptInfo.modified_on;

	else
		deployedString="no";

	t.addRow({key: "deployed", value: deployedString});

	let logs=await project.getLogs();
	t.addRow({key: "invocations", value: logs.length});
	t.addRow({key: "errors", value: logs.filter(l=>l.status!="success").length});

	t.printTable();
}