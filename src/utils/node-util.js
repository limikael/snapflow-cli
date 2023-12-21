import {spawn} from "child_process";
import findNodeModules from "find-node-modules";
import path from "path";
import fs from "fs";

export async function runCommand(command, args=[], options={}) {
	const child=spawn(command, args, options);
	let out="";

	await new Promise((resolve,reject)=>{
		child.stdout.on('data', (data) => {
			if (options.passthrough)
				process.stdout.write(data);

			out+=data;
		});

		child.stderr.on('data', (data) => {
			if (options.passthrough)
				process.stderr.write(data);

			else
				console.log(`stderr: ${data}`);
		});

		child.on('close', (code) => {
			if (code) {
				console.log(out);
				return reject(new Error(command+" exit code: "+code))
			}

			resolve();
		});
	});

	return out;
}

export function getUserPrefsDir() {
	return (
		process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share")
	);
}

export function findNodeDependency(cwd, name) {
	let dirs=findNodeModules({cwd: cwd, relative: false});
	for (let dir of dirs) {
		let fn=path.join(dir,name);
		if (fs.existsSync(fn))
			return fn;
	}

	throw new Error("Can't find dependency: "+name);
}	

export function findNodeBin(cwd, name) {
	let dirs=findNodeModules({cwd: cwd, relative: false});
	for (let dir of dirs) {
		let fn=path.join(dir,".bin",name);
		if (fs.existsSync(fn))
			return fn;
	}

	throw new Error("Can't find binary: "+name);
}