import {readdir} from "fs/promises";
import fs from "fs";
import path from "path";

async function getFiles(dir) {
	const dirents = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(dirents.map((dirent) => {
		const res = path.resolve(dir, dirent.name);
		return dirent.isDirectory() ? getFiles(res) : res;
	}));
	return Array.prototype.concat(...files);
}

export async function createProjectStructureFromTemplate(targetDir, sourceDir, replacements) {
	if (fs.existsSync(targetDir))
		throw new Error("Exists already: "+targetDir);

	fs.mkdirSync(targetDir,{recursive: true});
	let files=await getFiles(sourceDir);

	for (let file of files) {
		let relativeFile=path.relative(sourceDir,file);

		fs.mkdirSync(path.join(targetDir,path.dirname(relativeFile)),{recursive: true});

		let content=fs.readFileSync(file,"utf8");
		for (let k in replacements)
			content=content.replaceAll(k,replacements[k]);

		fs.writeFileSync(path.join(targetDir,relativeFile),content);
	}
}
