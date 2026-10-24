/**
 * Codebase TODOs Extension
 *
 * Provides a /find-todos command to search for TODO, FIXME, XXX, HACK, and NOTE
 * comments in the codebase without leaving the pi terminal.
 *
 * Usage:
 * 1. Copy this file to ~/.pi/agent/extensions/ or your project's .pi/extensions/
 * 2. Use /find-todos to see all TODO comments in the codebase
 * 3. Use /find-todos <pattern> to filter results (e.g., /find-todos authentication)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "child_process";
import path from "path";

interface TodoMatch {
	file: string;
	line: number;
	text: string;
	type: string;
}

export default function codebaseTodosExtension(pi: ExtensionAPI) {
	pi.registerCommand("find-todos", {
		description: "Search for TODO/FIXME/XXX/HACK/NOTE comments in the codebase",
		handler: async (args, ctx) => {
			const filterPattern = args.trim();

			// Build the search pattern for TODO-style comments
			// Matches: TODO, FIXME, XXX, HACK, NOTE (case-insensitive)
			const todoPattern = "(TODO|FIXME|XXX|HACK|NOTE):?";

			try {
				// Use ripgrep to search for TODO comments
				const rgArgs = [
					"--no-heading", // Don't group by file
					"--line-number", // Show line numbers
					"--color=never", // No color codes
					"--case-insensitive", // Case-insensitive search
					"--no-config", // Don't use user config
					todoPattern,
				];

				// If a filter pattern is provided, search for lines that contain both
				// the TODO keyword and the filter pattern
				if (filterPattern) {
					// Use ripgrep's ability to filter by additional pattern
					rgArgs.push("--", ".");
				} else {
					rgArgs.push("--", ".");
				}

				const matches: TodoMatch[] = [];
				let errorOutput = "";

				const rg = spawn("rg", rgArgs, {
					cwd: ctx.cwd,
					stdio: ["ignore", "pipe", "pipe"],
				});

				// Collect stdout
				rg.stdout.on("data", (data: Buffer) => {
					const lines = data.toString().split("\n");
					for (const line of lines) {
						if (!line.trim()) continue;

						// Parse ripgrep output: file:line:text
						const match = line.match(/^([^:]+):(\d+):(.*)$/);
						if (match) {
							const [, file, lineNum, text] = match;
							const trimmedText = text.trim();

							// If filter pattern is provided, check if it matches
							if (filterPattern && !trimmedText.toLowerCase().includes(filterPattern.toLowerCase())) {
								continue;
							}

							// Extract the TODO type
							const typeMatch = trimmedText.match(/\b(TODO|FIXME|XXX|HACK|NOTE)\b/i);
							const type = typeMatch ? typeMatch[1].toUpperCase() : "TODO";

							matches.push({
								file,
								line: Number.parseInt(lineNum, 10),
								text: trimmedText,
								type,
							});
						}
					}
				});

				// Collect stderr
				rg.stderr.on("data", (data: Buffer) => {
					errorOutput += data.toString();
				});

				// Wait for process to complete
				await new Promise<void>((resolve, reject) => {
					rg.on("close", (code) => {
						// ripgrep returns 1 when no matches found, which is not an error
						if (code === 0 || code === 1) {
							resolve();
						} else if (code === 127) {
							reject(new Error("ripgrep (rg) not found. Please install ripgrep to use this command."));
						} else {
							reject(new Error(`ripgrep exited with code ${code}: ${errorOutput}`));
						}
					});
					rg.on("error", (err) => {
						if (err.message.includes("ENOENT")) {
							reject(new Error("ripgrep (rg) not found. Please install ripgrep to use this command."));
						} else {
							reject(new Error(`Failed to spawn ripgrep: ${err.message}`));
						}
					});
				});

				// Display results
				if (matches.length === 0) {
					const message = filterPattern
						? `No TODO comments found matching "${filterPattern}"`
						: "No TODO comments found in the codebase";
					ctx.ui.notify(message, "info");
					return;
				}

				// Group by type
				const byType: Record<string, TodoMatch[]> = {};
				for (const match of matches) {
					if (!byType[match.type]) {
						byType[match.type] = [];
					}
					byType[match.type].push(match);
				}

				// Build display items
				const items: string[] = [];
				const types = ["TODO", "FIXME", "XXX", "HACK", "NOTE"];

				for (const type of types) {
					const typeMatches = byType[type];
					if (!typeMatches || typeMatches.length === 0) continue;

					items.push(`--- ${type} (${typeMatches.length}) ---`);
					for (const match of typeMatches) {
						const relPath = path.relative(ctx.cwd, match.file);
						items.push(`${relPath}:${match.line} - ${match.text}`);
					}
				}

				// Show in selector
				const title = filterPattern
					? `TODO Comments (filtered by "${filterPattern}")`
					: `TODO Comments (${matches.length} found)`;

				await ctx.ui.select(title, items);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to search for TODO comments";
				ctx.ui.notify(message, "error");
			}
		},
	});
}
