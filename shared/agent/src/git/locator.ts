"use strict";
import * as paths from "path";
import { findExecutable, runCommand } from "./shell";

export interface GitLocation {
	path: string;
	version: string;
	isWsl: boolean;
	wslDistro?: string;
}

function parseVersion(raw: string): string {
	return raw.replace(/^git version /, "");
}

const wslRegex = /\\\\wsl\$\\(.+?)\\.+/;

async function findSpecificGit(path: string): Promise<GitLocation> {
	let isWsl = false;
	let wslDistro;
	let version = "";

	const wslMatch = wslRegex.exec(path);
	if (wslMatch) {
		wslDistro = wslMatch[1];
		path = findExecutable("wsl", []).cmd;
		version = await runCommand(path, ["-d", wslDistro, "git", "--version"]);
		isWsl = true;
	} else {
		version = await runCommand(path, ["--version"]);
		if (!path || path === "git") {
			// If needed, let's update our path to avoid the search on every command
			path = findExecutable(path, ["--version"]).cmd;
		}
	}

	return {
		path,
		version: parseVersion(version.trim()),
		isWsl,
		wslDistro
	};
}

async function findGitDarwin(): Promise<GitLocation> {
	try {
		let path = await runCommand("which", ["git"]);
		path = path.replace(/^\s+|\s+$/g, "");

		if (path !== "/usr/bin/git") {
			return findSpecificGit(path);
		}

		try {
			await runCommand("xcode-select", ["-p"]);
			return findSpecificGit(path);
		} catch (ex) {
			if (ex.code === 2) {
				return Promise.reject(new Error("Unable to find git"));
			}
			return findSpecificGit(path);
		}
	} catch (ex) {
		return Promise.reject(new Error("Unable to find git"));
	}
}

function findSystemGitWin32(basePath: string): Promise<GitLocation> {
	if (!basePath) return Promise.reject(new Error("Unable to find git"));
	return findSpecificGit(paths.join(basePath, "Git", "cmd", "git.exe"));
}

function findGitWin32(): Promise<GitLocation> {
	return findSystemGitWin32(process.env["ProgramW6432"]!)
		.then(null, () => findSystemGitWin32(process.env["ProgramFiles(x86)"]!))
		.then(null, () => findSystemGitWin32(process.env["ProgramFiles"]!))
		.then(null, () => findSpecificGit("git"));
}

export async function findGitPath(path?: string): Promise<GitLocation> {
	try {
		return await findSpecificGit(path || "git");
	} catch (ex) {
		try {
			switch (process.platform) {
				case "darwin":
					return await findGitDarwin();
				case "win32":
					return await findGitWin32();
				default:
					return Promise.reject(new Error("Unable to find git"));
			}
		} catch (ex) {
			return Promise.reject(new Error("Unable to find git"));
		}
	}
}
