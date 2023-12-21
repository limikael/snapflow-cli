import path from "path";
import findNodeModules from "find-node-modules";
import fs from "fs";
import HookRunner from "./HookRunner.js";

async function importDir(packageDir) {
	let packageJsonPath=path.join(packageDir,"package.json");
	let pkgJson=fs.readFileSync(packageJsonPath);
	let pkg=JSON.parse(pkgJson);

	if (pkg.type!="module")
		throw new Error("Not a module");

	let mainFn=path.join(packageDir,pkg.main);
	return await import(mainFn);
}

export async function loadHookRunner(cwd, options={}) {
	if (!options.keyword)
		throw new Error("Keyword needs to be specified.");

	let hookRunner=new HookRunner();

	let dirs=findNodeModules({cwd: cwd, relative: false});
	for (let dir of dirs) {
		let subdirs=fs.readdirSync(dir)
		for (let subdir of subdirs) {
			let packageDir=path.join(dir,subdir);
			let packageJsonPath=path.join(packageDir,"package.json");
			if (fs.existsSync(packageJsonPath)) {
				let pkgJson=fs.readFileSync(packageJsonPath);
				let pkg=JSON.parse(pkgJson);

				if (pkg.keywords && pkg.keywords.includes(options.keyword)) {
					let mod=await importDir(packageDir);
					mod.registerHooks(hookRunner);
				}
			}
		}
	}

	return hookRunner;
}