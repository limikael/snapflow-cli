#!/usr/bin/env node

import yargs from "yargs/yargs";
import {hideBin} from "yargs/helpers";
import {loadSnapflowProject, snapflowProjectPrintInfo, snapflowCheckDependencyVersion} from "./snapflow-load.js";
import SnapflowProject from "./SnapflowProject.js";
import {createProjectStructureFromTemplate} from "../utils/scaffold.js";
import path from "path";
import {fileURLToPath} from 'url';
import fs from "fs";
import {serve} from '@hono/node-server';
import {Hono} from "hono";
import {buildProjectWorker} from "./snapflow-scaffold.js";
import {runCommand, getUserPrefsDir, findNodeBin} from "../utils/node-util.js";
import cron from "node-cron";
import open from "open";
import {loggableResponse} from "../utils/js-util.js";
import {loadHookRunner} from "../hooks/hook-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pkg=JSON.parse(fs.readFileSync(path.join(__dirname,"../../package.json")));

let yargsConf=yargs(hideBin(process.argv))
    .version("version","Show version.",pkg.version)
    .option("prefix",{
        default: process.cwd(),
        description: "Project dir.",
    })
    .option("port",{
        default: 3000,
        description: "Port to listen to.",
    })
    .option("query",{
        description: "Query to send when running single workflow, url encoded."
    })
    .option("url",{
        description: "Backend and api url. Should not be changed unless for debugging.",
        default: "https://snapflow.com.au"
    })
    .option("query-json",{
        description: "Query to send when running single workflow, json encoded."
    })
   .option("client",{
        description: "Specify client when creating a project."
    })
    .command("create <name>","Create new project.")
    .command("add <workflow>","Add workflow to project.")
    .command("run <workflow>","Run single workflow.")
    .command("serve","Start node server.")
    .command("serve:wrangler","Start local wrangler server.")
    .command("deploy","Deploy as CloudFlare Worker.")
    .command("info","Show project info.")
    .command("ls","List workflows.")
    .command("triggers","List workflows triggers.")
    .command("login","Login and store credentials.")
    .command("hooks","Show info about installed hooks.")
    .strict()
    .demandCommand()
    .usage("snapflow -- Workflow runner and scheduler.");

let options=yargsConf.parse();
let project;

let fn=path.join(getUserPrefsDir(),".snapflow-credentials.json");
if (fs.existsSync(fn)) {
    let data=JSON.parse(fs.readFileSync(fn,"utf8"));
    if (!data.token)
        throw new Error("No token in: "+fn);

    options.token=data.token;
}

switch (options._[0]) {
    case "hooks":
        let hookRunner=await loadHookRunner(options.prefix,{keyword: "snapflow-hook"});
        let listenersByEvent=hookRunner.getListenersByEvent();
        for (let event in listenersByEvent) {
            console.log(event+":");
            for (let listener of listenersByEvent[event])
                console.log("  - "+listener.description);

            console.log();
        }
        //await hookRunner.emit(new HookEvent("info"));
        break;

    case "login":
        let loginApp=new Hono();
        loginApp.post("*",async (c)=>{
            let query=await c.req.parseBody();
            if (!query.token)
                return new Response("got no token",{
                    status: 400
                });

            console.log("Got credentials token: "+query.token);
            let fn=path.join(getUserPrefsDir(),".snapflow-credentials.json");
            fs.writeFileSync(fn,JSON.stringify({
                token: query.token
            }));

            console.log("Stored token in: "+fn);
            setTimeout(()=>{
                process.exit();
            },0);

            return new Response("ok",{
                headers: {
                    "access-control-allow-origin": "*"
                }
            });
        });

        serve({fetch: loginApp.fetch, port: 0},async (info)=>{
            console.log(`Listening for credentials on http://localhost:${info.port}`)
            let u=new URL(options.url);
            u.searchParams.set("clilogin",info.port);
            await open(u.toString());
        })
        break;

    case "create":
        if (!options.client) {
            console.log("You need to specify the client with the --client flag.");
            process.exit(1);
        }

        let replacements={
            "$$NAME$$": options.name,
            "$$CLIENT$$": options.client,
            "$$VERSION$$": pkg.version
        };

        let srcDir=path.join(__dirname,"../res/project-template");
        await createProjectStructureFromTemplate(options.name,srcDir,replacements);
        fs.mkdirSync(path.join(options.name,"node_modules"));
        fs.symlinkSync(path.join(__dirname,"../.."),path.join(options.name,"node_modules","snapflow-cli"));
        fs.mkdirSync(path.join(options.name,"workflows"));
        console.log("Snapflow project created: "+options.name+", for client user: "+options.client);
        console.log("To create a workflow in the project: ");
        console.log("");
        console.log("  cd "+options.name);
        console.log("  snapflow add <workflow>");
        console.log("");
        break;

    case "add":
        project=await loadSnapflowProject(options);
        let workflowPath=path.join(options.prefix,"workflows",options.workflow);
        if (fs.existsSync(workflowPath))
            throw new Error("Already exists: "+workflowPath);

        fs.mkdirSync(workflowPath,{recursive: true});

        let srcWorkflow=path.join(__dirname,"../res/workflow-template/workflow.js");
        fs.copyFileSync(srcWorkflow,path.join(workflowPath,"workflow.js"))
        console.log("Workflow added: "+options.workflow);
        console.log("To run the workflow do:");
        console.log("");
        console.log("  snapflow run "+options.workflow);
        console.log("");
        break;

	case "run":
        project=await loadSnapflowProject(options);
        snapflowCheckDependencyVersion(project,pkg.version);
        let workflow=project.getWorkflow(options.workflow);
        if (!workflow) {
            console.log("No such workflow.");
            process.exit(1);
        }
        let query;
        if (options.query) {
            let searchParams=new URLSearchParams(options.query);
            query=Object.fromEntries(searchParams.entries());
        }

        if (options.queryJson) {
            query=JSON.parse(options.queryJson);
        }

		let context=await workflow.run({trigger: "run", query});

        console.log(JSON.stringify(await loggableResponse(context.getResponse()),null,2));
		break;

    case "serve":
        project=await loadSnapflowProject(options);
        snapflowCheckDependencyVersion(project,pkg.version);
        for (let expr of project.getCrons()) {
            cron.schedule(expr,()=>{
                project.triggerCron(expr);
            })
        }

        let app=new Hono();
        app.post("*",c=>{
            c.set("runtime","node");
            return project.handleHonoRequest(c)
        });

        serve({fetch: app.fetch, port: options.port},(info)=>{
            console.log(`Listening on http://localhost:${info.port}`)
        })
        break;

    case "serve:wrangler":
        project=await loadSnapflowProject(options);
        snapflowCheckDependencyVersion(project,pkg.version);
        await buildProjectWorker(project);
        await runCommand("wrangler",["dev","--test-scheduled",
            "--config",".snapflow/worker/wrangler.toml",
        ],{passthrough: true});
        break;

    case "deploy":
        await (async ()=>{
            project=await loadSnapflowProject(options);
            snapflowCheckDependencyVersion(project,pkg.version);
            let hookRunner=await loadHookRunner(options.prefix,{keyword: "snapflow-hook"});
            console.log("Running deploy hooks...");
            try {
                await hookRunner.emit("deploy",{prefix: options.prefix});
            }

            catch (e) {
                if (!e.declared)
                    throw e;

                console.log("Unable to deploy, please fix the following:");
                console.log();
                console.log("  "+e.message);
                console.log();
                process.exit(1);
            }

            console.log("Deploy hooks complete...");

            let user=await project.getUser();
            await buildProjectWorker(project);

            let env={
                ...process.env,
                CLOUDFLARE_API_TOKEN: user.cloudflare_api_token
            };

            let wranglerPath=findNodeBin(__dirname,"wrangler");
            await runCommand(wranglerPath,["deploy",
                "--config",".snapflow/worker/wrangler.toml",
            ],{passthrough: true, env: env});

            await project.printWorkflowTriggers();
        })();
        break;

    case "ls":
        project=await loadSnapflowProject(options);
        await project.printWorkflowList();
        break;

    case "triggers":
        project=await loadSnapflowProject(options);
        await project.printWorkflowTriggers();
        break;

    case "info":
        project=await loadSnapflowProject(options);
        await snapflowProjectPrintInfo(project);
        break;
}
